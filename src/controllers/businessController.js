import Business from "../models/Business.js";
import User from "../models/User.js";

/**
 * Business Management Controller
 * Pure CRUD operations for business management
 * No M-Pesa logic - only storing business details and M-Pesa credentials
 */

// Create a new business
export const createBusiness = async (req, res) => {
  try {
    const {
      businessName,
      industry,
      mpesaShortCode,
      mpesaConsumerKey,
      mpesaConsumerSecret,
      mpesaPassKey,
      contactEmail,
      contactPhone,
      location,
      businessType
    } = req.body;

    const ownerId = req.user.id;

    // Validate required fields
    if (!businessName || !mpesaShortCode || !mpesaConsumerKey || !mpesaConsumerSecret || !mpesaPassKey) {
      return res.status(400).json({
        success: false,
        message: "Business name, M-Pesa shortcode, consumer key, consumer secret, and passkey are required"
      });
    }

    // Check if shortcode already exists
    const existingBusiness = await Business.findOne({ mpesaShortCode });
    if (existingBusiness) {
      return res.status(400).json({
        success: false,
        message: "A business with this M-Pesa shortcode already exists"
      });
    }

    // Create new business
    const business = new Business({
      businessName,
      industry: industry || 'Retail',
      owner: ownerId,
      mpesaShortCode,
      mpesaConsumerKey,
      mpesaConsumerSecret,
      mpesaPassKey,
      contactEmail: contactEmail || req.user.email,
      contactPhone: contactPhone || req.user.phoneNumber,
      location: location || {},
      businessType: businessType || 'PayBill'
    });

    await business.save();

    // Add business to user's businesses array
    await User.findByIdAndUpdate(
      ownerId,
      { 
        $addToSet: { businesses: business._id },
        $set: { currentBusiness: business._id } // Set as current business
      }
    );

    res.status(201).json({
      success: true,
      message: "Business created successfully",
      business: business.getSummary()
    });

  } catch (error) {
    console.error('Create business error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while creating business",
      error: error.message
    });
  }
};

// Update business details and M-Pesa credentials
export const updateBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const {
      businessName,
      industry,
      mpesaShortCode,
      mpesaConsumerKey,
      mpesaConsumerSecret,
      mpesaPassKey,
      contactEmail,
      contactPhone,
      location,
      businessType
    } = req.body;

    const ownerId = req.user.id;

    // Find business and verify ownership
    const business = await Business.findOne({ _id: businessId, owner: ownerId });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found or you don't have permission to update it"
      });
    }

    // Check if new shortcode is already taken by another business
    if (mpesaShortCode && mpesaShortCode !== business.mpesaShortCode) {
      const existingBusiness = await Business.findOne({ 
        mpesaShortCode, 
        _id: { $ne: businessId } 
      });
      if (existingBusiness) {
        return res.status(400).json({
          success: false,
          message: "Another business with this M-Pesa shortcode already exists"
        });
      }
    }

    // Update fields
    const updateData = {};
    if (businessName) updateData.businessName = businessName;
    if (industry) updateData.industry = industry;
    if (mpesaShortCode) updateData.mpesaShortCode = mpesaShortCode;
    if (mpesaConsumerKey) updateData.mpesaConsumerKey = mpesaConsumerKey;
    if (mpesaConsumerSecret) updateData.mpesaConsumerSecret = mpesaConsumerSecret;
    if (mpesaPassKey) updateData.mpesaPassKey = mpesaPassKey;
    if (contactEmail) updateData.contactEmail = contactEmail;
    if (contactPhone) updateData.contactPhone = contactPhone;
    if (location) updateData.location = location;
    if (businessType) updateData.businessType = businessType;

    const updatedBusiness = await Business.findByIdAndUpdate(
      businessId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Business updated successfully",
      business: updatedBusiness.getSummary()
    });

  } catch (error) {
    console.error('Update business error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while updating business",
      error: error.message
    });
  }
};

// Get all businesses owned by the merchant
export const getMyBusinesses = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { page = 1, limit = 50, includeInactive = false } = req.query;

    const filter = { owner: ownerId };
    if (!includeInactive) {
      filter.isActive = true;
    }

    const businesses = await Business.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .exec();

    const total = await Business.countDocuments(filter);

    res.json({
      success: true,
      data: businesses.map(business => business.getSummary()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get businesses error:', error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching businesses",
      error: error.message
    });
  }
};

// Get specific business by ID
export const getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.params;
    const ownerId = req.user.id;

    const business = await Business.findOne({ _id: businessId, owner: ownerId });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found or you don't have permission to view it"
      });
    }

    res.json({
      success: true,
      business: business.getFullDetails()
    });

  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching business",
      error: error.message
    });
  }
};

// Delete/archive business (soft delete)
export const deleteBusiness = async (req, res) => {
  try {
    const { businessId } = req.params;
    const ownerId = req.user.id;

    // Find business and verify ownership
    const business = await Business.findOne({ _id: businessId, owner: ownerId });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found or you don't have permission to delete it"
      });
    }

    // Soft delete by setting isActive to false
    await Business.findByIdAndUpdate(businessId, { 
      isActive: false,
      updatedAt: new Date()
    });

    // Remove from user's current business if it's the current one
    await User.findByIdAndUpdate(ownerId, {
      $pull: { businesses: businessId },
      $set: { 
        currentBusiness: null 
      }
    });

    res.json({
      success: true,
      message: "Business deleted successfully"
    });

  } catch (error) {
    console.error('Delete business error:', error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting business",
      error: error.message
    });
  }
};

// Switch current business
export const switchBusiness = async (req, res) => {
  try {
    const { businessId } = req.body;
    const ownerId = req.user.id;

    // Verify the business belongs to the user
    const business = await Business.findOne({ _id: businessId, owner: ownerId, isActive: true });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found or you don't have permission to access it"
      });
    }

    // Update user's current business
    const user = await User.findByIdAndUpdate(
      ownerId,
      { currentBusiness: businessId },
      { new: true }
    ).populate('currentBusiness', 'businessName mpesaShortCode businessType');

    res.json({
      success: true,
      message: "Business switched successfully",
      currentBusiness: user.currentBusiness
    });

  } catch (error) {
    console.error('Switch business error:', error);
    res.status(500).json({
      success: false,
      message: "Server error while switching business",
      error: error.message
    });
  }
};

// Get business statistics
export const getBusinessStats = async (req, res) => {
  try {
    const { businessId } = req.params;
    const ownerId = req.user.id;

    // Verify the business belongs to the user
    const business = await Business.findOne({ _id: businessId, owner: ownerId });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found or you don't have permission to access it"
      });
    }

    const stats = await Business.getBusinessStats(businessId);

    res.json({
      success: true,
      business: business.getSummary(),
      stats
    });

  } catch (error) {
    console.error('Get business stats error:', error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching business statistics",
      error: error.message
    });
  }
};