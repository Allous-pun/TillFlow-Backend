import express from 'express';
import {
  createTokenPlan,
  getTokenPlans,
  updateTokenPlan,
  generateTokenForBusiness,
  revokeToken,
  getTokenAnalytics,
  getAvailablePlans,
  subscribeToPlan,
  getMySubscription,
  getAllTokens // Add this import
} from '../controllers/tokenController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';
import { requireTokenAdmin } from '../middleware/tokenMiddleware.js';

const router = express.Router();

// 🔐 ADMIN ROUTES - Token Plan Management
router.post('/admin/plans', protect, adminOnly, requireTokenAdmin, createTokenPlan);
router.get('/admin/plans', protect, adminOnly, requireTokenAdmin, getTokenPlans);
router.put('/admin/plans/:planId', protect, adminOnly, requireTokenAdmin, updateTokenPlan);

// 🔐 ADMIN ROUTES - Token Management
router.post('/admin/tokens/generate', protect, adminOnly, requireTokenAdmin, generateTokenForBusiness);
router.put('/admin/tokens/:tokenId/revoke', protect, adminOnly, requireTokenAdmin, revokeToken);
router.get('/admin/tokens/:tokenId/analytics', protect, adminOnly, requireTokenAdmin, getTokenAnalytics);
router.get('/admin/tokens', protect, adminOnly, requireTokenAdmin, getAllTokens); // Add this route

// 👨‍💼 MERCHANT ROUTES - Token Subscription
router.get('/plans/available', protect, merchantOnly, getAvailablePlans);
router.post('/subscribe', protect, merchantOnly, subscribeToPlan);
router.get('/business/:businessId/subscription', protect, merchantOnly, getMySubscription);

export default router;