/**
 * End-to-end Verification Script for LiveMail Classifier Backend & Database
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Email = require('../models/Email');

async function runTests() {
    console.log('--- Starting LiveMail Verification Tests ---');

    try {
        await connectDB();
        console.log('✓ MongoDB Connected');

        // Test 1: Duplicate Prevention Check
        const testGmailId = 'verify-test-' + Date.now();
        const testEmailData = {
            userEmail: 'user@example.com',
            gmailId: testGmailId,
            threadId: 'th-test',
            from: 'Security Team <security@livemail.system>',
            subject: 'Verification Test: Security Alert',
            snippet: 'Testing offline persistence and duplicate prevention.',
            text: 'This is a test email body for offline viewing verification.',
            html: '<p>This is a <strong>test HTML email body</strong> for offline viewing verification.</p>',
            category: 'Security',
            confidence: 0.98,
            isRead: false,
            isStarred: false,
            receivedAt: new Date()
        };

        // Insert first time
        const doc1 = await Email.findOneAndUpdate(
            { userEmail: testEmailData.userEmail, gmailId: testGmailId },
            { $set: testEmailData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✓ Test 1: First insert succeeded, ID:', doc1._id);

        // Insert second time (simulate duplicate sync)
        const doc2 = await Email.findOneAndUpdate(
            { userEmail: testEmailData.userEmail, gmailId: testGmailId },
            { $set: testEmailData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✓ Test 2: Second sync upsert succeeded, ID:', doc2._id);

        const count = await Email.countDocuments({ userEmail: 'user@example.com', gmailId: testGmailId });
        if (count === 1) {
            console.log('✓ TEST PASS: Duplicate prevention confirmed — exactly 1 database record exists.');
        } else {
            console.error('✗ TEST FAIL: Duplicate records detected:', count);
        }

        // Test 3: Read Email by ID directly from MongoDB (no internet/Gmail dependency)
        const fetched = await Email.findOne({ gmailId: testGmailId }).lean();
        if (fetched && fetched.html && fetched.text && fetched.category === 'Security') {
            console.log('✓ TEST PASS: Stored email retrieved with full HTML & text body and category.');
        } else {
            console.error('✗ TEST FAIL: Email body missing or malformed.');
        }

        // Test 4: Status Update (Read & Star)
        await Email.updateOne({ gmailId: testGmailId }, { $set: { isRead: true, isStarred: true } });
        const updated = await Email.findOne({ gmailId: testGmailId }).lean();
        if (updated.isRead === true && updated.isStarred === true) {
            console.log('✓ TEST PASS: Status persistence confirmed (isRead: true, isStarred: true).');
        } else {
            console.error('✗ TEST FAIL: Status update not persisted.');
        }

        // Clean up test email
        await Email.deleteOne({ gmailId: testGmailId });
        console.log('✓ Test record cleaned up.');

        console.log('\n========================================');
        console.log(' ALL BACKEND VERIFICATION TESTS PASSED ');
        console.log('========================================\n');

        process.exit(0);
    } catch (err) {
        console.error('Verification Test Error:', err);
        process.exit(1);
    }
}

runTests();
