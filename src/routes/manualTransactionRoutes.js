import express from "express";
import { uploadManualStatement } from "../middleware/uploadMiddleware.js";
import { protect, merchantOnly } from "../middleware/authMiddleware.js";
import { processManualUpload } from "../services/manualTransactionService.js";

const router = express.Router();

/**
 * @route POST /api/transactions/manual/upload
 * @desc Upload manual CSV/PDF M-Pesa statement
 * @access Protected (merchant only)
 */
router.post(
  "/upload",
  protect, // FIXED: Changed from authMiddleware to protect
  merchantOnly, // ADDED: Ensure only merchants can upload
  (req, res, next) => {
    uploadManualStatement(req, res, function (err) {
      if (err) return res.status(400).json({ success: false, error: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const merchantId = req.user._id;
      const businessShortCode = req.user.mpesaShortcode; // from user profile

      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
      }

      const result = await processManualUpload(
        req.file.path,
        merchantId,
        businessShortCode
      );

      res.status(201).json({
        success: true,
        message: "Transactions processed successfully",
        ...result,
      });
    } catch (err) {
      console.error("Manual upload failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;