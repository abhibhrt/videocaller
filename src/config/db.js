// src/config/db.js
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/videocaller';
  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;