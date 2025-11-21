import Contact from '../models/Contact.js';
import ContactEnquiry from '../models/ContactEnquiry.js';
import User from '../models/User.js';
import fs from 'fs';

// Admin: Get contact configuration
export const getContactConfig = async (req, res) => {
  try {
    const contact = await Contact.getContactConfig();
    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contact configuration',
      error: error.message
    });
  }
};

// Admin: Update contact configuration
export const updateContactConfig = async (req, res) => {
  try {
    const contact = await Contact.getContactConfig();
    
    // Update fields if provided in request body
    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user.id;
    
    const updatedContact = await Contact.findByIdAndUpdate(
      contact._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Contact configuration updated successfully',
      data: updatedContact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating contact configuration',
      error: error.message
    });
  }
};

// Merchant: Get public contact information
export const getPublicContactInfo = async (req, res) => {
  try {
    const contact = await Contact.getContactConfig();
    
    // Return only public-facing information
    const publicInfo = {
      emails: {
        support: contact.supportEmail,
        general: contact.generalEmail,
        sales: contact.salesEmail
      },
      phones: {
        support: contact.supportPhone,
        sales: contact.salesPhone
      },
      businessHours: contact.businessHours,
      offices: contact.offices,
      socialMedia: contact.socialMedia
    };
    
    res.json({
      success: true,
      data: publicInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching contact information',
      error: error.message
    });
  }
};

// Merchant: Submit enquiry
export const submitEnquiry = async (req, res) => {
  try {
    const { enquiryType, subject, message, priority } = req.body;
    
    // Validate required fields
    if (!enquiryType || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Enquiry type, subject, and message are required'
      });
    }

    // Get merchant's business
    const merchant = await User.findById(req.user.id).populate('businesses');
    const businessId = merchant.businesses.length > 0 ? merchant.businesses[0]._id : null;
    
    const enquiry = new ContactEnquiry({
      merchant: req.user.id,
      business: businessId,
      enquiryType,
      subject,
      message,
      priority: priority || 'medium'
    });
    
    // Handle file attachments if any
    if (req.files && req.files.length > 0) {
      enquiry.attachments = req.files.map(file => ({
        filename: file.originalname,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size
      }));
    }
    
    await enquiry.save();
    
    // Populate merchant details for the response
    await enquiry.populate('merchant', 'name email');
    
    res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully',
      data: enquiry
    });
  } catch (error) {
    // Clean up uploaded files if there's an error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error submitting enquiry',
      error: error.message
    });
  }
};

// Admin: Get all enquiries
export const getAllEnquiries = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, enquiryType } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (enquiryType) filter.enquiryType = enquiryType;
    
    const enquiries = await ContactEnquiry.find(filter)
      .populate('merchant', 'name email')
      .populate('business', 'businessName')
      .populate('adminResponse.respondedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await ContactEnquiry.countDocuments(filter);
    
    res.json({
      success: true,
      data: enquiries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEnquiries: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching enquiries',
      error: error.message
    });
  }
};

// Admin: Get single enquiry
export const getEnquiry = async (req, res) => {
  try {
    const enquiry = await ContactEnquiry.findById(req.params.id)
      .populate('merchant', 'name email phone')
      .populate('business', 'businessName industry')
      .populate('adminResponse.respondedBy', 'name email');
    
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }
    
    res.json({
      success: true,
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching enquiry',
      error: error.message
    });
  }
};

// Merchant: Get their enquiries
export const getMyEnquiries = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = { merchant: req.user.id };
    if (status) filter.status = status;
    
    const enquiries = await ContactEnquiry.find(filter)
      .populate('business', 'businessName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await ContactEnquiry.countDocuments(filter);
    
    res.json({
      success: true,
      data: enquiries,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalEnquiries: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching your enquiries',
      error: error.message
    });
  }
};

// Admin: Respond to enquiry
export const respondToEnquiry = async (req, res) => {
  try {
    const { responseMessage } = req.body;
    
    const enquiry = await ContactEnquiry.findById(req.params.id);
    
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }
    
    enquiry.adminResponse = {
      message: responseMessage,
      respondedBy: req.user.id,
      respondedAt: new Date()
    };
    
    enquiry.status = 'in_progress';
    
    await enquiry.save();
    
    // Populate response data
    await enquiry.populate('adminResponse.respondedBy', 'name email');
    
    res.json({
      success: true,
      message: 'Response sent successfully',
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error responding to enquiry',
      error: error.message
    });
  }
};

// Admin: Update enquiry status
export const updateEnquiryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const enquiry = await ContactEnquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate('merchant', 'name email');
    
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Enquiry status updated successfully',
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating enquiry status',
      error: error.message
    });
  }
};

// Admin: Delete enquiry
export const deleteEnquiry = async (req, res) => {
  try {
    const enquiry = await ContactEnquiry.findByIdAndDelete(req.params.id);
    
    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Enquiry deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting enquiry',
      error: error.message
    });
  }
};