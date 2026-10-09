require('dotenv').config();
const { classifyEmail } = require('./services/classifier');

async function test() {
    console.log('Testing NVIDIA NIM integration...');
    console.log('Model:', process.env.NVIDIA_MODEL);
    
    const subject = "Limited Time Offer: Get 50% Off!";
    const body = "Don't miss our summer sale. Use code SUMMER50 at checkout to get 50% off all items.";
    
    console.log('\nInput:');
    console.log('Subject:', subject);
    console.log('Body:', body);
    
    const result = await classifyEmail(subject, body);
    const category = typeof result === 'string' ? result : (result?.category || 'Uncategorized');
    
    console.log('\nOutput:');
    console.log('Classification Result:', result);
    
    if (category && category !== 'Uncategorized') {
        console.log('\nTest passed!');
        process.exit(0);
    } else {
        console.log('\nTest failed or returned Uncategorized.');
        process.exit(1);
    }
}

test();
