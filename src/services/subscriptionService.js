import Token from '../models/Token.js';
import Subscription from '../models/Subscription.js';

class SubscriptionService {
  // Subscribe to a token (merchant function)
  async subscribeToToken(tokenId, businessId, userId) {
    try {
      // Find the token
      const token = await Token.findById(tokenId);
      if (!token) {
        throw new Error('Token not found');
      }

      if (token.status !== 'active') {
        throw new Error('Token is not active');
      }

      if (token.business) {
        throw new Error('Token is already assigned to a business');
      }

      // Check if business already has active subscription
      const existingSubscription = await Subscription.findOne({ 
        business: businessId, 
        status: 'active' 
      });
      
      if (existingSubscription) {
        throw new Error('Business already has an active subscription');
      }

      // Assign token to business and activate
      token.business = businessId;
      await token.activate();

      // Create subscription record
      const subscription = new Subscription({
        business: businessId,
        user: userId,
        token: tokenId,
        status: 'active',
        startDate: new Date(),
        // Calculate end date based on plan duration
        endDate: token.expiresAt
      });

      await subscription.save();
      await subscription.populate('token');

      return {
        success: true,
        subscription: subscription.getSummary(),
        token: token.getSummary(),
        message: 'Subscription created successfully'
      };

    } catch (error) {
      console.error('Subscription creation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get business subscription
  async getBusinessSubscription(businessId) {
    try {
      const subscription = await Subscription.findOne({ business: businessId })
        .populate('token')
        .populate('business')
        .exec();

      if (!subscription) {
        return {
          success: true,
          hasSubscription: false,
          subscription: null
        };
      }

      return {
        success: true,
        hasSubscription: true,
        subscription: subscription.getSummary()
      };

    } catch (error) {
      console.error('Get business subscription error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get subscriptions by user
  async getSubscriptionsByUser(userId) {
    try {
      const subscriptions = await Subscription.find({ user: userId })
        .populate('token')
        .populate('business')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        subscriptions: subscriptions.map(sub => sub.getSummary()),
        count: subscriptions.length
      };

    } catch (error) {
      console.error('Get subscriptions by user error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Cancel subscription
  async cancelSubscription(businessId) {
    try {
      const subscription = await Subscription.findOne({ 
        business: businessId, 
        status: 'active' 
      });
      
      if (!subscription) {
        throw new Error('Active subscription not found');
      }

      // Update subscription status
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      await subscription.save();

      // Deactivate the token
      const token = await Token.findById(subscription.token);
      if (token) {
        token.status = 'suspended';
        await token.save();
      }

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

  // Get all subscriptions (admin function)
  async getAllSubscriptions({ page = 1, limit = 50, status = null }) {
    try {
      let filter = {};
      if (status) {
        filter.status = status;
      }

      const subscriptions = await Subscription.find(filter)
        .populate('token')
        .populate('business')
        .populate('user', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
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

  // Check expired subscriptions (cron job)
  async checkExpiredSubscriptions() {
    try {
      const now = new Date();
      
      // Find expired subscriptions
      const expiredSubscriptions = await Subscription.find({
        status: 'active',
        endDate: { $lt: now }
      }).populate('token');

      let processed = 0;

      for (const subscription of expiredSubscriptions) {
        // Update subscription status
        subscription.status = 'expired';
        await subscription.save();

        // Update token status if exists
        if (subscription.token) {
          const token = await Token.findById(subscription.token);
          if (token) {
            token.status = 'expired';
            await token.save();
          }
        }

        processed++;
      }

      return {
        success: true,
        message: `Processed ${processed} expired subscriptions`,
        processed
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