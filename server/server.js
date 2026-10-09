require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config(); // Fallback to process cwd if any
/**
 * LiveMail Classifier - Main Server
 * Real-time email categorization with Gmail API and NLP
 */

const express = require('express');
const http = require('http');

// Global error handlers to prevent server crashes from unhandled promise rejections (like MongoDB timeouts)
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { loadClassifier, isTrained } = require('./services/classifier');
const { pollAllUsers } = require('./services/gmailService');
const emailRoutes = require('./routes/emailRoutes');
const authRoutes = require('./routes/authRoutes');
const passport = require('./config/passport');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Enable trust proxy for Render / Heroku / HTTPS reverse proxies
app.set('trust proxy', 1);

// Socket.io setup with CORS
const io = new Server(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Store io in app for access in routes
app.set('io', io);

// Configuration
const PORT = process.env.PORT || 5000;
const POLL_INTERVAL = parseInt(process.env.GMAIL_POLL_INTERVAL) || 5000; // 5 seconds default for fast live inbox monitoring

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global process error handlers to prevent network connection drops from crashing server
process.on('unhandledRejection', (reason) => {
    console.warn('>>> [SERVER WARNING] Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
    console.warn('>>> [SERVER WARNING] Uncaught Exception:', err.message);
});

// Sessions
const isProd = process.env.NODE_ENV === 'production';
app.use(session({
    secret: process.env.SESSION_SECRET || 'livemail_dev_session_secret_key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        mongoOptions: { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 },
        ttl: 24 * 60 * 60,
    }),
    cookie: {
        secure: isProd, // Must be true in production HTTPS behind proxy
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Apply rate limiting to all API routes (generous limits for live email polling & websockets)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Generous limit to support rapid live polling and socket events
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/api', apiLimiter);

// Routes
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/', authRoutes); // Handles root /oauth2callback, /user, /logout
app.use('/api/emails', emailRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'LiveMail Classifier',
        version: '1.0.0'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'LiveMail Classifier API',
        endpoints: {
            health: '/api/health',
            emails: '/api/emails',
            stats: '/api/emails/stats',
            test: '/api/emails/test-broadcast'
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join a private room based on user email
    socket.on('join-room', (userEmail) => {
        if (userEmail) {
            const clean = userEmail.toLowerCase().trim();
            socket.join(`user:${clean}`);
            socket.join(`user:${userEmail}`);
            console.log(`Socket ${socket.id} joined room: user:${clean}`);
        }
    });

    // Helper to format standardized email payload
    const formatEmailPayload = (email) => {
        const id = email.gmailId || String(email._id || ('mail-' + Date.now()));
        const userEmail = email.userEmail || 'user@example.com';
        const sender = email.fromName || (email.from ? email.from.split('<')[0].trim() : 'Unknown Sender');
        const senderEmail = email.fromAddress || (email.from && email.from.includes('<') ? email.from.split('<')[1].replace('>', '').trim() : (email.from || ''));
        const body = email.bodyText || email.content || email.text || email.snippet || '';

        return {
            id,
            _id: String(email._id || id),
            gmailId: email.gmailId || id,
            gmailMessageId: email.gmailMessageId || email.gmailId || id,
            threadId: email.threadId || '',
            userEmail,
            sender: sender || 'Unknown Sender',
            senderEmail: senderEmail || '',
            from: email.from || sender,
            fromName: email.fromName || sender,
            fromAddress: email.fromAddress || senderEmail,
            recipient: email.to || userEmail,
            to: email.to || userEmail,
            subject: email.subject || 'No Subject',
            body,
            snippet: email.snippet || (body ? body.substring(0, 200) : email.subject || ''),
            content: email.content || body,
            text: email.text || body,
            html: email.html || '',
            timestamp: email.receivedAt || new Date(),
            receivedAt: email.receivedAt || new Date(),
            category: email.category || 'Primary',
            confidence: email.confidence || 0.9,
            classificationReason: email.classificationReason || '',
            priority: email.priority || 'Normal',
            importanceScore: email.importanceScore || 50,
            isImportant: !!email.isImportant,
            isRead: !!email.isRead,
            isStarred: !!email.isStarred,
            hasAttachment: !!(email.hasAttachment || email.hasAttachments),
            hasAttachments: !!(email.hasAttachment || email.hasAttachments),
            attachments: email.attachments || [],
            labels: email.labels || ['INBOX'],
            reminders: email.reminders || [],
            entities: email.entities || [],
            keywords: email.keywords || [],
            keyPhrases: email.keyPhrases || [],
            aiSummary: email.aiSummary || '',
            topic: email.topic || 'General',
            intent: email.intent || 'Information',
        };
    };

    const handleIncomingSocketEmail = async (email) => {
        if (!email) return;
        console.log(`Received incoming email on socket: ${email.subject}`);
        const Email = require('./models/Email');
        let emailToBroadcast = email;

        try {
            const userEmail = (email.userEmail || 'user@example.com').toLowerCase().trim();
            const gmailId = email.gmailId || email._id || ('socket-' + Date.now());
            const saved = await Email.findOneAndUpdate(
                { userEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') }, gmailId },
                {
                    $set: {
                        userEmail,
                        gmailId,
                        gmailMessageId: gmailId,
                        threadId: email.threadId || ('th-' + Date.now()),
                        from: email.from || 'Sender <sender@livemail.system>',
                        fromName: email.fromName || (email.from ? email.from.split('<')[0].trim() : ''),
                        fromAddress: email.fromAddress || (email.from && email.from.includes('<') ? email.from.split('<')[1].replace('>', '').trim() : ''),
                        to: email.to || userEmail,
                        subject: email.subject || 'New Message',
                        snippet: email.snippet || email.text || email.content || '',
                        content: email.content || email.text || '',
                        text: email.text || email.content || '',
                        bodyText: email.text || email.content || '',
                        html: email.html || '',
                        category: email.category || 'Primary',
                        confidence: email.confidence || 0.9,
                        isRead: !!email.isRead,
                        receivedAt: email.receivedAt ? new Date(email.receivedAt) : new Date(),
                        processedAt: new Date(),
                        reminders: email.reminders || [],
                    }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            if (saved) emailToBroadcast = saved;
        } catch (dbErr) {
            console.error('Socket new-email MongoDB persistence error:', dbErr.message);
        }

        const payload = formatEmailPayload(emailToBroadcast);
        if (payload.userEmail) {
            const clean = payload.userEmail.toLowerCase().trim();
            io.to(`user:${clean}`).emit('new_email', payload);
            io.to(`user:${payload.userEmail}`).emit('new_email', payload);
        }
        io.emit('new_email', payload);
    };

    // Listen for mock/test emails from testSocket.js and broadcast them
    socket.on('new-email', handleIncomingSocketEmail);
    socket.on('new_email', handleIncomingSocketEmail);

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Broadcast new email to all connected clients
const broadcastNewEmail = (email) => {
    const id = email.gmailId || String(email._id || ('mail-' + Date.now()));
    const payload = {
        id,
        _id: String(email._id || id),
        gmailId: email.gmailId || id,
        gmailMessageId: email.gmailMessageId || email.gmailId || id,
        threadId: email.threadId || '',
        userEmail: email.userEmail || 'user@example.com',
        sender: email.fromName || (email.from ? email.from.split('<')[0].trim() : 'Unknown Sender'),
        senderEmail: email.fromAddress || (email.from && email.from.includes('<') ? email.from.split('<')[1].replace('>', '').trim() : ''),
        from: email.from,
        fromName: email.fromName,
        fromAddress: email.fromAddress,
        recipient: email.to || '',
        to: email.to || '',
        subject: email.subject || 'No Subject',
        body: email.bodyText || email.content || email.snippet || '',
        content: email.content || '',
        snippet: email.snippet || '',
        text: email.text || '',
        html: email.html || '',
        category: email.category || 'Primary',
        confidence: email.confidence || 0.9,
        timestamp: email.receivedAt || new Date(),
        receivedAt: email.receivedAt || new Date(),
        priority: email.priority || 'Normal',
        importanceScore: email.importanceScore || 50,
        isImportant: !!email.isImportant,
        isRead: !!email.isRead,
        isStarred: !!email.isStarred,
        hasAttachment: !!(email.hasAttachment || email.hasAttachments),
        hasAttachments: !!(email.hasAttachment || email.hasAttachments),
        attachments: email.attachments || [],
        labels: email.labels || ['INBOX'],
        reminders: email.reminders || [],
    };
    if (payload.userEmail) {
        io.to(`user:${payload.userEmail}`).emit('new_email', payload);
        io.to(`user:${payload.userEmail}`).emit('new-email', payload);
    }
    io.emit('new_email', payload);
    io.emit('new-email', payload);
    console.log(`Broadcasted email to ${io.engine.clientsCount} clients: ${email.subject}`);
};

// Email polling system
let pollingInterval = null;

const startPolling = () => {
    console.log(`Starting email polling (interval: ${POLL_INTERVAL}ms)`);

    // Initial poll
    performPoll();

    // Set up recurring poll
    pollingInterval = setInterval(performPoll, POLL_INTERVAL);
};

let isPollingRunning = false;

const performPoll = async () => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        // Database not ready yet, skip this polling tick safely
        return;
    }

    if (isPollingRunning) {
        return; // Skip tick if previous poll is still actively running
    }

    isPollingRunning = true;

    try {
        await pollAllUsers(io);
    } catch (error) {
        console.error('Error during polling:', error);
    } finally {
        isPollingRunning = false;
    }
};

const stopPolling = () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('Email polling stopped');
    }
};

// Initialize application
const initializeApp = async () => {
    // Handle port in use gracefully
    let isRetrying = false;
    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            if (isRetrying) return;
            isRetrying = true;
            console.warn(`>>> [SERVER WARNING] Port ${PORT} is in use. Retrying in 1.5s...`);
            setTimeout(() => {
                isRetrying = false;
                try {
                    server.listen(PORT);
                } catch (_) {}
            }, 1500);
        } else {
            console.error('Server error:', e);
        }
    });

    // Start HTTP server immediately
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   📧 LiveMail Classifier Server                          ║
║                                                           ║
║   Server running on: http://localhost:${PORT}              ║
║   Socket.io: http://localhost:${PORT}                      ║
║   Environment: ${process.env.NODE_ENV || 'development'}                             ║
║                                                           ║
║   Endpoints:                                              ║
║   - GET /api/health                                       ║
║   - GET /api/emails                                       ║
║   - GET /api/emails/stats                                 ║
║                                                           ║
║   Polling interval: ${POLL_INTERVAL / 1000} seconds                            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
    });

    try {
        // Connect to MongoDB
        try {
            await connectDB();
            console.log('Database connected successfully.');
            // Start email polling only after DB is up
            startPolling();
        } catch (dbError) {
            console.error('MongoDB Connection Failed:', dbError.message);
            console.error('Server is running on port 5000, but database features are disabled.');
        }

        // Initialize NVIDIA NIM classifier
        try {
            await loadClassifier();
        } catch (classifierErr) {
            console.error('Classifier initialization error:', classifierErr.message);
        }

        // Graceful shutdown
        const shutdown = (signal) => {
            console.log(`${signal} received. Shutting down gracefully...`);
            stopPolling();
            server.close(() => {
                console.log('Server closed');
                if (signal === 'SIGUSR2') {
                    process.kill(process.pid, 'SIGUSR2');
                } else {
                    process.exit(0);
                }
            });
        };

        process.once('SIGUSR2', () => shutdown('SIGUSR2'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('Failed to initialize application modules:', error);
    }
};

// Start the application
initializeApp();

// Export for testing
module.exports = { app, server, io };