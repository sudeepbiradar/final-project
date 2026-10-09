const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    filename: {
        type: String,
        default: 'attachment'
    },
    mimeType: {
        type: String,
        default: 'application/octet-stream'
    },
    size: {
        type: Number,
        default: 0
    },
    attachmentId: {
        type: String,
        default: ''
    }
}, { _id: false });

const ReminderSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['date', 'time', 'deadline', 'meeting', 'task'],
        required: true
    },
    text: {
        type: String,
        required: true
    }
}, { _id: false });

const EmailSchema = new mongoose.Schema({
    // Owner of the email
    userEmail: {
        type: String,
        default: 'user@example.com',
        index: true
    },
    // ID of the specific connected account this email belongs to
    accountId: {
        type: String,
        index: true
    },

    // Gmail message ID or unique tracking ID
    gmailId: {
        type: String,
        required: true,
        default: () => 'mail-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)
    },
    gmailMessageId: {
        type: String,
        index: true
    },

    // Thread ID
    threadId: {
        type: String,
        default: ''
    },

    // Email headers & parties
    from: {
        type: String,
        default: 'Unknown Sender'
    },
    fromName: {
        type: String,
        default: ''
    },
    fromAddress: {
        type: String,
        default: ''
    },
    to: {
        type: String,
        default: ''
    },
    cc: {
        type: String,
        default: ''
    },
    bcc: {
        type: String,
        default: ''
    },
    subject: {
        type: String,
        default: 'No Subject'
    },

    // Complete Email content
    content: {
        type: String,
        default: ''
    },
    snippet: {
        type: String,
        default: ''
    },
    html: {
        type: String,
        default: ''
    },
    text: {
        type: String,
        default: ''
    },
    bodyText: {
        type: String,
        default: ''
    },
    bodyHtml: {
        type: String,
        default: ''
    },

    // Classification & Topic results
    category: {
        type: String,
        default: 'Primary'
    },
    topic: {
        type: String,
        default: 'General'
    },
    intent: {
        type: String,
        default: 'Information'
    },
    requiresAction: {
        type: Boolean,
        default: false
    },
    requiredAction: {
        type: String,
        default: ''
    },
    actionDescription: {
        type: String,
        default: ''
    },
    deadline: {
        type: String,
        default: ''
    },
    confidence: {
        type: Number,
        default: 0.85,
        min: 0,
        max: 1
    },
    classificationConfidence: {
        type: Number,
        default: 0.85,
        min: 0,
        max: 1
    },
    classificationReason: {
        type: String,
        default: ''
    },
    aiSummary: {
        type: String,
        default: ''
    },

    // Priority & Importance
    priority: {
        type: String,
        default: 'Normal'
    },
    importanceScore: {
        type: Number,
        default: 50,
        min: 0,
        max: 100
    },

    // Sentiment Analysis
    sentiment: {
        type: String,
        enum: ['Positive', 'Neutral', 'Negative'],
        default: 'Neutral'
    },
    sentimentScore: {
        type: Number,
        default: 0,
        min: -1,
        max: 1
    },

    // Keywords & Key Phrases
    keywords: [{
        type: String
    }],
    keywordScores: [{
        word: { type: String },
        score: { type: Number }
    }],
    keyPhrases: [{
        type: String
    }],

    // Extracted Named Entities
    entities: [{
        type: { type: String },
        text: { type: String }
    }],

    // Status flags
    isRead: {
        type: Boolean,
        default: false
    },
    isStarred: {
        type: Boolean,
        default: false
    },
    isArchived: {
        type: Boolean,
        default: false
    },
    isTrash: {
        type: Boolean,
        default: false
    },
    isImportant: {
        type: Boolean,
        default: false
    },
    isSpam: {
        type: Boolean,
        default: false
    },

    // Category correction tracking (Adaptive learning)
    originalCategory: {
        type: String,
        default: ''
    },
    categoryCorrectedByUser: {
        type: Boolean,
        default: false
    },
    correctionReason: {
        type: String,
        default: ''
    },

    // Timestamps
    receivedAt: {
        type: Date,
        default: Date.now
    },
    processedAt: {
        type: Date,
        default: Date.now
    },

    // Raw Gmail data (optional, for debugging)
    raw: {
        type: String,
        default: ''
    },

    // Labels from Gmail
    labels: [{
        type: String
    }],

    // Attachments info
    hasAttachments: {
        type: Boolean,
        default: false
    },
    attachments: [AttachmentSchema],

    // Extracted reminders / dates / times / tasks
    reminders: [ReminderSchema]
}, {
    timestamps: true
});

// Compound unique index for emails per user to strictly prevent duplicates
EmailSchema.index({ userEmail: 1, gmailId: 1 }, { unique: true });

// Query indexes for high performance
EmailSchema.index({ receivedAt: -1 });
EmailSchema.index({ userEmail: 1, receivedAt: -1 });
EmailSchema.index({ userEmail: 1, category: 1 });
EmailSchema.index({ userEmail: 1, isRead: 1 });
EmailSchema.index({ userEmail: 1, isStarred: 1 });
EmailSchema.index({ userEmail: 1, isArchived: 1 });
EmailSchema.index({ userEmail: 1, isTrash: 1 });
EmailSchema.index({ threadId: 1 });

// Static method to find recent emails
EmailSchema.statics.findRecent = function (limit = 50) {
    return this.find().sort({ receivedAt: -1 }).limit(limit);
};

// Static method to get category statistics
EmailSchema.statics.getCategoryStats = async function (userEmail) {
    const match = userEmail ? { userEmail } : {};
    const stats = await this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                category: '$_id',
                count: 1,
                _id: 0
            }
        }
    ]);

    const result = {
        Primary: 0,
        Personal: 0,
        Finance: 0,
        'College / Student': 0,
        Security: 0,
        Spam: 0,
        'Other / Uncategorized': 0
    };

    const normalizeCat = (c) => {
        if (!c) return 'Other / Uncategorized';
        const str = String(c).trim();
        if (str === 'Business') return 'Primary';
        if (str === 'School / College') return 'College / Student';
        if (str === 'Uncategorized' || str === 'Other') return 'Other / Uncategorized';
        return str;
    };

    stats.forEach(stat => {
        if (stat.category) {
            const normalized = normalizeCat(stat.category);
            if (result[normalized] !== undefined) {
                result[normalized] = (result[normalized] || 0) + stat.count;
            } else {
                result['Other / Uncategorized'] = (result['Other / Uncategorized'] || 0) + stat.count;
            }
        }
    });

    return result;
};

module.exports = mongoose.model('Email', EmailSchema);