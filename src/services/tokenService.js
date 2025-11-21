import Token from '../models/Token.js';
import TokenPlan from '../models/TokenPlan.js';
import Subscription from '../models/Subscription.js';

class TokenService {
  // Generate a new token for a business
  async generateToken(planId, businessId, paymentData = null) {
    try {
      // Verify plan exists and is active
      const plan = await TokenPlan.findById(planId);
      if (!plan || !plan.isActive) {
        throw new Error('Token plan not found or inactive');
      }

      // Check if business already has an active token
      const existingToken = await Token.findActiveByBusiness(businessId);
      if (existingToken) {
        throw new Error('Business already has an active token');
      }

      // Create new token
      const token = new Token({
        plan: planId,
        business: businessId,
        paymentReference: paymentData?.reference || null
      });

      await token.save();
      await token.populate('plan');

      // Update or create subscription
      await this.updateBusinessSubscription(businessId, token._id);

      return {
        success: true,
        token: token.getSummary(),
        message: 'Token generated successfully'
      };

    } catch (error) {
      console.error('Token generation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Validate token for transaction
  async validateToken(tokenValue, amount = 0) {
    try {
      // Find active token
      const token = await Token.findByValue(tokenValue);
      if (!token) {
        return {
          isValid: false,
          message: 'Invalid or expired token'
        };
      }

      // Check if token can be used
      if (!token.canUse(amount)) {
        return {
          isValid: false,
          message: 'Token usage limits exceeded'
        };
      }

      return {
        isValid: true,
        token: token,
        message: 'Token is valid'
      };

    } catch (error) {
      console.error('Token validation error:', error);
      return {
        isValid: false,
        message: 'Token validation failed'
      };
    }
  }

  // Update token usage after transaction
  async recordTokenUsage(tokenId, amount = 0) {
    try {
      const token = await Token.findById(tokenId).populate('plan');
      
      if (!token) {
        return { success: false, message: 'Token not found' };
      }

      // Check if token can be used
      const usageCheckRaw = token.canUse(amount);
      const usageCheck = (typeof usageCheckRaw === 'object') ? usageCheckRaw : {
        canUse: !!usageCheckRaw,
        reason: usageCheckRaw ? null : 'Token usage limits exceeded'
      };

      if (!usageCheck.canUse) {
        return { 
          success: false, 
          message: usageCheck.reason,
          token: token.getSummary()
        };
      }

      // Increment usage
      const updatedToken = await Token.incrementUsage(tokenId, amount);
      
      // Check if we just reached the limit
      const plan = updatedToken.plan;
      let newStatus = 'active';
      
      if (plan.transactionLimit > 0 && updatedToken.transactionsUsed >= plan.transactionLimit) {
        newStatus = 'expired';
      } else if (plan.revenueLimit > 0 && updatedToken.revenueUsed >= plan.revenueLimit) {
        newStatus = 'expired';
      }

      if (newStatus === 'expired') {
        updatedToken.status = newStatus;
        await updatedToken.save();
      }

      return {
        success: true,
        token: updatedToken.getSummary(),
        limitReached: newStatus === 'expired'
      };

    } catch (error) {
      console.error('Token usage recording error:', error);
      return {
        success: false,
        message: error.message || 'Error updating token usage'
      };
    }
  }

  // Update business subscription
  async updateBusinessSubscription(businessId, tokenId) {
    try {
      // Find the business to get the owner
      const Business = await import('../models/Business.js').then(mod => mod.default);
      const business = await Business.findById(businessId).populate('owner');
      
      if (!business) {
        throw new Error('Business not found');
      }

      // Find or create subscription
      let subscription = await Subscription.findOne({ business: businessId });
      
      if (subscription) {
        // Update existing subscription
        await subscription.updateToken(tokenId);
      } else {
        // Create new subscription
        subscription = new Subscription({
          business: businessId,
          user: business.owner._id,
          currentToken: tokenId,
          status: 'active'
        });
        await subscription.save();
      }

      await subscription.populate('currentToken');
      return subscription;

    } catch (error) {
      console.error('Subscription update error:', error);
      throw error;
    }
  }

  // Get business token status
  async getBusinessTokenStatus(businessId) {
    try {
      const token = await Token.findActiveByBusiness(businessId);
      const subscription = await Subscription.findOne({ business: businessId });

      return {
        hasActiveToken: !!token,
        currentToken: token ? token.getSummary() : null,
        subscription: subscription ? subscription.getSummary() : null,
        canMakeTransactions: !!token && token.isActive && token.canUse(0)
      };

    } catch (error) {
      console.error('Business token status error:', error);
      return {
        hasActiveToken: false,
        currentToken: null,
        subscription: null,
        canMakeTransactions: false
      };
    }
  }

  // Revoke token (admin function)
  async revokeToken(tokenId, reason = 'Admin action') {
    try {
      const token = await Token.findById(tokenId);
      if (!token) {
        throw new Error('Token not found');
      }

      await token.revoke();
      
      return {
        success: true,
        message: 'Token revoked successfully',
        token: token.getSummary()
      };

    } catch (error) {
      console.error('Token revocation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get token usage analytics
  async getTokenAnalytics(tokenId) {
    try {
      const token = await Token.findById(tokenId).populate('plan').populate('business');
      if (!token) {
        throw new Error('Token not found');
      }

      const usagePercentage = token.usagePercentage;
      const daysRemaining = token.daysRemaining;
      
      // Calculate average daily usage
      const daysActive = Math.ceil((new Date() - token.startDate) / (1000 * 60 * 60 * 24));
      const avgDailyTransactions = daysActive > 0 ? token.transactionsUsed / daysActive : 0;
      const avgDailyRevenue = daysActive > 0 ? token.revenueUsed / daysActive : 0;

      return {
        token: token.getSummary(),
        analytics: {
          usagePercentage,
          daysRemaining,
          daysActive,
          avgDailyTransactions: Math.round(avgDailyTransactions * 100) / 100,
          avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
          projectedEndUsage: usagePercentage > 0 ? 
            (daysRemaining / (usagePercentage / 100)) - daysRemaining : 0
        }
      };

    } catch (error) {
      console.error('Token analytics error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default new TokenService();