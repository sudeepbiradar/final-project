const mongoose = require('mongoose');

const CategoryCorrectionSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        index: true
    },
    senderEmail: {
        type: String,
        default: '',
        index: true
    },
    senderDomain: {
        type: String,
        default: '',
        index: true
    },
    originalCategory: {
        type: String,
        required: true
    },
    correctedCategory: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        default: 'User manual override'
    },
    appliedCount: {
        type: Number,
        default: 1
    },
    lastAppliedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

CategoryCorrectionSchema.index({ userEmail: 1, senderEmail: 1 });

module.exports = mongoose.model('CategoryCorrection', CategoryCorrectionSchema);
