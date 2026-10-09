const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireAuth = require('../middleware/auth');
const Email = require('../models/Email');
const { classifyEmail, extractRemindersAI } = require('../services/classifier');
const { syncUserEmails, normalizeCategoryName, getGmailClient } = require('../services/gmailService');

// Per-user in-memory deleted email IDs blacklist (key: userEmail → Set of gmailIds)
const deletedEmailIds = new Map();

// Helper to get authenticated user from session or Bearer token
const getAuthUser = async (req) => {
    if (req.user && req.user.email) return req.user;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'undefined' && token !== 'null') {
            const User = require('../models/User');
            if (mongoose.Types.ObjectId.isValid(token) && token.length === 24) {
                const user = await User.findById(token).catch(() => null);
                if (user) return user;
            }
            const user = await User.findOne({ googleId: token }).catch(() => null);
            if (user) return user;
        }
    }
    return null;
};

/**
 * 1. GET /api/emails
 * Instantly returns stored emails from MongoDB.
 * Decoupled from Gmail API so it never blocks or requires internet for stored emails.
 */
router.get('/', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json({
                success: true,
                emails: [],
                count: 0,
                source: 'offline-fallback'
            });
        }

        const user = await getAuthUser(req);
        const userEmail = user?.email;
        const deleted = (userEmail && deletedEmailIds.get(userEmail)) || new Set();

        // User Email Scoping with case-insensitive regex & shared test emails support
        const cleanUserEmail = userEmail ? userEmail.trim().toLowerCase() : '';
        const dbQuery = cleanUserEmail
            ? {
                $or: [
                    { userEmail: { $regex: new RegExp(`^${cleanUserEmail.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } },
                    { userEmail: 'user@example.com' }
                ]
              }
            : {};

        let storedEmails = [];
        try {
            storedEmails = await Email.find(dbQuery)
                .sort({ receivedAt: -1 })
                .limit(500)
                .lean();
        } catch (dbErr) {
            console.error('MongoDB query error:', dbErr.message);
        }

        // Standardize flags
        let normalized = storedEmails.map(e => ({
            ...e,
            isArchived: !!e.isArchived,
            isTrash: !!e.isTrash,
            isRead: !!e.isRead,
            isStarred: !!e.isStarred,
            categoryCorrectedByUser: !!e.categoryCorrectedByUser
        }));

        // Filter out any permanently deleted emails
        let filtered = normalized.filter(e => !deleted.has(e.gmailId) && !deleted.has(String(e._id)));

        // Optional folder filter
        const folder = req.query.folder?.toLowerCase();
        if (folder === 'inbox') {
            filtered = filtered.filter(e => !e.isArchived && !e.isTrash);
        } else if (folder === 'starred') {
            filtered = filtered.filter(e => e.isStarred && !e.isTrash);
        } else if (folder === 'important') {
            filtered = filtered.filter(e => (e.isImportant || ['Critical', 'High', 'URGENT', 'IMPORTANT'].includes(e.priority)) && !e.isTrash);
        } else if (folder === 'archived') {
            filtered = filtered.filter(e => e.isArchived && !e.isTrash);
        } else if (folder === 'trash') {
            filtered = filtered.filter(e => e.isTrash);
        }

        // Optional category filter
        if (req.query.category && req.query.category !== 'All' && req.query.category !== 'Inbox') {
            filtered = filtered.filter(e => e.category === req.query.category);
        }

        return res.json({
            success: true,
            emails: filtered,
            count: filtered.length,
            source: 'database'
        });
    } catch (err) {
        console.error('Error in GET /api/emails:', err.message);
        return res.json({ success: true, emails: [], count: 0 });
    }
});

/**
 * 2. GET /api/emails/:id
 * Fetches a single email directly from MongoDB by its _id or gmailId.
 * Never calls Gmail API — ensures instant offline/online viewing of stored emails.
 */
router.get('/:id', async (req, res) => {
    try {
        const emailId = req.params.id;
        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Email ID required' });
        }

        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }

        const email = await Email.findOne({ $or: orConditions }).lean();
        if (!email) {
            return res.status(404).json({ success: false, message: 'Email not found in database' });
        }

        return res.json({ success: true, email });
    } catch (err) {
        console.error('Error in GET /api/emails/:id:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * 3. POST /api/emails/sync
 * Explicit on-demand sync with Gmail for the authenticated user.
 * Downloads new messages, parses complete bodies & attachments metadata, saves to MongoDB,
 * and emits real-time Socket.IO events for new emails.
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const io = req.app.get('io');
        const result = await syncUserEmails(user, io, 30);

        return res.json({
            success: true,
            synced: result.synced,
            newEmails: result.newEmails,
            message: `Successfully synchronized ${result.synced} new emails.`
        });
    } catch (err) {
        console.error('Error in POST /api/emails/sync:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * 4. POST /api/emails/live-store
 * Manually or programmatically store a live incoming email and broadcast
 */
router.post('/live-store', async (req, res) => {
    try {
        const {
            userEmail = req.user?.email || 'user@example.com',
            from = 'Sender <sender@livemail.system>',
            to = userEmail,
            cc = '',
            bcc = '',
            subject = 'New Message',
            content = '',
            snippet = '',
            text = '',
            html = '',
            category: customCategory,
            confidence: customConfidence,
            reminders: customReminders,
            labels = ['INBOX'],
        } = req.body;

        const emailText = text || content || snippet || '';
        const emailSnippet = snippet || (emailText ? emailText.substring(0, 200) : subject);

        // Classify if not provided
        let category = customCategory;
        let confidence = customConfidence || 0.9;
        if (!category || category === 'Uncategorized') {
            const classified = await classifyEmail(subject, emailSnippet);
            category = typeof classified === 'string' ? classified : (classified?.category || 'Uncategorized');
            if (typeof classified === 'object' && classified?.confidence) {
                confidence = classified.confidence;
            }
        }
        category = normalizeCategoryName(category);

        const reminders = customReminders || (await extractRemindersAI(subject, emailText));
        const gmailId = 'live-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

        const emailData = {
            userEmail,
            gmailId,
            threadId: 'th-' + Date.now(),
            from,
            to,
            cc,
            bcc,
            subject,
            snippet: emailSnippet,
            content: emailText,
            text: emailText,
            html: html || '',
            category,
            confidence,
            isRead: false,
            isStarred: false,
            isImportant: false,
            isSpam: category === 'Spam',
            receivedAt: new Date(),
            processedAt: new Date(),
            labels,
            hasAttachments: false,
            attachments: [],
            reminders: reminders || [],
        };

        let savedEmail;
        try {
            savedEmail = await Email.create(emailData);
        } catch (dbErr) {
            console.error('Error saving live email to MongoDB:', dbErr.message);
            savedEmail = { _id: gmailId, ...emailData };
        }

        // Live Socket Broadcast
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${userEmail}`).emit('new-email', savedEmail);
            io.emit('new-email', savedEmail);
            console.log(`📡 [Socket Broadcast] Live email broadcasted: "${subject}" (${category})`);
        }

        return res.json({ success: true, email: savedEmail });
    } catch (error) {
        console.error('Error in POST /api/emails/live-store:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 5. POST /api/emails/test-broadcast
 * Simulate a real-time incoming categorized email for testing
 */
router.post('/test-broadcast', async (req, res) => {
    try {
        const userEmail = req.user?.email || req.body.userEmail || 'user@example.com';
        const requestedCategory = req.body.category || 'Security';

        const templates = {
            Personal: {
                from: 'Sarah Miller <sarah.m@gmail.com>',
                subject: '🎉 Birthday Party & Weekend Get-together Invitation!',
                snippet: 'Hey! We are hosting a birthday dinner and weekend reunion this Saturday at 7 PM. Would love for you to join us!',
                text: 'Hey there!\n\nWe are hosting a birthday dinner and weekend reunion this Saturday at 7 PM. Let me know if you can make it, hope you can celebrate with the family!\n\nBest,\nSarah',
            },
            Primary: {
                from: 'Alex Vance <alex.vance@enterprise-corp.com>',
                subject: '📄 Q3 Project Proposal & Client Contract Deliverable',
                snippet: 'Please find attached the updated project agreement and contract deliverables for client approval by tomorrow.',
                text: 'Dear Team,\n\nPlease review the attached Q3 project proposal and contract agreement deliverables before our upcoming sync meeting tomorrow.\n\nWarm regards,\nAlex Vance\nLead Project Manager',
            },
            Finance: {
                from: 'Chase Bank Alerts <notify@chase-banking.com>',
                subject: '💳 Transaction Alert: $450.00 Payment Processed Successfully',
                snippet: 'Your recent account payment of $450.00 to Cloud Hosting Services was processed. View your current balance and statement.',
                text: 'Chase Banking Alert\n\nYour payment of $450.00 was authorized on your Visa ending in 8832. Transaction Reference #CH-99214. Current balance available.\n\nThank you for banking with us.',
            },
            Security: {
                from: 'Google Security Center <no-reply@accounts.google.com>',
                subject: '🚨 Critical Security Alert: New Sign-in Attempt from Unrecognized Device',
                snippet: 'A new sign-in was detected on your account from Windows Chrome in Singapore. If this was not you, secure your account immediately.',
                text: 'Security Alert for your account\n\nWe detected a new sign-in attempt on your account from an unrecognized Windows device. If this was not you, please verify your identity and reset your password immediately.',
            },
            'College / Student': {
                from: 'Registrar Office <academic@university.edu>',
                subject: '🎓 Fall Semester Exam Timetable & Course Registration Deadline',
                snippet: 'Final semester exam schedule has been published on the student portal. Submit your course assignment and registration by Friday.',
                text: 'University Academic Notice\n\nPlease be advised that the Fall semester final exam timetable is now accessible. Ensure all coursework and assignments are submitted prior to the deadline on Friday.\n\nOffice of the Registrar',
            },
            Spam: {
                from: 'Global Reward Bureau <claim@luckyprize-winners.net>',
                subject: '🎁 CONGRATULATIONS! You Won $1,000,000 Cash Prize Claim Now',
                snippet: 'Urgent notice: You have been selected as our top grand winner. Click here now to claim your bitcoin and free cash reward immediately!',
                text: 'Congratulations Winner!\n\nYou have been chosen for an exclusive cash lottery payout. Click the link to claim your reward before it expires in 24 hours!',
            },
            Promotions: {
                from: 'BestBuy Deals <deals@marketing.bestbuy.com>',
                subject: '🔥 Weekend Flash Sale: Up to 50% Off Electronics & Laptops',
                snippet: 'Huge savings this weekend only! Save up to $500 on top-tier laptops, headphones, and 4K displays. Free shipping on orders over $35.',
                text: 'Best Buy Exclusive Promotion\n\nDon\'t miss out on our limited-time weekend savings. Enjoy exclusive discounts, cashback rewards, and promo voucher code SAVE50 at checkout.\n\nShop the flash sale now!',
            },
            Social: {
                from: 'LinkedIn Notifications <invitations@linkedin.com>',
                subject: '🤝 Elena Rostova accepted your connection request',
                snippet: 'Elena Rostova (Senior Software Architect at CloudScale) is now a connection. Send a message to start a conversation.',
                text: 'LinkedIn Network Update\n\nElena Rostova accepted your invitation to connect. See what Elena and your other connections are sharing today on your network feed.\n\nView Elena\'s profile and congratulate them on their new role.',
            },
            Updates: {
                from: 'Amazon Delivery <shipment-tracking@amazon.com>',
                subject: '📦 Your Package has Shipped: Delivery expected tomorrow by 8 PM',
                snippet: 'Order #114-892184-9021 has been dispatched. Track your delivery and view shipping carrier status.',
                text: 'Amazon Order & Shipping Update\n\nYour recent order containing high-speed USB-C cables and workstation accessories has shipped via Prime Courier. Tracking number: TRK-99214810. View delivery progress and delivery instructions.\n\nThank you for shopping with us.',
            },
            'Other / Uncategorized': {
                from: 'System Operations <noreply@system-daemon.net>',
                subject: 'ℹ️ Routine System Maintenance Window Update',
                snippet: 'General system maintenance will occur this Sunday between 02:00 AM and 04:00 AM UTC. No action is required.',
                text: 'System Notice: Routine server maintenance scheduled for Sunday at 02:00 AM UTC.',
            },
        };

        const chosenTemplate = templates[requestedCategory] || templates['Security'];
        const subject = req.body.subject || chosenTemplate.subject;
        const from = req.body.from || chosenTemplate.from;
        const text = req.body.text || chosenTemplate.text;
        const snippet = req.body.snippet || chosenTemplate.snippet;
        const category = normalizeCategoryName(requestedCategory);

        const gmailId = 'test-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

        const emailDoc = {
            userEmail,
            gmailId,
            gmailMessageId: gmailId,
            threadId: 'th-test-' + Date.now(),
            from,
            fromName: from.split('<')[0].trim(),
            fromAddress: from.includes('<') ? from.split('<')[1].replace('>', '').trim() : from,
            to: userEmail,
            subject,
            snippet,
            text,
            content: text,
            bodyText: text,
            html: '',
            category,
            confidence: 0.96,
            classificationConfidence: 0.96,
            classificationReason: `Test email simulated for ${category} category testing.`,
            isRead: false,
            isStarred: false,
            isImportant: category === 'Security' || category === 'Finance',
            priority: (category === 'Security' || category === 'Finance') ? 'Critical' : 'Normal',
            importanceScore: (category === 'Security' || category === 'Finance') ? 90 : 50,
            isSpam: category === 'Spam',
            receivedAt: new Date(),
            processedAt: new Date(),
            labels: ['INBOX'],
            hasAttachments: false,
            attachments: [],
            reminders: (await extractRemindersAI(subject, text)) || [],
        };

        let savedEmail;
        try {
            savedEmail = await Email.create(emailDoc);
        } catch (dbErr) {
            console.error('MongoDB test broadcast save error:', dbErr.message);
            savedEmail = { _id: gmailId, ...emailDoc };
        }

        const standardizedPayload = {
            id: savedEmail.gmailId || String(savedEmail._id),
            _id: String(savedEmail._id || gmailId),
            gmailId: savedEmail.gmailId || gmailId,
            gmailMessageId: savedEmail.gmailId || gmailId,
            threadId: savedEmail.threadId || '',
            userEmail,
            sender: savedEmail.fromName || savedEmail.from,
            senderEmail: savedEmail.fromAddress || savedEmail.from,
            from: savedEmail.from,
            fromName: savedEmail.fromName,
            fromAddress: savedEmail.fromAddress,
            recipient: savedEmail.to || userEmail,
            to: savedEmail.to || userEmail,
            subject: savedEmail.subject,
            body: savedEmail.bodyText || savedEmail.content || savedEmail.snippet,
            snippet: savedEmail.snippet,
            content: savedEmail.content || savedEmail.text,
            text: savedEmail.text,
            html: savedEmail.html || '',
            timestamp: savedEmail.receivedAt,
            receivedAt: savedEmail.receivedAt,
            category: savedEmail.category,
            confidence: savedEmail.confidence || 0.96,
            classificationReason: savedEmail.classificationReason,
            priority: savedEmail.priority || 'Normal',
            importanceScore: savedEmail.importanceScore || 50,
            isImportant: !!savedEmail.isImportant,
            isRead: false,
            isStarred: false,
            hasAttachment: false,
            hasAttachments: false,
            attachments: [],
            labels: ['INBOX'],
            reminders: savedEmail.reminders || [],
            entities: savedEmail.entities || [],
            keywords: savedEmail.keywords || [],
            keyPhrases: savedEmail.keyPhrases || [],
            aiSummary: savedEmail.aiSummary || savedEmail.snippet,
            topic: savedEmail.topic || 'General',
            intent: savedEmail.intent || 'Information',
        };

        // Emit Socket Broadcast
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${userEmail}`).emit('new_email', standardizedPayload);
            io.to(`user:${userEmail}`).emit('new-email', standardizedPayload);
            io.emit('new_email', standardizedPayload);
            io.emit('new-email', standardizedPayload);
            console.log(`🔔 [Test Broadcast] Sent live test email: ${subject} (${category})`);
        }

        return res.json({ success: true, email: standardizedPayload });
    } catch (err) {
        console.error('Error in POST /api/emails/test-broadcast:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * 6. PATCH /api/emails/:id/read - Mark an email as read
 */
router.patch('/:id/read', async (req, res) => {
    try {
        const emailId = req.params.id;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }

        await Email.updateMany(
            { $or: orConditions },
            { $set: { isRead: true } }
        ).catch(() => {});

        return res.json({ success: true, message: 'Email marked as read', id: emailId });
    } catch (error) {
        console.error('Error marking email as read:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 7. PATCH /api/emails/:id/unread - Mark an email as unread
 */
router.patch('/:id/unread', async (req, res) => {
    try {
        const emailId = req.params.id;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }

        await Email.updateMany(
            { $or: orConditions },
            { $set: { isRead: false } }
        ).catch(() => {});

        return res.json({ success: true, message: 'Email marked as unread', id: emailId });
    } catch (error) {
        console.error('Error marking email as unread:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8. PATCH /api/emails/:id/star - Toggle / update starred status
 */
router.patch('/:id/star', async (req, res) => {
    try {
        const emailId = req.params.id;
        const { isStarred } = req.body;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }

        let updatedEmail;
        if (typeof isStarred === 'boolean') {
            updatedEmail = await Email.findOneAndUpdate(
                { $or: orConditions },
                { $set: { isStarred } },
                { new: true }
            );
        } else {
            const found = await Email.findOne({ $or: orConditions });
            if (found) {
                found.isStarred = !found.isStarred;
                await found.save();
                updatedEmail = found;
            }
        }

        return res.json({
            success: true,
            message: 'Email starred status updated',
            isStarred: updatedEmail ? updatedEmail.isStarred : isStarred,
            id: emailId
        });
    } catch (error) {
        console.error('Error toggling star on email:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8b. PATCH /api/emails/:id/archive - Archive email
 */
router.patch('/:id/archive', async (req, res) => {
    try {
        const emailId = req.params.id;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }
        await Email.updateMany(
            { $or: orConditions },
            { $set: { isArchived: true, isTrash: false } }
        );
        return res.json({ success: true, message: 'Email archived', id: emailId });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8c. PATCH /api/emails/:id/unarchive - Move email from archive back to Inbox
 */
router.patch('/:id/unarchive', async (req, res) => {
    try {
        const emailId = req.params.id;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }
        await Email.updateMany(
            { $or: orConditions },
            { $set: { isArchived: false } }
        );
        return res.json({ success: true, message: 'Email moved back to Inbox', id: emailId });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8d. PATCH /api/emails/:id/trash - Move email to Trash
 */
router.patch('/:id/trash', async (req, res) => {
    try {
        const emailId = req.params.id;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }
        await Email.updateMany(
            { $or: orConditions },
            { $set: { isTrash: true, isArchived: false } }
        );
        return res.json({ success: true, message: 'Email moved to Trash', id: emailId });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8e. PATCH /api/emails/:id/restore - Restore email from Trash or Archive to Inbox
 */
router.patch('/:id/restore', async (req, res) => {
    try {
        const emailId = req.params.id;
        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }
        await Email.updateMany(
            { $or: orConditions },
            { $set: { isTrash: false, isArchived: false } }
        );
        return res.json({ success: true, message: 'Email restored to Inbox', id: emailId });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8f. PATCH /api/emails/:id/category - Manually correct category & learn from user input
 */
router.patch('/:id/category', async (req, res) => {
    try {
        const emailId = req.params.id;
        const { category, reason } = req.body;
        if (!category) {
            return res.status(400).json({ success: false, message: 'Category is required' });
        }

        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }

        const found = await Email.findOne({ $or: orConditions });
        if (!found) {
            return res.status(404).json({ success: false, message: 'Email not found' });
        }

        const prevCat = found.category;
        if (!found.originalCategory) {
            found.originalCategory = prevCat;
        }
        found.category = category;
        found.categoryCorrectedByUser = true;
        found.correctionReason = reason || 'User manual override';
        await found.save();

        // Save into CategoryCorrection collection for adaptive future classification
        try {
            const CategoryCorrection = require('../models/CategoryCorrection');
            const senderRaw = found.fromAddress || (found.from?.includes('<') ? found.from.split('<')[1].replace('>', '').trim().toLowerCase() : found.from?.toLowerCase() || '');
            const senderEmail = senderRaw.trim().toLowerCase();
            const domain = senderEmail.includes('@') ? senderEmail.split('@')[1] : '';

            if (senderEmail) {
                await CategoryCorrection.findOneAndUpdate(
                    { userEmail: found.userEmail, senderEmail },
                    {
                        $set: {
                            userEmail: found.userEmail,
                            senderEmail,
                            senderDomain: domain,
                            originalCategory: found.originalCategory || prevCat,
                            correctedCategory: category,
                            reason: reason || 'User manual override',
                            lastAppliedAt: new Date()
                        },
                        $inc: { appliedCount: 1 }
                    },
                    { upsert: true, new: true }
                );
            }
        } catch (corrErr) {
            console.error('Error saving CategoryCorrection:', corrErr.message);
        }

        return res.json({
            success: true,
            message: `Email reclassified to ${category}`,
            email: found
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8g. POST /api/emails/undo-category-correction - Revert category back to original
 */
router.post('/undo-category-correction', async (req, res) => {
    try {
        const { emailId } = req.body;
        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Email ID is required' });
        }

        const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
            orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
        }

        const found = await Email.findOne({ $or: orConditions });
        if (!found) {
            return res.status(404).json({ success: false, message: 'Email not found' });
        }

        const original = found.originalCategory || 'Primary';
        found.category = original;
        found.categoryCorrectedByUser = false;
        found.originalCategory = '';
        await found.save();

        return res.json({
            success: true,
            message: `Category reverted to ${original}`,
            email: found
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8h. GET /api/emails/corrections - Get all user category corrections for review
 */
router.get('/corrections', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const userEmail = user?.email || 'user@example.com';
        const CategoryCorrection = require('../models/CategoryCorrection');

        const rules = await CategoryCorrection.find({
            userEmail: { $regex: new RegExp(`^${userEmail.trim()}$`, 'i') }
        }).sort({ updatedAt: -1 }).limit(50).lean().catch(() => []);

        const correctedEmails = await Email.find({
            categoryCorrectedByUser: true,
            $or: [
                { userEmail: { $regex: new RegExp(`^${userEmail.trim()}$`, 'i') } },
                { userEmail: 'user@example.com' }
            ]
        }).sort({ updatedAt: -1 }).limit(50).lean().catch(() => []);

        return res.json({
            success: true,
            rules,
            emails: correctedEmails
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 8i. POST /api/emails/batch-sync-actions - Sync batch of actions performed offline
 */
router.post('/batch-sync-actions', async (req, res) => {
    try {
        const { actions = [] } = req.body;
        if (!Array.isArray(actions) || actions.length === 0) {
            return res.json({ success: true, processed: 0 });
        }

        let processed = 0;
        for (const item of actions) {
            const { action, emailId, payload = {} } = item;
            if (!emailId || !action) continue;

            const orConditions = [{ gmailId: emailId }, { gmailMessageId: emailId }];
            if (mongoose.Types.ObjectId.isValid(emailId) && emailId.length === 24) {
                orConditions.push({ _id: new mongoose.Types.ObjectId(emailId) });
            }

            if (action === 'read') {
                await Email.updateMany({ $or: orConditions }, { $set: { isRead: true } }).catch(() => {});
            } else if (action === 'unread') {
                await Email.updateMany({ $or: orConditions }, { $set: { isRead: false } }).catch(() => {});
            } else if (action === 'star') {
                await Email.updateMany({ $or: orConditions }, { $set: { isStarred: !!payload.isStarred } }).catch(() => {});
            } else if (action === 'archive') {
                await Email.updateMany({ $or: orConditions }, { $set: { isArchived: true, isTrash: false } }).catch(() => {});
            } else if (action === 'unarchive') {
                await Email.updateMany({ $or: orConditions }, { $set: { isArchived: false } }).catch(() => {});
            } else if (action === 'trash') {
                await Email.updateMany({ $or: orConditions }, { $set: { isTrash: true, isArchived: false } }).catch(() => {});
            } else if (action === 'restore') {
                await Email.updateMany({ $or: orConditions }, { $set: { isTrash: false, isArchived: false } }).catch(() => {});
            } else if (action === 'category' && payload.category) {
                await Email.updateMany(
                    { $or: orConditions },
                    { $set: { category: payload.category, categoryCorrectedByUser: true } }
                ).catch(() => {});
            }
            processed++;
        }

        return res.json({ success: true, processed });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 9. POST /api/emails/send - Send an email via Gmail API
 */
router.post('/send', requireAuth, async (req, res) => {
    try {
        const { to, subject, body, message } = req.body;
        const emailBody = body || message || '';
        const user = req.user;

        if (!user || !user.accessToken) {
            return res.status(401).json({ success: false, message: 'Google access token missing. Please login with Google.' });
        }

        if (!to || !subject) {
            return res.status(400).json({ success: false, message: 'Missing required fields: to, subject' });
        }

        const gmail = getGmailClient(user);

        const utf8Subject = `=?utf-8?B?${Buffer.from(subject || 'No Subject').toString('base64')}?=`;
        const sender = user.displayName ? `"${user.displayName}" <${user.email}>` : `<${user.email}>`;
        const messageParts = [
            `From: ${sender}`,
            `To: <${to}>`,
            `Date: ${new Date().toUTCString()}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: 8bit',
            `Subject: ${utf8Subject}`,
            '',
            emailBody,
        ];
        const rawMessage = messageParts.join('\r\n');
        const encodedMessage = Buffer.from(rawMessage)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const sentResult = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMessage },
        });

        // Save sent message into MongoDB so it persists in the user's database
        const sentGmailId = sentResult.data.id || ('sent-' + Date.now());
        const sentEmailDoc = {
            userEmail: user.email,
            gmailId: sentGmailId,
            gmailMessageId: sentGmailId,
            threadId: sentResult.data.threadId || ('th-' + Date.now()),
            from: sender,
            fromName: user.displayName || user.email,
            fromAddress: user.email,
            to: to,
            subject: subject,
            snippet: emailBody.substring(0, 200),
            content: emailBody,
            text: emailBody,
            html: emailBody,
            category: 'Primary',
            confidence: 0.99,
            isRead: true,
            isStarred: false,
            isImportant: false,
            isSpam: false,
            receivedAt: new Date(),
            processedAt: new Date(),
            labels: ['SENT'],
            hasAttachments: false,
            attachments: [],
            reminders: []
        };

        try {
            await Email.create(sentEmailDoc);
        } catch (dbErr) {
            console.error('Error persisting sent email to MongoDB:', dbErr.message);
        }

        return res.json({ success: true, result: sentResult.data, sentEmail: sentEmailDoc });
    } catch (error) {
        console.error('Error in POST /api/emails/send:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 10. GET /api/emails/stats - Category and folder stats from stored emails
 */
router.get('/stats', async (req, res) => {
    try {
        const user = await getAuthUser(req);
        const userEmail = user?.email;
        let query = {};
        if (userEmail) {
            query = {
                $or: [
                    { userEmail: { $regex: new RegExp(`^${userEmail.trim()}$`, 'i') } },
                    { userEmail: 'user@example.com' }
                ]
            };
        }

        const total = await Email.countDocuments(query);
        const unread = await Email.countDocuments({ ...query, isRead: false, isTrash: { $ne: true } });
        const inbox = await Email.countDocuments({ ...query, isTrash: { $ne: true }, isArchived: { $ne: true } });
        const starred = await Email.countDocuments({ ...query, isStarred: true, isTrash: { $ne: true } });
        const important = await Email.countDocuments({ ...query, isImportant: true, isTrash: { $ne: true } });
        const archived = await Email.countDocuments({ ...query, isArchived: true, isTrash: { $ne: true } });
        const trash = await Email.countDocuments({ ...query, isTrash: true });

        const categories = {
            Primary: await Email.countDocuments({ ...query, category: { $in: ['Primary', 'Business'] }, isTrash: { $ne: true } }),
            Promotions: await Email.countDocuments({ ...query, category: 'Promotions', isTrash: { $ne: true } }),
            Social: await Email.countDocuments({ ...query, category: 'Social', isTrash: { $ne: true } }),
            Updates: await Email.countDocuments({ ...query, category: 'Updates', isTrash: { $ne: true } }),
            Personal: await Email.countDocuments({ ...query, category: 'Personal', isTrash: { $ne: true } }),
            Finance: await Email.countDocuments({ ...query, category: 'Finance', isTrash: { $ne: true } }),
            'College / Student': await Email.countDocuments({ ...query, category: { $in: ['College / Student', 'School / College'] }, isTrash: { $ne: true } }),
            Security: await Email.countDocuments({ ...query, category: 'Security', isTrash: { $ne: true } }),
            Spam: await Email.countDocuments({ ...query, category: 'Spam', isTrash: { $ne: true } }),
            'Other / Uncategorized': await Email.countDocuments({ ...query, category: { $in: ['Other / Uncategorized', 'Uncategorized', 'Other'] }, isTrash: { $ne: true } }),
        };

        return res.json({
            success: true,
            stats: {
                total,
                unread,
                folders: { inbox, starred, important, archived, trash },
                categories
            }
        });
    } catch (error) {
        return res.json({
            success: true,
            stats: {
                total: 0,
                unread: 0,
                folders: { inbox: 0, starred: 0, important: 0, archived: 0, trash: 0 },
                categories: { Primary: 0, Promotions: 0, Social: 0, Updates: 0, Personal: 0, Finance: 0, 'College / Student': 0, Security: 0, Spam: 0, 'Other / Uncategorized': 0 },
            },
        });
    }
});

/**
 * 11. DELETE /api/emails/:id - Delete an email from MongoDB, Gmail Trash, and session blacklist
 */
router.delete('/:id', async (req, res) => {
    try {
        const emailId = req.params.id;
        const user = req.user;
        const userEmail = user?.email || 'user@example.com';

        if (!emailId) {
            return res.status(400).json({ success: false, message: 'Email ID is required' });
        }

        const orConditions = [{ gmailId: emailId }];
        if (mongoose.Types.ObjectId.isValid(emailId)) {
            orConditions.push({ _id: emailId });
        }

        // Find email in DB to get both gmailId and _id
        let targetGmailId = emailId;
        try {
            const found = await Email.findOne({ $or: orConditions }).lean();
            if (found) {
                if (found.gmailId) targetGmailId = found.gmailId;
                if (!deletedEmailIds.has(userEmail)) {
                    deletedEmailIds.set(userEmail, new Set());
                }
                if (found.gmailId) deletedEmailIds.get(userEmail).add(found.gmailId);
                if (found._id) deletedEmailIds.get(userEmail).add(String(found._id));
            }
        } catch (_) {}

        // Blacklist locally
        if (!deletedEmailIds.has(userEmail)) {
            deletedEmailIds.set(userEmail, new Set());
        }
        deletedEmailIds.get(userEmail).add(emailId);
        deletedEmailIds.get(userEmail).add(targetGmailId);

        // Delete from MongoDB
        try {
            await Email.deleteMany({ $or: orConditions });
            console.log(`🗑️ [MongoDB Delete] Removed email ${emailId} (${targetGmailId}) from database`);
        } catch (dbErr) {
            console.error('MongoDB delete error:', dbErr.message);
        }

        // If user has active Gmail OAuth credentials, trash the message on Gmail
        if (user && user.accessToken && !targetGmailId.startsWith('seed-') && !targetGmailId.startsWith('test-') && !targetGmailId.startsWith('live-')) {
            try {
                const gmail = getGmailClient(user);
                await gmail.users.messages.trash({
                    userId: 'me',
                    id: targetGmailId
                });
                console.log(`🗑️ [Gmail Trash] Moved message ${targetGmailId} to Gmail Trash`);
            } catch (gmailErr) {
                console.log(`[Gmail Trash Notice] Could not trash on Gmail: ${gmailErr.message}`);
            }
        }

        return res.json({ success: true, message: 'Email deleted successfully', id: emailId });
    } catch (error) {
        console.error('Error in DELETE /api/emails/:id:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;