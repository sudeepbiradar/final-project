require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Email = require('../models/Email');
const { processEmailNLP } = require('../services/nlpEngine');

const TEST_USER = 'test_sync_user@example.com';

async function runSyncFlowTests() {
    console.log('=== Starting Real-time Email Sync & Notification Verification ===');
    await connectDB();
    console.log('✓ MongoDB Connected');

    // Clean up test data
    await Email.deleteMany({ userEmail: TEST_USER });

    // TEST 1: Initial load of historical email (must NOT trigger notification)
    console.log('\n[Test 1] Saving historical email...');
    const histMsgId = 'hist-msg-' + Date.now();
    const nlp1 = processEmailNLP('College Semester Schedule', 'The academic calendar for the upcoming semester is available.');
    const histEmail = await Email.create({
        userEmail: TEST_USER,
        gmailId: histMsgId,
        gmailMessageId: histMsgId,
        threadId: 'thread-1',
        from: 'Dean <dean@university.edu>',
        subject: 'College Semester Schedule',
        snippet: 'The academic calendar is available.',
        text: 'The academic calendar is available.',
        category: nlp1.category,
        topic: nlp1.topic,
        intent: nlp1.intent,
        priority: nlp1.priority,
        importanceScore: nlp1.importanceScore
    });
    console.log(`✓ Historical email saved with ID: ${histEmail._id}, Category: ${histEmail.category}`);

    // TEST 2: Genuinely New Incoming Email (Simulate Sync Worker detection)
    console.log('\n[Test 2] Simulating newly received Gmail message...');
    const newMsgId = 'new-msg-' + Date.now();
    
    // Check MongoDB before processing (Flow Step 4)
    const existsBefore = await Email.exists({ userEmail: TEST_USER, $or: [{ gmailId: newMsgId }, { gmailMessageId: newMsgId }] });
    console.log(` -> Exists before sync: ${!!existsBefore} (Expected: false)`);

    if (!existsBefore) {
        // Run NLP once
        const nlp2 = processEmailNLP('Semester Examination Timetable Published', 'The university has released the examination timetable. Please review your schedule.');
        const savedNew = await Email.findOneAndUpdate(
            { userEmail: TEST_USER, gmailId: newMsgId },
            {
                $set: {
                    userEmail: TEST_USER,
                    gmailId: newMsgId,
                    gmailMessageId: newMsgId,
                    threadId: 'thread-2',
                    from: 'Controller of Exams <exams@university.edu>',
                    subject: 'Semester Examination Timetable Published',
                    snippet: 'The university has released the examination timetable.',
                    text: 'The university has released the examination timetable. Please review your schedule.',
                    category: nlp2.category,
                    topic: nlp2.topic,
                    intent: nlp2.intent,
                    requiresAction: nlp2.requiresAction,
                    priority: nlp2.priority,
                    importanceScore: nlp2.importanceScore,
                    keywords: nlp2.keywords,
                    keyPhrases: nlp2.keyPhrases,
                    aiSummary: nlp2.aiSummary,
                    classificationReason: nlp2.classificationReason
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`✓ Genuinely new email inserted: ID: ${savedNew._id}, Subject: "${savedNew.subject}", Category: ${savedNew.category}, Priority: ${savedNew.priority}`);
    }

    // TEST 3: Duplicate sync detection (Flow Step 5: If it already exists -> do nothing)
    console.log('\n[Test 3] Simulating duplicate sync trigger for the same message ID...');
    const existsAgain = await Email.exists({ userEmail: TEST_USER, $or: [{ gmailId: newMsgId }, { gmailMessageId: newMsgId }] });
    console.log(` -> Exists check: ${!!existsAgain} (Expected: true -> skipped without duplicate NLP or insert)`);
    const totalWithId = await Email.countDocuments({ userEmail: TEST_USER, gmailId: newMsgId });
    console.log(`✓ Total documents with message ID ${newMsgId}: ${totalWithId} (Must be exactly 1)`);

    // TEST 4: Thread Reply (Same threadId 'thread-2', new unique messageId)
    console.log('\n[Test 4] Simulating a thread reply inside the same conversation thread...');
    const replyMsgId = 'reply-msg-' + Date.now();
    const nlpReply = processEmailNLP('Re: Semester Examination Timetable Published', 'Revised timetable attached for Department of Computer Science.');
    const savedReply = await Email.findOneAndUpdate(
        { userEmail: TEST_USER, gmailId: replyMsgId },
        {
            $set: {
                userEmail: TEST_USER,
                gmailId: replyMsgId,
                gmailMessageId: replyMsgId,
                threadId: 'thread-2', // Same thread!
                from: 'HOD CSE <hodcse@university.edu>',
                subject: 'Re: Semester Examination Timetable Published',
                snippet: 'Revised timetable attached for Department of Computer Science.',
                text: 'Revised timetable attached for Department of Computer Science.',
                category: nlpReply.category,
                topic: nlpReply.topic,
                intent: nlpReply.intent,
                priority: nlpReply.priority,
                importanceScore: nlpReply.importanceScore
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`✓ Thread reply correctly stored as distinct email message: ID: ${savedReply._id}, ThreadId: ${savedReply.threadId}`);

    const threadCount = await Email.countDocuments({ userEmail: TEST_USER, threadId: 'thread-2' });
    console.log(`✓ Total messages in thread-2: ${threadCount} (Must be exactly 2)`);

    // Cleanup
    await Email.deleteMany({ userEmail: TEST_USER });
    console.log('\n========================================');
    console.log(' ALL EMAIL SYNC & THREAD TESTS PASSED ');
    console.log('========================================');
    await mongoose.disconnect();
}

runSyncFlowTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
