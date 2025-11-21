import express from 'express';
import {
  getMySubscriptions,
  getBusinessSubscription,
  cancelSubscription,
  enableAutoRenew,
  disableAutoRenew,
  getTokenStatus,
  getAllSubscriptions,
  checkExpiredSubscriptions
} from '../controllers/subscriptionController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// 👨‍💼 MERCHANT ROUTES - Subscription Management
router.get('/my-subscriptions', protect, merchantOnly, getMySubscriptions);
router.get('/business/:businessId', protect, merchantOnly, getBusinessSubscription);
router.put('/business/:businessId/cancel', protect, merchantOnly, cancelSubscription);
router.put('/business/:businessId/auto-renew/enable', protect, merchantOnly, enableAutoRenew);
router.put('/business/:businessId/auto-renew/disable', protect, merchantOnly, disableAutoRenew);
router.get('/business/:businessId/token-status', protect, merchantOnly, getTokenStatus);

// 🔐 ADMIN ROUTES - Subscription Overview
router.get('/admin/all', protect, adminOnly, getAllSubscriptions);
router.post('/admin/check-expired', protect, adminOnly, checkExpiredSubscriptions);

export default router;