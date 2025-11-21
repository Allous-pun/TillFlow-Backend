import express from 'express';
import {
  // Admin Routes
  createNotification,
  getAllNotifications,
  updateNotification,
  publishNotification,
  deleteNotification,
  getNotificationStats,
  
  // Merchant Routes
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
} from '../controllers/notificationController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// 🔐 ADMIN ROUTES - Notification Management
router.post('/admin/notifications', protect, adminOnly, createNotification);
router.get('/admin/notifications', protect, adminOnly, getAllNotifications);
router.put('/admin/notifications/:notificationId', protect, adminOnly, updateNotification);
router.put('/admin/notifications/:notificationId/publish', protect, adminOnly, publishNotification);
router.delete('/admin/notifications/:notificationId', protect, adminOnly, deleteNotification);
router.get('/admin/notifications/stats', protect, adminOnly, getNotificationStats);

// 👨‍💼 MERCHANT ROUTES - Notification Access
router.get('/my-notifications', protect, merchantOnly, getMyNotifications);
router.put('/notifications/:notificationId/read', protect, merchantOnly, markAsRead);
router.put('/notifications/read-all', protect, merchantOnly, markAllAsRead);
router.get('/notifications/unread-count', protect, merchantOnly, getUnreadCount);

export default router;