const { google } = require('googleapis');
const { simpleParser } = require('mailparser');
const Email = require('../models/Email');
const User = require('../models/User');
const { classifyEmail, extractRemindersAI } = require('./classifier');

/**
 * Get an authorized Gmail client for a specific user
 * @param {Object} user - User document from DB
 * @returns {Object} - Gmail API instance
 */
const getGmailClient = (user) => {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/oauth2callback'
    );

    const refreshToken = user.refreshToken || process.env.GOOGLE_REFRESH_TOKEN || '';
    const credentials = {};
    if (user.accessToken) credentials.access_token = user.accessToken;
    if (refreshToken) credentials.refresh_token = refreshToken;

    oauth2Client.setCredentials(credentials);

    // Auto-update user tokens on token refresh
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            user.accessToken = tokens.access_token;
            if (tokens.refresh_token) {
                user.refreshToken = tokens.refresh_token;
            }
            try {
                await User.findOneAndUpdate(
                    { $or: [{ _id: user._id }, { email: user.email }, { googleId: user.googleId }] },
                    { 
                        $set: { 
                            accessToken: tokens.access_token,
                            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {})
                        } 
                    }
                );
            } catch (_) {}
        }
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
};

/**
 * Helper to parse sender info into name and email
 */
const parseSender = (fromStr) => {
    if (!fromStr) return { fromName: '', fromAddress: 'Unknown' };
    const match = fromStr.match(/(.*?)\s*<(.+?)>/);
    if (match) {
        return {
            fromName: match[1].replace(/["']/g, '').trim(),
            fromAddress: match[2].trim()
        };
    }
    return { fromName: fromStr.trim(), fromAddress: fromStr.trim() };
};

/**
 * Helper: Normalize category to standard set
 */
const normalizeCategoryName = (cat) => {
    if (!cat) return 'Other / Uncategorized';
    const c = String(cat).trim().toLowerCase();
    if (c.includes('promo') || c.includes('deal') || c.includes('offer') || c.includes('coupon') || c.includes('discount')) return 'Promotions';
    if (c.includes('social') || c.includes('network') || c.includes('community')) return 'Social';
    if (c.includes('update') || c.includes('notice') || c.includes('receipt') || c.includes('statement')) return 'Updates';
    if (c.includes('personal')) return 'Personal';
    if (c.includes('finance') || c.includes('banking') || c.includes('payment')) return 'Finance';
    if (c.includes('security') || c.includes('alert') || c.includes('password') || c.includes('otp')) return 'Security';
    if (c.includes('school') || c.includes('college') || c.includes('student') || c.includes('academic') || c.includes('exam')) return 'College / Student';
    if (c.includes('spam') || c.includes('phishing') || c.includes('lottery')) return 'Spam';
    if (c.includes('primary') || c.includes('business') || c.includes('work') || c.includes('client') || c.includes('project')) return 'Primary';
    return 'Other / Uncategorized';
};

/**
 * Helper: Compute priority and importance based on labels, category & subject keywords
 */
const computeEmailPriority = (subject, text, category, isImportantLabel) => {
    const combined = `${subject || ''} ${text || ''}`.toLowerCase();
    
    // Urgent keywords
    const urgentRegex = /\b(urgent|critical|immediately|emergency|action required|security alert|fraud alert|breach|password reset|verify account|otp|suspicious activity|due today|deadline today)\b/i;
    if (urgentRegex.test(combined) || category === 'Security') {
        return { isImportant: true, priority: 'URGENT' };
    }
    
    // Important keywords
    const importantRegex = /\b(important|asap|priority|deadline|payment overdue|invoice|contract|proposal|exam|final exam|assignment due|meeting invite|interview)\b/i;
    if (importantRegex.test(combined) || isImportantLabel || category === 'Finance') {
        return { isImportant: true, priority: 'IMPORTANT' };
    }
    
    if (category === 'Spam') {
        return { isImportant: false, priority: 'LOW' };
    }
    
    return { isImportant: false, priority: 'NORMAL' };
};

const { processEmailNLP } = require('./nlpEngine');

/**
 * Fetch full message details and parse complete body + metadata + deep NLP
 */
const fetchMessageDetails = async (gmail, messageId) => {
    try {
        const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'raw'
        });

        const rawMessage = response.data.raw;
        const messageBuffer = Buffer.from(rawMessage, 'base64url');
        const parsed = await simpleParser(messageBuffer);

        const fromText = parsed.from?.text || parsed.from?.value?.[0]?.address || 'Unknown Sender';
        const { fromName, fromAddress } = parseSender(fromText);
        const subject = parsed.subject || 'No Subject';
        const plainText = parsed.text || '';
        const htmlBody = parsed.html || '';
        const snippet = (plainText || '').substring(0, 250) || (parsed.snippet || subject);

        // Attachment metadata
        const attachments = (parsed.attachments || []).map(att => ({
            filename: att.filename || 'attachment',
            mimeType: att.contentType || 'application/octet-stream',
            size: att.size || 0,
            attachmentId: att.checksum || ''
        }));

        const isRead = !response.data.labelIds?.includes('UNREAD');
        const isStarred = response.data.labelIds?.includes('STARRED') || false;
        const isSpamLabel = response.data.labelIds?.includes('SPAM') || false;

        // Run Advanced NLP Pipeline (Keywords, Key Phrases, Entities, Sentiment, Category, Importance Score)
        const nlp = processEmailNLP(subject, plainText || snippet, response.data.labelIds || [], attachments.length > 0, fromText);

        // Reminders / tasks extraction
        const reminders = await extractRemindersAI(subject, plainText || snippet);

        let receivedAt = parsed.date;
        if (!receivedAt || isNaN(new Date(receivedAt).getTime())) {
            if (response.data.internalDate) {
                receivedAt = new Date(parseInt(response.data.internalDate, 10));
            } else {
                receivedAt = new Date();
            }
        }

        return {
            gmailId: messageId,
            gmailMessageId: messageId,
            threadId: response.data.threadId || parsed.messageId || '',
            from: fromText,
            fromName,
            fromAddress,
            to: parsed.to?.text || '',
            cc: parsed.cc?.text || '',
            bcc: parsed.bcc?.text || '',
            subject,
            snippet,
            text: plainText,
            html: htmlBody,
            content: plainText || snippet,
            bodyText: plainText,
            bodyHtml: htmlBody,
            category: nlp.category,
            topic: nlp.topic,
            intent: nlp.intent,
            requiresAction: nlp.requiresAction,
            requiredAction: nlp.requiredAction || nlp.actionDescription,
            actionDescription: nlp.actionDescription || nlp.requiredAction,
            deadline: nlp.deadline,
            confidence: nlp.confidence,
            classificationConfidence: nlp.classificationConfidence,
            classificationReason: nlp.classificationReason,
            aiSummary: nlp.aiSummary,
            priority: nlp.priority,
            importanceScore: nlp.importanceScore,
            isImportant: nlp.isImportant,
            sentiment: nlp.sentiment,
            sentimentScore: nlp.sentimentScore,
            keywords: nlp.keywords,
            keywordScores: nlp.keywordScores,
            keyPhrases: nlp.keyPhrases,
            entities: nlp.entities,
            isRead,
            isStarred,
            isSpam: isSpamLabel || nlp.category === 'Spam',
            receivedAt,
            processedAt: new Date(),
            labels: response.data.labelIds || [],
            hasAttachments: attachments.length > 0,
            attachments,
            reminders: reminders || []
        };
    } catch (error) {
        console.error(`Error processing message ${messageId}:`, error.message);
        return null;
    }
};

