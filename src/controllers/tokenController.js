import TokenPlan from '../models/TokenPlan.js';
import Token from '../models/Token.js';
import TokenService from '../services/tokenService.js';
import SubscriptionService from '../services/subscriptionService.js';

// Admin: Create a new token plan (template without pricing)
export const createTokenPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      duration,
      features,
      isPublic = true
    } = req.body;

    // Validate required fields
    if (!name || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Name and duration are required fields'
      });
    }

    // Create new token plan
    const tokenPlan = new TokenPlan({
      name,
      description,
      duration: parseInt(duration),
      features: features || [],
      isPublic,
      createdBy: req.user.id
    });

    await tokenPlan.save();

    res.status(201).json({
      success: true,
      message: 'Token plan created successfully',
      plan: tokenPlan.getFullDetails()
    });

  } catch (error) {
    console.error('Create token plan error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating token plan',
      error: error.message
    });
  }
};

// Admin: Get all token plans
export const getTokenPlans = async (req, res) => {
  try {
    const { page = 1, limit = 50, activeOnly = false } = req.query;

    let filter = {};
    if (activeOnly === 'true') {
      filter.isActive = true;
    }

    const plans = await TokenPlan.find(filter)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .exec();

    const total = await TokenPlan.countDocuments(filter);

    res.json({
      success: true,
      plans: plans.map(plan => plan.getFullDetails()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get token plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching token plans',
      error: error.message
    });
  }
};

// Admin: Update token plan
export const updateTokenPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const updateData = req.body;

    // Find the plan
    const plan = await TokenPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Token plan not found'
      });
    }

    // Update fields
    const allowedFields = [
      'name', 'description', 'duration', 'features', 'isActive', 'isPublic'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        plan[field] = updateData[field];
      }
    });

    plan.updatedAt = new Date();
    await plan.save();

    res.json({
      success: true,
      message: 'Token plan updated successfully',
      plan: plan.getFullDetails()
    });

  } catch (error) {
    console.error('Update token plan error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating token plan',
      error: error.message
    });
  }
};

