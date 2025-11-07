import express from "express";
import rateLimit from "express-rate-limit";
import {
  createBusiness,
  updateBusiness,
  getMyBusinesses,
  getBusinessById,
  deleteBusiness,
  switchBusiness,
  getBusinessStats
} from "../controllers/businessController.js";
import { protect, merchantOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rate limiting
const businessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many business requests, please try again after 15 minutes"
  }
});

const createBusinessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit to 5 business creations per hour per IP
  message: {
    success: false,
    message: "Too many business creations, please try again after an hour"
  }
});

// ========== PROTECTED ROUTES (Merchant Only) ==========

// POST /api/business - Create new business
router.post("/", createBusinessLimiter, protect, merchantOnly, createBusiness);

// GET /api/business - List businesses for logged-in merchant
router.get("/", businessLimiter, protect, merchantOnly, getMyBusinesses);

// GET /api/business/:businessId - View single business
router.get("/:businessId", businessLimiter, protect, merchantOnly, getBusinessById);

// PUT /api/business/:businessId - Update MPESA credentials or name
router.put("/:businessId", businessLimiter, protect, merchantOnly, updateBusiness);

// DELETE /api/business/:businessId - Archive/delete business
router.delete("/:businessId", businessLimiter, protect, merchantOnly, deleteBusiness);

// POST /api/business/switch - Switch current business
router.post("/switch", businessLimiter, protect, merchantOnly, switchBusiness);

// GET /api/business/:businessId/stats - Get business statistics
router.get("/:businessId/stats", businessLimiter, protect, merchantOnly, getBusinessStats);

// Health check for business routes
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Business API is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;