// Concurrency lock to prevent overlapping sync operations per user
const activeSyncLocks = new Set();
// Notification deduplication cache to guarantee zero duplicate emits
const notifiedKeys = new Set();

/**
 * Fetch and synchronize emails for a specific user safely into MongoDB.
 * Ensures duplicate prevention by checking existing gmailId before inserting,
 * uses incremental lookback checkpointing, and emits socket events ONLY for new emails.
 */
const syncUserEmails = async (user, io = null, maxResults = 20, forceFull = false) => {
    const hasRefreshToken = !!(user?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN);
    if (!user || (!user.accessToken && !hasRefreshToken) || !user.email) {
        return { synced: 0, newEmails: [] };
    }

    const userEmail = (user.email || '').toLowerCase().trim();

    // Prevent overlapping sync operations for the same user
    if (activeSyncLocks.has(userEmail)) {
        return { synced: 0, newEmails: [], message: 'Sync already in progress' };
    }

    activeSyncLocks.add(userEmail);

    try {
        const gmail = getGmailClient(user);

        // Fetch top recent messages from inbox (fast, newest first)
        let response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: Math.max(25, maxResults),
            q: 'in:inbox'
        });

        const messages = response.data.messages || [];
        if (messages.length === 0) {
            if (user._id && String(user._id) !== 'default_google_user') {
                await User.updateOne({ _id: user._id }, { $set: { lastSyncTimestamp: new Date() } }).catch(() => {});
            }
            return { synced: 0, newEmails: [] };
        }

        const newSavedEmails = [];

        for (const msg of messages) {
            try {
                // Check if already stored in MongoDB before downloading/parsing raw body or classifying
                const existing = await Email.exists({
                    userEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') },
                    $or: [{ gmailId: msg.id }, { gmailMessageId: msg.id }]
                });
                if (existing) {
                    continue; // Skip already stored email to avoid duplicate processing & socket noise
                }

                // Fetch full raw details only for genuinely new message
                const emailData = await fetchMessageDetails(gmail, msg.id);
                if (!emailData) continue;

                // Safe upsert in MongoDB
                const saved = await Email.findOneAndUpdate(
                    { userEmail: { $regex: new RegExp(`^${userEmail}$`, 'i') }, gmailId: msg.id },
                    { $set: { ...emailData, userEmail, gmailMessageId: msg.id } },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (saved) {
                    newSavedEmails.push(saved);

                    // Standardized payload
                    const standardizedPayload = {
                        id: saved.gmailId || String(saved._id),
                        _id: String(saved._id),
                        gmailId: saved.gmailId,
                        gmailMessageId: saved.gmailMessageId || saved.gmailId,
                        threadId: saved.threadId || '',
                        userEmail,
                        sender: saved.fromName || saved.from || 'Unknown Sender',
                        senderEmail: saved.fromAddress || saved.from || '',
                        from: saved.from,
                        fromName: saved.fromName,
                        fromAddress: saved.fromAddress,
                        recipient: saved.to || userEmail,
                        to: saved.to || userEmail,
                        subject: saved.subject || 'No Subject',
                        body: saved.bodyText || saved.content || saved.snippet || '',
                        snippet: saved.snippet || '',
                        content: saved.content || saved.text || '',
                        text: saved.text || saved.content || '',
                        html: saved.html || '',
                        timestamp: saved.receivedAt,
                        receivedAt: saved.receivedAt,
                        category: saved.category,
                        confidence: saved.confidence || 0.9,
                        classificationReason: saved.classificationReason || '',
                        priority: saved.priority || 'Normal',
                        importanceScore: saved.importanceScore || 50,
                        isImportant: !!saved.isImportant,
                        isRead: !!saved.isRead,
                        isStarred: !!saved.isStarred,
                        hasAttachment: !!saved.hasAttachments,
                        hasAttachments: !!saved.hasAttachments,
                        attachments: saved.attachments || [],
                        labels: saved.labels || ['INBOX'],
                        reminders: saved.reminders || [],
                        entities: saved.entities || [],
                        keywords: saved.keywords || [],
                        keyPhrases: saved.keyPhrases || [],
                        aiSummary: saved.aiSummary || '',
                        topic: saved.topic || 'General',
                        intent: saved.intent || 'Information',
                    };

                    // Emit real-time notification once to the specific user's room and globally
                    const notifKey = `${userEmail}:${msg.id}`;
                    if (!notifiedKeys.has(notifKey)) {
                        notifiedKeys.add(notifKey);
                        if (io) {
                            io.to(`user:${userEmail}`).emit('new_email', standardizedPayload);
                            io.to(`user:${user.email}`).emit('new_email', standardizedPayload);
                            io.emit('new_email', standardizedPayload);
                            console.log(`⚡ [Real-time Sync] New email stored & broadcasted: "${saved.subject}" (${saved.category})`);
                        }
                        if (notifiedKeys.size > 5000) {
                            const oldest = Array.from(notifiedKeys).slice(0, 1000);
                            oldest.forEach(k => notifiedKeys.delete(k));
                        }
                    }
                }
            } catch (msgErr) {
                console.error(`Error syncing message ${msg.id} for ${userEmail}:`, msgErr.message);
            }
        }

        // Advance sync checkpoint after successful processing
        if (user._id && String(user._id) !== 'default_google_user') {
            await User.updateOne({ _id: user._id }, { $set: { lastSyncTimestamp: new Date() } }).catch(() => {});
        }
        authFailedUsers.delete(userEmail);

        return { synced: newSavedEmails.length, newEmails: newSavedEmails };
    } catch (error) {
        if (error.message.includes('invalid_client') || error.message.includes('invalid_grant')) {
            if (!authFailedUsers.has(userEmail)) {
                authFailedUsers.add(userEmail);
                console.warn(`[Gmail Sync] Re-authentication required for ${userEmail}: ${error.message}. Please sign in with Google.`);
            }
        } else {
            console.error(`Error syncing emails for ${userEmail}:`, error.message);
        }
        return { synced: 0, newEmails: [], error: error.message };
    } finally {
        activeSyncLocks.delete(userEmail);
    }
};

