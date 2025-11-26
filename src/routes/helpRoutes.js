import express from 'express';
import {
  // Admin Routes
  createHelp,
  updateHelp,
  deleteHelp,
  publishHelp,
  getHelpStatistics,
  
  // Public/Merchant Routes
  listHelpItems,
  getHelp,
  recordFeedback,
  searchHelp,
  getFeaturedHelp,
  getHelpByCategory
} from '../controllers/helpController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';

const router = express.Router();

// 🔐 ADMIN ROUTES - Help Management
router.post('/admin/help', protect, adminOnly, createHelp);
router.put('/admin/help/:id', protect, adminOnly, updateHelp);
router.delete('/admin/help/:id', protect, adminOnly, deleteHelp);
router.put('/admin/help/:id/publish', protect, adminOnly, publishHelp);
router.get('/admin/help/statistics', protect, adminOnly, getHelpStatistics);

// 🌐 PUBLIC/MERCHANT ROUTES - Help Access
router.get('/help', listHelpItems); // Public access
router.get('/help/search', searchHelp); // Public access
router.get('/help/featured', getFeaturedHelp); // Public access
router.get('/help/category/:category', getHelpByCategory); // Public access
router.get('/help/:id', getHelp); // Public access
router.post('/help/:id/feedback', protect, merchantOnly, recordFeedback); // Only logged-in merchants can give feedback

export default router;