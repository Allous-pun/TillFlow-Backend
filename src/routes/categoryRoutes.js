import express from "express";
import rateLimit from "express-rate-limit";
import {
  createCategory,
  listCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  assignCategoryToTransaction,
  bulkAssignCategories,
  getCategoryStatistics,
  deactivateCategory,
  activateCategory
} from "../controllers/categoryController.js";
import { protect, merchantOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rate limiting
const categoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    success: false,
    message: "Too many category requests, please try again after 15 minutes"
  }
});

const createCategoryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit to 50 category creations per hour per IP
  message: {
    success: false,
    message: "Too many category creations, please try again after an hour"
  }
});

// ========== FIXED ROUTE ORDER ==========

// Health check for category routes - MUST COME FIRST
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Category API is healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ========== PROTECTED ROUTES (Merchant Only) ==========

// POST /api/category - Create new category
router.post("/", createCategoryLimiter, protect, merchantOnly, createCategory);

// GET /api/category - List categories for current business
router.get("/", categoryLimiter, protect, merchantOnly, listCategories);

// GET /api/category/statistics - Get category usage statistics
router.get("/statistics", categoryLimiter, protect, merchantOnly, getCategoryStatistics);

// GET /api/category/:id - Get single category details
router.get("/:id", categoryLimiter, protect, merchantOnly, getCategory);

// PUT /api/category/:id - Update category
router.put("/:id", categoryLimiter, protect, merchantOnly, updateCategory);

// DELETE /api/category/:id - Soft delete category
router.delete("/:id", categoryLimiter, protect, merchantOnly, deleteCategory);

// PUT /api/category/:id/activate - Activate category
router.put("/:id/activate", categoryLimiter, protect, merchantOnly, activateCategory);

// PUT /api/category/:id/deactivate - Deactivate category
router.put("/:id/deactivate", categoryLimiter, protect, merchantOnly, deactivateCategory);

// PUT /api/category/assign/:transactionId - Assign category to single transaction
router.put("/assign/:transactionId", categoryLimiter, protect, merchantOnly, assignCategoryToTransaction);

// PUT /api/category/bulk-assign - Bulk assign category to multiple transactions
router.put("/bulk-assign", categoryLimiter, protect, merchantOnly, bulkAssignCategories);

export default router;