const authFailedUsers = new Set();

/**
 * Clear auth failure flag for a user when they re-authenticate
 */
const clearAuthFailureFlag = (email) => {
    if (email) {
        authFailedUsers.delete(email.toLowerCase().trim());
    }
};

/**
 * Background polling for all registered users
 */
const pollAllUsers = async (io) => {
    try {
        const query = process.env.GOOGLE_REFRESH_TOKEN
            ? {}
            : {
                $or: [
                    { refreshToken: { $exists: true, $ne: '' } },
                    { accessToken: { $exists: true, $ne: '' } }
                ]
            };
        let users = await User.find(query);

        // Also check in-memory active tokens if DB is empty
        if (users.length === 0 && global.activeTokens && global.activeTokens.size > 0) {
            const memoryUsers = Array.from(global.activeTokens.values()).filter(u => u && (u.refreshToken || u.accessToken));
            const uniqueMemoryUsers = [];
            const seen = new Set();
            for (const mu of memoryUsers) {
                if (mu.email && !seen.has(mu.email.toLowerCase())) {
                    seen.add(mu.email.toLowerCase());
                    uniqueMemoryUsers.push(mu);
                }
            }
            if (uniqueMemoryUsers.length > 0) {
                users = uniqueMemoryUsers;
            }
        }

        // Filter out users whose tokens have failed with invalid_grant/invalid_client
        const activeUsers = users.filter(u => u && u.email && !authFailedUsers.has(u.email.toLowerCase().trim()));

        if (activeUsers.length > 0) {
            console.log(`[Gmail Background Poll] Checking inbox for ${activeUsers.length} active users...`);
        }

        for (const user of activeUsers) {
            try {
                await syncUserEmails(user, io, 15);
            } catch (userError) {
                console.error(`Error in poll loop for ${user.email}:`, userError.message);
            }
        }
    } catch (error) {
        console.error('Error in pollAllUsers:', error.message);
    }
};

