require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
});

async function listModels() {
    try {
        const models = await openai.models.list();
        console.log('Available models:');
        models.data.forEach(m => console.log(m.id));
    } catch (e) {
        console.error(e);
    }
}
listModels();
