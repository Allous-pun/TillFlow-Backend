import express from 'express';
import {
  // Merchant Routes
  getMySubscriptions,
  getBusinessSubscription,
  cancelSubscription,
  
  // Admin Routes
  getAllSubscriptions,
  checkExpiredSubscriptions
} from '../controllers/subscriptionController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// 👨‍💼 MERCHANT ROUTES - Subscription Management
router.get('/my-subscriptions', protect, merchantOnly, getMySubscriptions);
router.get('/business/:businessId', protect, merchantOnly, getBusinessSubscription);
router.put('/business/:businessId/cancel', protect, merchantOnly, cancelSubscription);

// 🔐 ADMIN ROUTES - Subscription Overview
router.get('/admin/all', protect, adminOnly, getAllSubscriptions);
router.post('/admin/check-expired', protect, adminOnly, checkExpiredSubscriptions);

export default router;