import Dexie from 'dexie';
import axios from 'axios';

export class LiveMailDatabase extends Dexie {
    constructor() {
        super('LiveMailDB');
        this.version(1).stores({
            emails: 'id, gmailId, userEmail, subject, from, category, isRead, isStarred, receivedAt'
        });
        this.version(2).stores({
            emails: 'id, gmailId, userEmail, subject, from, senderEmail, category, isRead, isStarred, isArchived, isTrash, isImportant, receivedAt',
            pendingActions: '++id, action, emailId, payload, timestamp',
            userCorrections: 'id, senderEmail, originalCategory, correctedCategory, timestamp',
            notifiedIds: 'id, timestamp'
        });
        this.version(3).stores({
            emails: 'id, accountId, gmailId, userEmail, subject, from, senderEmail, category, isRead, isStarred, isArchived, isTrash, isImportant, receivedAt',
            accounts: 'id, email, provider, syncStatus', // Store local account details
            pendingActions: '++id, action, emailId, payload, timestamp',
            userCorrections: 'id, senderEmail, originalCategory, correctedCategory, timestamp',
            notifiedIds: 'id, timestamp'
        });
    }
}

export const db = new LiveMailDatabase();

/**
 * Standardize an email record for IndexedDB storage
 */
export const standardizeEmail = (email) => {
    if (!email) return null;
    const id = String(email.gmailId || email._id || email.id || ('email-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)));
    const sender = email.sender || email.fromName || (email.from ? email.from.split('<')[0].trim() : 'Unknown Sender');
    const senderEmail = email.senderEmail || email.fromAddress || (email.from && email.from.includes('<') ? email.from.split('<')[1].replace('>', '').trim() : (email.from || ''));
    const body = email.body || email.bodyText || email.content || email.text || email.snippet || '';

    return {
        ...email,
        id,
        _id: String(email._id || id),
        accountId: email.accountId || 'default',
        gmailId: email.gmailId || id,
        gmailMessageId: email.gmailMessageId || email.gmailId || id,
        threadId: email.threadId || '',
        userEmail: email.userEmail || 'user@example.com',
        sender,
        senderEmail,
        from: email.from || sender,
        fromName: email.fromName || sender,
        fromAddress: email.fromAddress || senderEmail,
        recipient: email.recipient || email.to || '',
        to: email.to || email.recipient || '',
        cc: email.cc || '',
        bcc: email.bcc || '',
        subject: email.subject || 'No Subject',
        body,
        content: email.content || body,
        snippet: email.snippet || (body ? body.substring(0, 220) : ''),
        text: email.text || body,
        html: email.html || '',
        category: email.category || 'Primary',
        originalCategory: email.originalCategory || '',
        categoryCorrectedByUser: !!email.categoryCorrectedByUser,
        correctionReason: email.correctionReason || '',
        confidence: email.confidence || 0.88,
        classificationConfidence: email.classificationConfidence || email.confidence || 0.88,
        classificationReason: email.classificationReason || '',
        isRead: !!email.isRead,
        isStarred: !!email.isStarred,
        isArchived: !!email.isArchived,
        isTrash: !!email.isTrash,
        isImportant: !!email.isImportant,
        priority: email.priority || 'Normal',
        timestamp: email.timestamp || email.receivedAt || new Date().toISOString(),
        receivedAt: email.receivedAt ? new Date(email.receivedAt).toISOString() : new Date().toISOString(),
        reminders: email.reminders || [],
        entities: email.entities || [],
        keywords: email.keywords || [],
        keyPhrases: email.keyPhrases || [],
        aiSummary: email.aiSummary || '',
        topic: email.topic || 'General',
        intent: email.intent || 'Information',
        attachments: email.attachments || [],
        hasAttachments: !!(email.hasAttachment || email.hasAttachments)
    };
};

/**
 * Save / update multiple emails in IndexedDB
 */
export const saveEmailsToCache = async (emails) => {
    if (!Array.isArray(emails) || emails.length === 0) return;
    try {
        const standardized = emails.map(standardizeEmail).filter(Boolean);
        await db.emails.bulkPut(standardized);
        // Periodically prune cache if over 1000 emails to respect browser storage limits
        if (emails.length > 20) {
            pruneCache(1000).catch(() => {});
        }
    } catch (err) {
        console.error('[IndexedDB] Error saving emails cache:', err);
    }
};

/**
 * Save a single email in IndexedDB
 */
export const saveEmailToCache = async (email) => {
    if (!email) return null;
    try {
        const item = standardizeEmail(email);
        await db.emails.put(item);
        return item;
    } catch (err) {
        console.error('[IndexedDB] Error saving single email:', err);
        return email;
    }
};

/**
 * Get cached emails with folder filter
 * @param {string} userEmail
 * @param {string} folder - 'all', 'inbox', 'starred', 'important', 'archived', 'trash'
 */
export const getCachedEmails = async (userEmail, folder = 'all') => {
    try {
        let list = await db.emails.toArray();
        if (userEmail) {
            const cleanUser = userEmail.toLowerCase().trim();
            list = list.filter(e => e.userEmail && (e.userEmail.toLowerCase().trim() === cleanUser || e.userEmail === 'user@example.com'));
        }

        if (folder === 'inbox') {
            list = list.filter(e => !e.isArchived && !e.isTrash);
        } else if (folder === 'starred') {
            list = list.filter(e => e.isStarred && !e.isTrash);
        } else if (folder === 'important') {
            list = list.filter(e => (e.isImportant || ['Critical', 'High', 'URGENT', 'IMPORTANT'].includes(e.priority)) && !e.isTrash);
        } else if (folder === 'archived') {
            list = list.filter(e => e.isArchived && !e.isTrash);
        } else if (folder === 'trash') {
            list = list.filter(e => e.isTrash);
        }

        return list.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
    } catch (err) {
        console.error('[IndexedDB] Error loading cached emails:', err);
        return [];
    }
};

/**
 * Get a single email by id or gmailId from IndexedDB
 */
export const getCachedEmailById = async (id) => {
    if (!id) return null;
    try {
        const strId = String(id);
        const direct = await db.emails.get(strId);
        if (direct) return direct;

        const byGmailId = await db.emails.where('gmailId').equals(strId).first();
        if (byGmailId) return byGmailId;

        const byMsgId = await db.emails.where('gmailMessageId').equals(strId).first();
        if (byMsgId) return byMsgId;

        return null;
    } catch (err) {
        console.error('[IndexedDB] Error getting cached email by ID:', err);
        return null;
    }
};

/**
 * Update email fields (such as isRead, isStarred, isArchived, isTrash, category) in IndexedDB
 */
export const updateCachedEmail = async (id, updates) => {
    if (!id) return;
    try {
        const strId = String(id);
        const existing = await getCachedEmailById(strId);
        if (existing) {
            await db.emails.update(existing.id, updates);
        }
    } catch (err) {
        console.error('[IndexedDB] Error updating cached email:', err);
    }
};

/**
 * Permanently delete an email from IndexedDB
 */
export const deleteCachedEmail = async (id) => {
    if (!id) return;
    try {
        const strId = String(id);
        const existing = await getCachedEmailById(strId);
        if (existing) {
            await db.emails.delete(existing.id);
        }
    } catch (err) {
        console.error('[IndexedDB] Error deleting cached email:', err);
    }
};

/**
 * Search emails locally in IndexedDB
 */
export const searchCachedEmails = async (query, category = 'All', folder = 'inbox') => {
    try {
        let emails = await getCachedEmails(null, folder);
        if (category && category !== 'All' && category !== 'Inbox') {
            emails = emails.filter(e => e.category === category);
        }
        if (!query || !query.trim()) {
            return emails;
        }
        const q = query.toLowerCase().trim();
        return emails.filter(e =>
            (e.subject && e.subject.toLowerCase().includes(q)) ||
            (e.from && e.from.toLowerCase().includes(q)) ||
            (e.fromName && e.fromName.toLowerCase().includes(q)) ||
            (e.snippet && e.snippet.toLowerCase().includes(q)) ||
            (e.text && e.text.toLowerCase().includes(q)) ||
            (e.content && e.content.toLowerCase().includes(q)) ||
            (e.category && e.category.toLowerCase().includes(q))
        );
    } catch (err) {
        console.error('[IndexedDB] Error searching cached emails:', err);
        return [];
    }
};

/* ══════════════════════════════════════════════════════════════════
   Offline Pending Actions Queue
   Records user changes when offline to sync seamlessly upon reconnect
══════════════════════════════════════════════════════════════════ */

/**
 * Enqueue an action performed while offline or pending server ack
 */
export const enqueuePendingAction = async (action, emailId, payload = {}) => {
    try {
        await db.pendingActions.add({
            action,
            emailId: String(emailId),
            payload,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[IndexedDB] Error enqueuing pending action:', err);
    }
};

/**
 * Retrieve all pending offline actions
 */
export const getPendingActions = async () => {
    try {
        return await db.pendingActions.toArray();
    } catch (err) {
        console.error('[IndexedDB] Error getting pending actions:', err);
        return [];
    }
};

/**
 * Remove a specific pending action after successful server sync
 */
export const removePendingAction = async (id) => {
    try {
        await db.pendingActions.delete(id);
    } catch (err) {
        console.error('[IndexedDB] Error removing pending action:', err);
    }
};

/**
 * Clear all pending actions
 */
export const clearPendingActions = async () => {
    try {
        await db.pendingActions.clear();
    } catch (err) {
        console.error('[IndexedDB] Error clearing pending actions:', err);
    }
};

/**
 * Flush and sync all pending actions with backend API upon reconnection
 */
export const flushPendingActions = async (apiBase = 'http://localhost:5000') => {
    if (!navigator.onLine) return { synced: 0, pending: 0 };
    try {
        const pending = await getPendingActions();
        if (!pending || pending.length === 0) return { synced: 0, pending: 0 };

        const payloadActions = pending.map(p => ({
            id: p.id,
            action: p.action,
            emailId: p.emailId,
            payload: p.payload
        }));

        const res = await axios.post(`${apiBase}/api/emails/batch-sync-actions`, { actions: payloadActions }, { withCredentials: true });
        if (res.data?.success) {
            await clearPendingActions();
            console.log(`[IndexedDB Sync] Flushed ${pending.length} pending actions successfully.`);
            return { synced: pending.length, pending: 0 };
        }
    } catch (err) {
        console.warn('[IndexedDB Sync] Failed to flush pending actions (will retry on next connect):', err.message);
    }
    const remaining = await getPendingActions();
    return { synced: 0, pending: remaining.length };
};

/* ══════════════════════════════════════════════════════════════════
   Notification Deduplication Store
   Prevents re-notifying already acknowledged/fired messages
══════════════════════════════════════════════════════════════════ */

export const isEmailNotifiedLocal = async (id) => {
    if (!id) return true;
    try {
        const item = await db.notifiedIds.get(String(id));
        return !!item;
    } catch (_) {
        return false;
    }
};

export const recordEmailNotifiedLocal = async (id) => {
    if (!id) return;
    try {
        await db.notifiedIds.put({
            id: String(id),
            timestamp: Date.now()
        });
    } catch (_) {}
};

/* ══════════════════════════════════════════════════════════════════
   User Category Corrections (Adaptive NLP Learning Store)
══════════════════════════════════════════════════════════════════ */

export const saveUserCorrectionLocal = async (correction) => {
    if (!correction) return;
    try {
        const id = correction.id || correction.senderEmail || ('corr-' + Date.now());
        await db.userCorrections.put({
            id,
            senderEmail: correction.senderEmail?.toLowerCase().trim() || '',
            originalCategory: correction.originalCategory || 'Primary',
            correctedCategory: correction.correctedCategory,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('[IndexedDB] Error saving user correction:', err);
    }
};

export const getUserCorrectionsLocal = async () => {
    try {
        return await db.userCorrections.toArray();
    } catch (err) {
        return [];
    }
};

export const removeUserCorrectionLocal = async (id) => {
    try {
        await db.userCorrections.delete(id);
    } catch (err) {}
};

/* ══════════════════════════════════════════════════════════════════
   Storage Limit & Quota Management
══════════════════════════════════════════════════════════════════ */

export const pruneCache = async (maxEmails = 1000) => {
    try {
        const count = await db.emails.count();
        if (count > maxEmails) {
            const toRemoveCount = count - maxEmails;
            // Never prune starred or important emails
            const candidates = await db.emails
                .where('isStarred').equals(0)
                .toArray();
            
            const sortedOldest = candidates
                .filter(e => !e.isImportant)
                .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt))
                .slice(0, toRemoveCount);

            const idsToDelete = sortedOldest.map(e => e.id);
            if (idsToDelete.length > 0) {
                await db.emails.bulkDelete(idsToDelete);
                console.log(`[IndexedDB Quota] Pruned ${idsToDelete.length} oldest emails to stay within limit.`);
            }
        }
    } catch (err) {
        console.warn('[IndexedDB Quota] Prune error:', err);
    }
};

export const getStorageUsageEstimate = async () => {
    try {
        const count = await db.emails.count();
        const pendingCount = await db.pendingActions.count();
        let quotaMb = null;
        let usageMb = null;
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            usageMb = (est.usage / (1024 * 1024)).toFixed(2);
            quotaMb = (est.quota / (1024 * 1024)).toFixed(0);
        }
        return {
            emailCount: count,
            pendingActionsCount: pendingCount,
            usageMb,
            quotaMb
        };
    } catch (err) {
        return { emailCount: 0, pendingActionsCount: 0, usageMb: null, quotaMb: null };
    }
};

/**
 * Clear all emails from IndexedDB cache on logout
 */
export const clearAllCachedEmails = async () => {
    try {
        await db.emails.clear();
        await db.pendingActions.clear();
        await db.notifiedIds.clear();
        console.log('[IndexedDB] Successfully cleared email cache and pending queues on logout');
    } catch (err) {
        console.error('[IndexedDB] Error clearing email cache:', err);
    }
};

/**
 * Permanently Wipe All Local Data
 */
export const wipeAllLocalData = async () => {
    try {
        await db.delete();
        console.log('[IndexedDB] Wiped all local storage.');
    } catch (err) {
        console.error('[IndexedDB] Error wiping db:', err);
    }
};

/**
 * Export all cached emails as JSON
 */
export const exportEmailsToJSON = async () => {
    try {
        const emails = await db.emails.toArray();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(emails, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `livemail_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        return true;
    } catch (err) {
        console.error('[IndexedDB] Error exporting emails:', err);
        return false;
    }
};