/**
 * Send a new email
 */
const sendEmail = async (user, { to, subject, body }) => {
    try {
        const gmail = getGmailClient(user);
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject || 'No Subject').toString('base64')}?=`;
        const sender = user.displayName ? `"${user.displayName}" <${user.email}>` : `<${user.email}>`;
        const messageParts = [
            `From: ${sender}`,
            `To: ${to}`,
            `Date: ${new Date().toUTCString()}`,
            `Subject: ${utf8Subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            body || '',
        ];
        const message = messageParts.join('\r\n');
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMessage }
        });
        return res.data;
    } catch (error) {
        console.error('Error sending email:', error.message);
        throw error;
    }
};

/**
 * Reply to an existing email thread
 */
const replyToEmail = async (user, { to, subject, body, threadId, messageId }) => {
    try {
        const gmail = getGmailClient(user);
        const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
        const utf8Subject = `=?utf-8?B?${Buffer.from(replySubject).toString('base64')}?=`;
        const sender = user.displayName ? `"${user.displayName}" <${user.email}>` : `<${user.email}>`;

        const messageParts = [
            `From: ${sender}`,
            `To: ${to}`,
            `Date: ${new Date().toUTCString()}`,
            `Subject: ${utf8Subject}`,
            ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${messageId}`] : []),
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            body || '',
        ];
        const message = messageParts.join('\r\n');
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const res = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
                ...(threadId ? { threadId } : {})
            }
        });
        return res.data;
    } catch (error) {
        console.error('Error replying to email:', error.message);
        throw error;
    }
};

module.exports = {
    getGmailClient,
    fetchMessageDetails,
    syncUserEmails,
    pollAllUsers,
    sendEmail,
    replyToEmail,
    normalizeCategoryName,
    clearAuthFailureFlag
};