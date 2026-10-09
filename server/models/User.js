const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    displayName: {
        type: String,
        required: true
    },
    profilePicture: {
        type: String
    },
    refreshToken: {
        type: String,
        required: false
    },
    accessToken: {
        type: String
    },
    tokenExpiry: {
        type: Date
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    // Primary account sync info (legacy/default)
    lastSyncTimestamp: {
        type: Date
    },
    lastHistoryId: {
        type: String
    },
    // Multi-account support and sync health tracking
    connectedAccounts: [{
        accountId: { type: String, required: true },
        provider: { type: String, default: 'gmail' },
        email: { type: String, required: true },
        accessToken: String,
        refreshToken: String,
        tokenExpiry: Date,
        lastSyncTimestamp: Date,
        lastHistoryId: String,
        syncStatus: { type: String, enum: ['active', 'error', 'disconnected', 'syncing'], default: 'active' },
        lastError: String,
        connectedAt: { type: Date, default: Date.now }
    }],
    settings: {
        storageLimitMB: { type: Number, default: 500 },
        offlineMode: { type: Boolean, default: true }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