// Admin: Delete token plan (soft delete)
export const deleteTokenPlan = async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await TokenPlan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Token plan not found'
      });
    }

    // Check if there are active tokens using this plan
    const activeTokens = await Token.countDocuments({ 
      plan: planId, 
      status: 'active' 
    });

    if (activeTokens > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan. There are ${activeTokens} active tokens using this plan.`
      });
    }

    // Instead of deleting, we deactivate and hide
    plan.isActive = false;
    plan.isPublic = false;
    await plan.save();

    res.json({
      success: true,
      message: 'Token plan deactivated successfully'
    });

  } catch (error) {
    console.error('Delete token plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting token plan',
      error: error.message
    });
  }
};

// Admin: Create a token with pricing and limits
export const createToken = async (req, res) => {
  try {
    const {
      planId,
      price,
      transactionLimit = 0,
      revenueLimit = 0,
      businessId = null
    } = req.body;

    if (!planId || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and price are required'
      });
    }

    const result = await TokenService.createToken({
      planId,
      price: parseInt(price),
      transactionLimit: parseInt(transactionLimit),
      revenueLimit: parseInt(revenueLimit),
      businessId,
      createdBy: req.user.id
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);

  } catch (error) {
    console.error('Create token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating token',
      error: error.message
    });
  }
};

// Admin: Get all tokens
export const getAllTokens = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      businessId, 
      planId,
      activeOnly = false
    } = req.query;

    let filter = {};
    
    if (status) filter.status = status;
    if (businessId) filter.business = businessId;
    if (planId) filter.plan = planId;
    if (activeOnly === 'true') filter.status = 'active';

    const tokens = await Token.find(filter)
      .populate('plan')
      .populate('business', 'businessName mpesaShortCode businessType owner')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .exec();

    const total = await Token.countDocuments(filter);

    res.json({
      success: true,
      tokens: tokens.map(token => token.getSummary()),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get all tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tokens',
      error: error.message
    });
  }
};

// Admin: Update token
export const updateToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    const updateData = req.body;

    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    // Only allow updating certain fields
    const allowedFields = ['price', 'transactionLimit', 'revenueLimit', 'status'];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        token[field] = updateData[field];
      }
    });

    token.updatedAt = new Date();
    await token.save();

    res.json({
      success: true,
      message: 'Token updated successfully',
      token: token.getSummary()
    });

  } catch (error) {
    console.error('Update token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating token',
      error: error.message
    });
  }
};

// Admin: Activate token
export const activateToken = async (req, res) => {
  try {
    const { tokenId } = req.params;

    const result = await TokenService.activateToken(tokenId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Activate token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while activating token',
      error: error.message
    });
  }
};

// Admin: Deactivate token
export const deactivateToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { reason } = req.body;

    const result = await TokenService.deactivateToken(tokenId, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Deactivate token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deactivating token',
      error: error.message
    });
  }
};

// Admin: Delete token
export const deleteToken = async (req, res) => {
  try {
    const { tokenId } = req.params;

    const token = await Token.findById(tokenId);
    if (!token) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    if (token.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active token. Deactivate it first.'
      });
    }

    await Token.findByIdAndDelete(tokenId);

    res.json({
      success: true,
      message: 'Token deleted successfully'
    });

  } catch (error) {
    console.error('Delete token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting token',
      error: error.message
    });
  }
};

// Admin: Get token analytics
export const getTokenAnalytics = async (req, res) => {
  try {
    const { tokenId } = req.params;

    const result = await TokenService.getTokenAnalytics(tokenId);

    if (!result.token) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Get token analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching token analytics',
      error: error.message
    });
  }
};

// Merchant: Get available plans
export const getAvailablePlans = async (req, res) => {
  try {
    const plans = await TokenPlan.findActivePlans();
    
    res.json({
      success: true,
      plans: plans.map(plan => plan.getSummary()),
      count: plans.length
    });

  } catch (error) {
    console.error('Get available plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available plans',
      error: error.message
    });
  }
};

// Merchant: Get available tokens for subscription
export const getAvailableTokens = async (req, res) => {
  try {
    const tokens = await Token.find({ 
      status: 'active', 
      business: null // Tokens not assigned to any business
    })
    .populate('plan')
    .sort({ price: 1 })
    .exec();

    res.json({
      success: true,
      tokens: tokens.map(token => token.getSummary()),
      count: tokens.length
    });

  } catch (error) {
    console.error('Get available tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available tokens',
      error: error.message
    });
  }
};

// Merchant: Subscribe to a token
export const subscribeToToken = async (req, res) => {
  try {
    const { tokenId, businessId } = req.body;
    const userId = req.user.id;

    if (!tokenId || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'Token ID and Business ID are required'
      });
    }

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: userId });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await SubscriptionService.subscribeToToken(tokenId, businessId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);

  } catch (error) {
    console.error('Subscribe to token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while subscribing to token',
      error: error.message
    });
  }
};

// Merchant: Get my active tokens
export const getMyActiveTokens = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get businesses owned by user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const businesses = await Business.find({ owner: userId }).select('_id');
    const businessIds = businesses.map(b => b._id);

    const tokens = await Token.find({ 
      business: { $in: businessIds },
      status: 'active'
    })
    .populate('plan')
    .populate('business', 'businessName mpesaShortCode')
    .sort({ activatedAt: -1 })
    .exec();

    res.json({
      success: true,
      tokens: tokens.map(token => token.getSummary()),
      count: tokens.length
    });

  } catch (error) {
    console.error('Get my active tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active tokens',
      error: error.message
    });
  }
};

// DEPRECATED - Remove these old functions or keep for backward compatibility
export const generateTokenForBusiness = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use POST /admin/tokens instead.'
  });
};

export const revokeToken = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use PUT /admin/tokens/:tokenId/deactivate instead.'
  });
};

export const subscribeToPlan = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use POST /subscribe with tokenId instead.'
  });
};

export const getMySubscription = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use GET /my-tokens instead.'
  });
};