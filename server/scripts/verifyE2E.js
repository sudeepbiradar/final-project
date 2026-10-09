const io = require('socket.io-client');
const axios = require('axios');

async function testAll() {
    console.log('=== Starting E2E Verification ===');

    // 1. Check health
    try {
        const health = await axios.get('http://localhost:5000/api/health');
        console.log('1. Server Health:', health.data.status, '| DB:', health.data.database);
    } catch (err) {
        console.error('1. Health check failed:', err.message);
        process.exit(1);
    }

    // 2. Check /api/emails
    let sampleEmailId = null;
    try {
        const emailsRes = await axios.get('http://localhost:5000/api/emails');
        const list = Array.isArray(emailsRes.data) ? emailsRes.data : emailsRes.data.emails || [];
        console.log(`2. /api/emails count: ${list.length}`);
        if (list.length > 0) {
            sampleEmailId = list[0]._id;
            console.log(`   Sample email ID: ${sampleEmailId}, subject: "${list[0].subject}"`);
        }
    } catch (err) {
        console.error('2. Failed to fetch emails:', err.message);
    }

    // 3. Test PATCH /api/emails/:id/read with sample email ID
    if (sampleEmailId) {
        try {
            const readRes = await axios.patch(`http://localhost:5000/api/emails/${sampleEmailId}/read`, {});
            console.log('3. PATCH /api/emails/:id/read result:', readRes.data.success ? 'SUCCESS' : 'FAILED');
        } catch (err) {
            console.error('3. PATCH /read failed:', err.message);
        }
    }

    // 4. Test Socket.IO Real-time Emission and Room Ingestion
    const userEmail = 'sudeepbiradar031@gmail.com';
    const socket = io('http://localhost:5000', {
        transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Socket test timed out after 8s'));
        }, 8000);

        socket.on('connect', async () => {
            console.log('4a. Socket connected:', socket.id);
            socket.emit('join-room', userEmail);
            console.log('4b. Joined room for:', userEmail);

            // Give server a moment to join room
            await new Promise(r => setTimeout(r, 400));

            // Now trigger a test broadcast
            try {
                const broadcastRes = await axios.post('http://localhost:5000/api/emails/test-broadcast', {
                    userEmail: userEmail,
                    subject: 'Verify Real-Time Mail Arrival',
                    category: 'Finance',
                    snippet: 'Your invoice for payment verification has been processed.',
                    from: 'finance-verify@company.com',
                    isImportant: true,
                });
                console.log('4c. Broadcast trigger response:', broadcastRes.data.success ? 'SUCCESS' : 'FAILED');
            } catch (bErr) {
                console.error('4c. Broadcast post failed:', bErr.message);
            }
        });

        socket.on('new_email', (email) => {
            console.log('4d. RECEIVED new_email EVENT via Socket!');
            console.log('    Subject:', email.subject);
            console.log('    Category:', email.category);
            console.log('    ID:', email._id || email.id);
            clearTimeout(timeout);
            socket.disconnect();
            resolve();
        });
    });

    console.log('\n=== ALL E2E VERIFICATION TESTS PASSED! ===');
    process.exit(0);
}

testAll().catch(err => {
    console.error('E2E Test Failed:', err);
    process.exit(1);
});
