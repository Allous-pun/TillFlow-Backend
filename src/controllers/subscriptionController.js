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

    const result = await SubscriptionService.getBusinessSubscription(businessId);

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