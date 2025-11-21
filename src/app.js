import express from "express";
import cors from "cors";
import userRoutes from "./routes/userRoutes.js";
import mpesaRoutes from "./routes/mpesaRoutes.js";
import mpesaService from "./services/mpesaService.js";
import manualTransactionRoutes from "./routes/manualTransactionRoutes.js";
import businessRoutes from "./routes/businessRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import categoryRuleRoutes from "./routes/categoryRuleRoutes.js";
import tokenRoutes from './routes/tokenRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import contactRoutes from './routes/contactRoutes.js'; // Fixed: Use import instead of require

const app = express();

// Middleware - ADD THIS LINE for Render proxy
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Add raw body parsing for M-Pesa webhooks
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf; // Store raw body for signature verification
  }
}));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/mpesa", mpesaRoutes);
app.use("/api/transactions/manual", manualTransactionRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/category-rule", categoryRuleRoutes);
app.use("/api/tokens", tokenRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/contact", contactRoutes); // Fixed: Use the imported contactRoutes

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "TillFlow Backend is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: "1.0.0"
  });
});

// M-Pesa specific health check
app.get("/api/mpesa/health", (req, res) => {
  res.json({ 
    status: "OK", 
    service: "M-Pesa API",
    timestamp: new Date().toISOString(),
    environment: process.env.MPESA_ENVIRONMENT || 'sandbox'
  });
});

// TEMPORARY ROUTE: Register M-Pesa URLs with Daraja - REMOVE AFTER USE
app.get("/api/mpesa/register-urls", async (req, res) => {
  try {
    console.log('🌐 Registering M-Pesa URLs with Daraja...');
    console.log('📝 URLs to register:');
    console.log('- Validation:', `${process.env.MPESA_CALLBACK_BASE_URL}/api/mpesa/validation`);
    console.log('- Confirmation:', `${process.env.MPESA_CALLBACK_BASE_URL}/api/mpesa/confirmation`);
    
    const result = await mpesaService.registerC2BUrls();
    
    if (result.success) {
      console.log('✅ URLs registered successfully!');
      res.json({
        success: true,
        message: "M-Pesa URLs registered successfully with Daraja",
        details: result
      });
    } else {
      console.error('❌ URL registration failed:', result.error);
      res.status(500).json({
        success: false,
        message: "URL registration failed",
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message
    });
  }
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ 
    success: false,
    message: "Route not found",
    path: req.originalUrl
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error);
  
  // M-Pesa webhook errors should still return 200 to prevent retries
  if (req.path.includes('/mpesa/confirmation') || req.path.includes('/mpesa/validation')) {
    return res.status(200).json({
      success: false,
      message: "Webhook processed with errors"
    });
  }
  
  res.status(500).json({ 
    success: false,
    message: "Internal server error",
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

export default app;