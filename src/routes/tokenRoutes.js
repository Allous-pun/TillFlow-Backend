import express from 'express';
import {
  // Token Plan Management
  createTokenPlan,
  getTokenPlans,
  updateTokenPlan,
  deleteTokenPlan,
  
  // Token Management
  createToken,
  getAllTokens,
  updateToken,
  activateToken,
  deactivateToken,
  deleteToken,
  
  // Merchant Routes
  getAvailablePlans,
  getAvailableTokens,
  subscribeToToken,
  getMyActiveTokens,
  
  // Analytics
  getTokenAnalytics
} from '../controllers/tokenController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';
import { requireTokenAdmin } from '../middleware/tokenMiddleware.js';

const router = express.Router();

// 🔐 ADMIN ROUTES - Token Plan Management (Templates)
router.post('/admin/plans', protect, adminOnly, requireTokenAdmin, createTokenPlan);
router.get('/admin/plans', protect, adminOnly, requireTokenAdmin, getTokenPlans);
router.put('/admin/plans/:planId', protect, adminOnly, requireTokenAdmin, updateTokenPlan);
router.delete('/admin/plans/:planId', protect, adminOnly, requireTokenAdmin, deleteTokenPlan);

// 🔐 ADMIN ROUTES - Token Management (Actual tokens with pricing)
router.post('/admin/tokens', protect, adminOnly, requireTokenAdmin, createToken);
router.get('/admin/tokens', protect, adminOnly, requireTokenAdmin, getAllTokens);
router.put('/admin/tokens/:tokenId', protect, adminOnly, requireTokenAdmin, updateToken);
router.put('/admin/tokens/:tokenId/activate', protect, adminOnly, requireTokenAdmin, activateToken);
router.put('/admin/tokens/:tokenId/deactivate', protect, adminOnly, requireTokenAdmin, deactivateToken);
router.delete('/admin/tokens/:tokenId', protect, adminOnly, requireTokenAdmin, deleteToken);

// 🔐 ADMIN ROUTES - Analytics
router.get('/admin/tokens/:tokenId/analytics', protect, adminOnly, requireTokenAdmin, getTokenAnalytics);

// 👨‍💼 MERCHANT ROUTES - Token Subscription
router.get('/plans/available', protect, merchantOnly, getAvailablePlans);
router.get('/tokens/available', protect, merchantOnly, getAvailableTokens);
router.post('/subscribe', protect, merchantOnly, subscribeToToken);
router.get('/my-tokens', protect, merchantOnly, getMyActiveTokens);

export default router;