const mongoose = require('mongoose');
const Email = require('../models/Email');
require('dotenv').config();

async function triggerTestEmail() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const User = require('../models/User');
        const user = await User.findOne();
        const targetEmail = user ? user.email : 'sudeepbiradar031@gmail.com';
        console.log(`Target User Email: ${targetEmail}`);

        const testEmail = {
            userEmail: targetEmail,
            gmailId: `test_${Date.now()}`,
            from: 'test-bot@livemail.com',
            to: targetEmail,
            subject: '🚀 Dashboard Test SUCCESSFUL!',
            content: 'This is a simulated email to verify that your real-time dashboard and categorization are working correctly. If you see this, the system is 100% operational!',
            snippet: 'This is a simulated email to verify that your...',
            category: 'Security',
            confidence: 0.99,
            receivedAt: new Date(),
            processedAt: new Date()
        };

        console.log('Creating test email in DB...');
        const saved = await Email.create(testEmail);
        console.log('Saved to DB!');

        // Since the server is already running, we can't easily emit from here 
        // to the server's socket instance, but the server.js usually has a 
        // Change Stream or similar that watches the DB? 
        // Let's check server.js to see if it broadcasts on new DB entries.

        console.log('\n✅ Test email created. Check your dashboard at http://localhost:3000');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

triggerTestEmail();
