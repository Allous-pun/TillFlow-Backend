import express from "express";
import { uploadManualStatement } from "../middleware/uploadMiddleware.js";
import { protect, merchantOnly } from "../middleware/authMiddleware.js";
import { uploadManualTransactions } from "../controllers/manualTransactionController.js";

const router = express.Router();

/**
 * @route POST /api/transactions/manual/upload
 * @desc Upload manual CSV/PDF M-Pesa statement
 * @access Protected (merchant only)
 */
router.post(
  "/upload",
  protect,
  merchantOnly,
  (req, res, next) => {
    uploadManualStatement(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      next();
    });
  },
  uploadManualTransactions
);

export default router;