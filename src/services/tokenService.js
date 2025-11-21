import Token from '../models/Token.js';
import TokenPlan from '../models/TokenPlan.js';
import Subscription from '../models/Subscription.js';

class TokenService {
  // Create a new token (admin function)
  async createToken(tokenData) {
    try {
      const {
        planId,
        price,
        transactionLimit = 0,
        revenueLimit = 0,
        businessId = null,
        createdBy
      } = tokenData;

      // Verify plan exists
      const plan = await TokenPlan.findById(planId);
      if (!plan) {
        throw new Error('Token plan not found');
      }

      // Create new token
      const token = new Token({
        plan: planId,
        price: parseInt(price),
        transactionLimit: parseInt(transactionLimit),
        revenueLimit: parseInt(revenueLimit),
        business: businessId,
        status: 'active'
      });

      // If business is assigned, activate immediately
      if (businessId) {
        await token.activate();
      }

      await token.save();
      await token.populate('plan');

      return {
        success: true,
        token: token.getSummary(),
        message: 'Token created successfully'
      };

    } catch (error) {
      console.error('Token creation error:', error);
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
      const token = await Token.findOne({ 
        tokenValue, 
        status: 'active' 
      }).populate('plan').populate('business');
      
      if (!token) {
        return {
          isValid: false,
          message: 'Invalid or expired token'
        };
      }

      // Check if token can be used
      const canUse = token.canProcessTransaction(amount);
      if (!canUse.canUse) {
        return {
          isValid: false,
          message: canUse.reason
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

      // Process the transaction
      const result = await token.processTransaction(amount);
      
      if (!result.success) {
        return { 
          success: false, 
          message: result.reason,
          token: token.getSummary()
        };
      }

      return {
        success: true,
        token: token.getSummary(),
        limitReached: token.status === 'expired'
      };

    } catch (error) {
      console.error('Token usage recording error:', error);
      return {
        success: false,
        message: error.message || 'Error updating token usage'
      };
    }
  }

  // Activate token (admin function)
  async activateToken(tokenId) {
    try {
      const token = await Token.findById(tokenId);
      if (!token) {
        throw new Error('Token not found');
      }

      await token.activate();
      
      return {
        success: true,
        message: 'Token activated successfully',
        token: token.getSummary()
      };

    } catch (error) {
      console.error('Token activation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Deactivate token (admin function)
  async deactivateToken(tokenId, reason = 'Admin action') {
    try {
      const token = await Token.findById(tokenId);
      if (!token) {
        throw new Error('Token not found');
      }

      token.status = 'suspended';
      token.updatedAt = new Date();
      await token.save();
      
      return {
        success: true,
        message: 'Token deactivated successfully',
        token: token.getSummary()
      };

    } catch (error) {
      console.error('Token deactivation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get business token status
  async getBusinessTokenStatus(businessId) {
    try {
      const token = await Token.findOne({ 
        business: businessId, 
        status: 'active' 
      }).populate('plan');
      
      const canMakeTransactions = token ? token.isActive : false;

      return {
        hasActiveToken: !!token,
        currentToken: token ? token.getSummary() : null,
        canMakeTransactions,
        usagePercentage: token ? token.usagePercentage : 0,
        daysRemaining: token ? token.daysRemaining : 0
      };

    } catch (error) {
      console.error('Business token status error:', error);
      return {
        hasActiveToken: false,
        currentToken: null,
        canMakeTransactions: false,
        usagePercentage: 0,
        daysRemaining: 0
      };
    }
  }

  // Get token analytics
  async getTokenAnalytics(tokenId) {
    try {
      const token = await Token.findById(tokenId).populate('plan').populate('business');
      if (!token) {
        throw new Error('Token not found');
      }

      const usagePercentage = token.usagePercentage;
      const daysRemaining = token.daysRemaining;
      
      // Calculate average daily usage
      const daysActive = token.activatedAt ? 
        Math.ceil((new Date() - token.activatedAt) / (1000 * 60 * 60 * 24)) : 0;
      
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
          projectedEndDate: daysRemaining > 0 && avgDailyTransactions > 0 ? 
            new Date(Date.now() + (daysRemaining * 24 * 60 * 60 * 1000)) : null
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