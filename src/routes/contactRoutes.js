import express from 'express';
import { 
  getContactConfig,
  updateContactConfig,
  getPublicContactInfo,
  submitEnquiry,
  getAllEnquiries,
  getEnquiry,
  getMyEnquiries,
  respondToEnquiry,
  updateEnquiryStatus,
  deleteEnquiry
} from '../controllers/contactController.js';
import { protect, adminOnly, merchantOnly } from '../middleware/authMiddleware.js';
import { uploadContactAttachments } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Public routes
router.get('/public', getPublicContactInfo);

// Merchant routes
router.post(
  '/enquiries', 
  protect, 
  merchantOnly,
  (req, res, next) => {
    uploadContactAttachments(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  },
  submitEnquiry
);

router.get('/enquiries/my-enquiries', protect, merchantOnly, getMyEnquiries);

// Admin routes
router.get('/admin/config', protect, adminOnly, getContactConfig);
router.put('/admin/config', protect, adminOnly, updateContactConfig);
router.get('/admin/enquiries', protect, adminOnly, getAllEnquiries);
router.get('/admin/enquiries/:id', protect, adminOnly, getEnquiry);
router.put('/admin/enquiries/:id/respond', protect, adminOnly, respondToEnquiry);
router.put('/admin/enquiries/:id/status', protect, adminOnly, updateEnquiryStatus);
router.delete('/admin/enquiries/:id', protect, adminOnly, deleteEnquiry);

export default router;