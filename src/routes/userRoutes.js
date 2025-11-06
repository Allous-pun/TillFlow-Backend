import express from "express";
import rateLimit from "express-rate-limit";
import {
  registerUser,
  verifyOTP,
  loginUser,
  adminLogin,
  getUserProfile,
  updateUserProfile,
  updateEmail,
  verifyEmailUpdate,
  updateUserRole,
  changePassword,
} from "../controllers/userController.js";
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

// Public routes with rate limiting
router.post("/register", authLimiter, registerUser);
router.post("/verify-otp", authLimiter, verifyOTP);
router.post("/login", authLimiter, loginUser);
router.post("/admin-login", authLimiter, adminLogin);
router.post("/verify-email", authLimiter, verifyEmailUpdate);

// Protected routes
router.get("/profile", generalLimiter, protect, getUserProfile);
router.put("/profile", generalLimiter, protect, updateUserProfile);
router.put("/change-email", generalLimiter, protect, updateEmail);
router.put("/change-password", generalLimiter, protect, changePassword);

// Admin only routes
router.put("/:userId/role", generalLimiter, protect, adminOnly, updateUserRole);

export default router;