import express from "express";
import rateLimit from "express-rate-limit";
import {
  handleValidation,
  handleConfirmation,
  checkTransactionStatus,
  getMerchantTransactions,
  getTransactionAnalytics,
  handleSTKCallback,
  initiateSTKPush // ADD THIS IMPORT
} from "../controllers/mpesaController.js";
import { protect, merchantOnly } from "../middleware/authMiddleware.js";
import { validateToken, recordTokenUsage } from '../middleware/tokenMiddleware.js';
import { MpesaUtils } from "../utils/mpesaUtils.js";

const router = express.Router();

// Rate limiting
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many webhook requests"
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: "Too many requests, please try again after 15 minutes"
  }
});

// ========== PUBLIC ROUTES (Daraja Webhooks) ==========
router.post("/webhook/validation", webhookLimiter, MpesaUtils.validateMpesaWebhook, handleValidation);
router.post("/webhook/confirmation", webhookLimiter, MpesaUtils.validateMpesaWebhook, handleConfirmation);
router.post("/webhook/stk-callback", webhookLimiter, handleSTKCallback);

// ========== PROTECTED ROUTES (Merchant Only) ==========
// STK Push initiation
router.post("/stk-push", authLimiter, protect, merchantOnly, validateToken, recordTokenUsage, initiateSTKPush);

router.post("/transaction/status", authLimiter, protect, merchantOnly, validateToken, checkTransactionStatus);
router.get("/transaction/status", authLimiter, protect, merchantOnly, validateToken, checkTransactionStatus);
router.get("/transactions", authLimiter, protect, merchantOnly, validateToken, getMerchantTransactions);
router.get("/analytics", authLimiter, protect, merchantOnly, getTransactionAnalytics);

// Health check for M-Pesa routes
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "M-Pesa API is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;