import SubscriptionService from '../services/subscriptionService.js';
import TokenService from '../services/tokenService.js';

// Merchant: Get subscription details for all businesses
export const getMySubscriptions = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await SubscriptionService.getSubscriptionsByUser(userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get my subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching subscriptions',
      error: error.message
    });
  }
};

// Merchant: Get specific business subscription
export const getBusinessSubscription = async (req, res) => {
  try {
    const { businessId } = req.params;
    const userId = req.user.id;

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: userId });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await SubscriptionService.getMerchantSubscription(businessId);

    res.json(result);

  } catch (error) {
    console.error('Get business subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching business subscription',
      error: error.message
    });
  }
};

// Merchant: Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    const { businessId } = req.params;
    const userId = req.user.id;

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: userId });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await SubscriptionService.cancelSubscription(businessId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling subscription',
      error: error.message
    });
  }
};

// Merchant: Enable auto-renewal
export const enableAutoRenew = async (req, res) => {
  try {
    const { businessId } = req.params;
    const userId = req.user.id;

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: userId });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await SubscriptionService.enableAutoRenew(businessId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Enable auto-renewal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while enabling auto-renewal',
      error: error.message
    });
  }
};

// Merchant: Disable auto-renewal
export const disableAutoRenew = async (req, res) => {
  try {
    const { businessId } = req.params;
    const userId = req.user.id;

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: userId });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await SubscriptionService.disableAutoRenew(businessId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Disable auto-renewal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while disabling auto-renewal',
      error: error.message
    });
  }
};

// Merchant: Get token status for business
export const getTokenStatus = async (req, res) => {
  try {
    const { businessId } = req.params;
    const userId = req.user.id;

    // Verify business belongs to user
    const Business = await import('../models/Business.js').then(mod => mod.default);
    const business = await Business.findOne({ _id: businessId, owner: userId });
    
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Business not found or you do not have permission'
      });
    }

    const result = await TokenService.getBusinessTokenStatus(businessId);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Get token status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching token status',
      error: error.message
    });
  }
};

// Admin: Get all subscriptions
export const getAllSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;

    const result = await SubscriptionService.getAllSubscriptions({
      page: parseInt(page),
      limit: parseInt(limit),
      status
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get all subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching all subscriptions',
      error: error.message
    });
  }
};

// Admin: Check expired subscriptions (cron job endpoint)
export const checkExpiredSubscriptions = async (req, res) => {
  try {
    const result = await SubscriptionService.checkExpiredSubscriptions();

    res.json(result);

  } catch (error) {
    console.error('Check expired subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking expired subscriptions',
      error: error.message
    });
  }
};

// Add this method to SubscriptionService and import it
const getSubscriptionsByUser = async (userId) => {
  try {
    const subscriptions = await Subscription.findByUser(userId);
    
    // Get token status for each subscription
    const subscriptionsWithStatus = await Promise.all(
      subscriptions.map(async (subscription) => {
        const tokenStatus = await TokenService.getBusinessTokenStatus(subscription.business._id);
        return {
          subscription: subscription.getSummary(),
          tokenStatus
        };
      })
    );

    return {
      success: true,
      subscriptions: subscriptionsWithStatus,
      count: subscriptionsWithStatus.length
    };

  } catch (error) {
    console.error('Get subscriptions by user error:', error);
    return {
      success: false,
      message: error.message
    };
  }
};

// Update the SubscriptionService import to include this method
export { getSubscriptionsByUser };