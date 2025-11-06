import express from "express";
import rateLimit from "express-rate-limit";
import {
  loginUser,
  adminLogin,
  getUserProfile,
  updateUserProfile,
  changePassword,
  updateUserRole,
} from "../controllers/userController.js";

// Import NEW auth controller functions
import {
  registerUser,
  verifyWithTOTP,
  setupSecurityQuestions,
  verifyWithSecurityQuestions,
  getVerificationStatus,
  getBackupCodes,
  regenerateBackupCodes,
  registerAdmin, // MOVED THIS FROM userController.js TO HERE
} from "../controllers/authController.js";

import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: "Too many authentication attempts, please try again after 15 minutes"
  }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests, please try again after 15 minutes"
  }
});

// Public routes with rate limiting - NEW AUTH FLOW
router.post("/register", authLimiter, registerUser);
router.post("/verify-totp", authLimiter, verifyWithTOTP);
router.post("/setup-security-questions", authLimiter, setupSecurityQuestions);
router.post("/verify-security-questions", authLimiter, verifyWithSecurityQuestions);
router.get("/verification-status/:userId", authLimiter, getVerificationStatus);
router.post("/register-admin", authLimiter, registerAdmin); // This uses registerAdmin from authController

// Login routes (unchanged)
router.post("/login", authLimiter, loginUser);
router.post("/admin-login", authLimiter, adminLogin);

// Protected routes
router.get("/profile", generalLimiter, protect, getUserProfile);
router.put("/profile", generalLimiter, protect, updateUserProfile);
router.put("/change-password", generalLimiter, protect, changePassword);

// Backup codes management
router.get("/backup-codes", generalLimiter, protect, getBackupCodes);
router.post("/regenerate-backup-codes", generalLimiter, protect, regenerateBackupCodes);

// Admin only routes
router.put("/:userId/role", generalLimiter, protect, adminOnly, updateUserRole);

export default router;