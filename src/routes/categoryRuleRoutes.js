import express from "express";
import rateLimit from "express-rate-limit";
import {
  createCategoryRule,
  listCategoryRules,
  getCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
  testCategoryRule,
  bulkUpdateRulePriorities,
  getRuleStatistics,
  testClassification,
  getClassificationAnalytics,
  reclassifyTransactions,
  deactivateCategoryRule,
  activateCategoryRule,
  resetRuleStatistics
} from "../controllers/categoryRuleController.js";
import { protect, merchantOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rate limiting
const ruleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Higher limit for rules due to testing and classification
  message: {
    success: false,
    message: "Too many rule requests, please try again after 15 minutes"
  }
});

const createRuleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit to 100 rule creations per hour per IP
  message: {
    success: false,
    message: "Too many rule creations, please try again after an hour"
  }
});

const classificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit classification operations
  message: {
    success: false,
    message: "Too many classification requests, please try again after 15 minutes"
  }
});

// ========== FIXED ROUTE ORDER ==========

// Health check for category rule routes - MUST COME FIRST
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Category Rule API is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ========== PROTECTED ROUTES (Merchant Only) ==========

// POST /api/category-rule - Create new classification rule
router.post("/", createRuleLimiter, protect, merchantOnly, createCategoryRule);

// GET /api/category-rule - List rules for current business
router.get("/", ruleLimiter, protect, merchantOnly, listCategoryRules);

// GET /api/category-rule/statistics - Get rule usage statistics
router.get("/statistics", ruleLimiter, protect, merchantOnly, getRuleStatistics);

// GET /api/category-rule/analytics - Get classification analytics
router.get("/analytics", ruleLimiter, protect, merchantOnly, getClassificationAnalytics);

// POST /api/category-rule/test - Test classification rules with sample data
router.post("/test", classificationLimiter, protect, merchantOnly, testClassification);

// POST /api/category-rule/reclassify - Reclassify unclassified transactions
router.post("/reclassify", classificationLimiter, protect, merchantOnly, reclassifyTransactions);

// GET /api/category-rule/:id - Get single rule details
router.get("/:id", ruleLimiter, protect, merchantOnly, getCategoryRule);

// PUT /api/category-rule/:id - Update rule
router.put("/:id", ruleLimiter, protect, merchantOnly, updateCategoryRule);

// DELETE /api/category-rule/:id - Soft delete rule
router.delete("/:id", ruleLimiter, protect, merchantOnly, deleteCategoryRule);

// POST /api/category-rule/:id/test - Test specific rule with sample data
router.post("/:id/test", classificationLimiter, protect, merchantOnly, testCategoryRule);

// PUT /api/category-rule/:id/activate - Activate rule
router.put("/:id/activate", ruleLimiter, protect, merchantOnly, activateCategoryRule);

// PUT /api/category-rule/:id/deactivate - Deactivate rule
router.put("/:id/deactivate", ruleLimiter, protect, merchantOnly, deactivateCategoryRule);

// PUT /api/category-rule/:id/reset-stats - Reset rule statistics
router.put("/:id/reset-stats", ruleLimiter, protect, merchantOnly, resetRuleStatistics);

// PUT /api/category-rule/priorities - Bulk update rule priorities
router.put("/priorities", ruleLimiter, protect, merchantOnly, bulkUpdateRulePriorities);

export default router;