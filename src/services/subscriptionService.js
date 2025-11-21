import Subscription from '../models/Subscription.js';
import Token from '../models/Token.js';
import TokenPlan from '../models/TokenPlan.js';

class SubscriptionService {
  // Get available plans for merchant
  async getAvailablePlans() {
    try {
      const plans = await TokenPlan.findActivePlans();
      
      return {
        success: true,
        plans: plans.map(plan => plan.getSummary()),
        count: plans.length
      };

    } catch (error) {
      console.error('Get available plans error:', error);
      return {
        success: false,
        message: 'Failed to fetch available plans',
        plans: [],
        count: 0
      };
    }
  }

  // Subscribe to a plan
  async subscribeToPlan(planId, businessId, paymentData = null) {
    try {
      const TokenService = await import('./tokenService.js').then(mod => mod.default);
      
      // Generate token for this subscription
      const tokenResult = await TokenService.generateToken(planId, businessId, paymentData);
      
      if (!tokenResult.success) {
        throw new Error(tokenResult.message);
      }

      return {
        success: true,
        message: 'Subscription created successfully',
        token: tokenResult.token,
        subscription: await Subscription.findOne({ business: businessId })
      };

    } catch (error) {
      console.error('Subscription error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get merchant subscription details
  async getMerchantSubscription(businessId) {
    try {
      const subscription = await Subscription.findByBusiness(businessId);
      const TokenService = await import('./tokenService.js').then(mod => mod.default);
      const tokenStatus = await TokenService.getBusinessTokenStatus(businessId);

      if (!subscription) {
        return {
          success: true,
          hasSubscription: false,
          message: 'No active subscription found',
          tokenStatus
        };
      }

      return {
        success: true,
        hasSubscription: true,
        subscription: subscription.getSummary(),
        tokenStatus
      };

    } catch (error) {
      console.error('Get merchant subscription error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Cancel subscription
  async cancelSubscription(businessId) {
    try {
      const subscription = await Subscription.findOne({ business: businessId });
      
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      await subscription.cancel();

      return {
        success: true,
        message: 'Subscription cancelled successfully',
        subscription: subscription.getSummary()
      };

    } catch (error) {
      console.error('Cancel subscription error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Enable auto-renewal
  async enableAutoRenew(businessId) {
    try {
      const subscription = await Subscription.findOne({ business: businessId });
      
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      await subscription.enableAutoRenew();

      return {
        success: true,
        message: 'Auto-renewal enabled successfully',
        subscription: subscription.getSummary()
      };

    } catch (error) {
      console.error('Enable auto-renewal error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Disable auto-renewal
  async disableAutoRenew(businessId) {
    try {
      const subscription = await Subscription.findOne({ business: businessId });
      
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      await subscription.disableAutoRenew();

      return {
        success: true,
        message: 'Auto-renewal disabled successfully',
        subscription: subscription.getSummary()
      };

    } catch (error) {
      console.error('Disable auto-renewal error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get all subscriptions (admin function)
  async getAllSubscriptions(options = {}) {
    try {
      const { page = 1, limit = 50, status } = options;
      const skip = (page - 1) * limit;

      const filter = {};
      if (status) filter.status = status;

      const subscriptions = await Subscription.find(filter)
        .populate('currentToken')
        .populate('business', 'businessName mpesaShortCode businessType')
        .populate('user', 'fullName email phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      const total = await Subscription.countDocuments(filter);

      return {
        success: true,
        subscriptions: subscriptions.map(sub => sub.getSummary()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };

    } catch (error) {
      console.error('Get all subscriptions error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Check for expired subscriptions and tokens
  async checkExpiredSubscriptions() {
    try {
      const now = new Date();
      
      // Find expired tokens
      const expiredTokens = await Token.find({
        status: 'active',
        expiryDate: { $lte: now }
      });

      // Update expired tokens
      for (const token of expiredTokens) {
        token.status = 'expired';
        await token.save();
      }

      // Find subscriptions with expired tokens
      const expiredSubscriptions = await Subscription.find({
        status: 'active',
        currentToken: { $in: expiredTokens.map(t => t._id) }
      });

      // Update subscriptions
      for (const subscription of expiredSubscriptions) {
        subscription.status = 'expired';
        await subscription.save();
      }

      return {
        success: true,
        expiredTokens: expiredTokens.length,
        expiredSubscriptions: expiredSubscriptions.length,
        message: `Processed ${expiredTokens.length} expired tokens and ${expiredSubscriptions.length} expired subscriptions`
      };

    } catch (error) {
      console.error('Check expired subscriptions error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default new SubscriptionService();