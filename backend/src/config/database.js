const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test' 
      ? process.env.MONGODB_TEST_URI 
      : process.env.MONGODB_URI || 'mongodb://localhost:27017/thatsmyplane-dev';

    const conn = await mongoose.connect(mongoURI, {
      // Remove deprecated options that are now defaults in Mongoose 6+
    });

    logger.info(`📦 MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed due to app termination');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB; 