const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    mongoose.set('bufferCommands', true);
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('>>> [DB] MongoDB Connected successfully.');
  } catch (err) {
    console.warn('>>> [DB WARNING] Atlas connection error (running in resilient offline mode):', err.message);
  }
};

module.exports = connectDB;