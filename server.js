import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables FIRST
dotenv.config();

// Now import other modules that depend on environment variables
import app from "./src/app.js";

const PORT = process.env.PORT || 5000;
const MONGO_URL = process.env.MONGO_URL;

// Connect to MongoDB
const connectDB = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    
    if (!MONGO_URL) {
      throw new Error('MONGO_URL is not defined in environment variables');
    }

    await mongoose.connect(MONGO_URL);
    console.log("✅ MongoDB connected successfully");
    
    // Start the server only after successful DB connection
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 MongoDB: Connected to TillFlow database`);
      console.log(`📧 Email Service: ${process.env.RESEND_API_KEY ? 'Enabled' : 'Mock Mode'}`);
    });
    
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('📡 Mongoose connected to MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed through app termination');
  process.exit(0);
});

// Start the application
connectDB();