import TokenPlan from '../models/TokenPlan.js';
import TokenService from '../services/tokenService.js';
import SubscriptionService from '../services/subscriptionService.js';

// Admin: Create a new token plan
export const createTokenPlan = async (req, res) => {
  try {
    const {
      name,
      description,
      duration,
      price,
      transactionLimit,
      revenueLimit,
      features,
      isPublic
    } = req.body;

    // Validate required fields
    if (!name || !duration || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, duration, and price are required fields'
      });
    }

    // Create new token plan
    const tokenPlan = new TokenPlan({
      name,
      description,
      duration: parseInt(duration),
      price: parseInt(price),
      transactionLimit: transactionLimit ? parseInt(transactionLimit) : 0,
      revenueLimit: revenueLimit ? parseInt(revenueLimit) : 0,
      features: features || [],
      isPublic: isPublic !== undefined ? isPublic : true,
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
      'name', 'description', 'duration', 'price', 'transactionLimit',
      'revenueLimit', 'features', 'isActive', 'isPublic'
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

// Admin: Generate token for a business
export const generateTokenForBusiness = async (req, res) => {
  try {
    const { planId, businessId } = req.body;

    if (!planId || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and Business ID are required'
      });
    }

    const result = await TokenService.generateToken(planId, businessId, {
      reference: `ADMIN-${req.user.id}-${Date.now()}`,
      adminGenerated: true
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);

  } catch (error) {
    console.error('Generate token for business error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating token',
      error: error.message
    });
  }
};

// Admin: Revoke token
export const revokeToken = async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { reason } = req.body;

    const result = await TokenService.revokeToken(tokenId, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Revoke token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while revoking token',
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
    const result = await SubscriptionService.getAvailablePlans();
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get available plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available plans',
      error: error.message
    });
  }
};

// Merchant: Subscribe to a plan
export const subscribeToPlan = async (req, res) => {
  try {
    const { planId, businessId } = req.body;
    const userId = req.user.id;

    if (!planId || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and Business ID are required'
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

    // For now, we'll handle free plans directly
    // In production, you'd integrate with payment gateway here
    const plan = await TokenPlan.findById(planId);
    if (!plan || !plan.isActive || !plan.isPublic) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive plan'
      });
    }

    // Payment integration would go here
    // For now, we'll proceed with subscription
    const paymentData = plan.price > 0 ? {
      reference: `PAY-${businessId}-${Date.now()}`,
      amount: plan.price,
      status: 'pending' // In real implementation, this would be 'completed'
    } : null;

    const result = await SubscriptionService.subscribeToPlan(planId, businessId, paymentData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);

  } catch (error) {
    console.error('Subscribe to plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while subscribing to plan',
      error: error.message
    });
  }
};

// Merchant: Get current subscription status
export const getMySubscription = async (req, res) => {
  try {
    const { businessId } = req.params;

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: req.user.id });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await SubscriptionService.getMerchantSubscription(businessId);

    res.json(result);

  } catch (error) {
    console.error('Get my subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching subscription',
      error: error.message
    });
  }
};