import TokenService from '../services/tokenService.js';

// Middleware to validate token for transactions
export const validateToken = async (req, res, next) => {
  try {
    const tokenValue = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!tokenValue) {
      return res.status(401).json({
        success: false,
        message: 'API token is required for this operation'
      });
    }

    // Get transaction amount from request body if available
    const transactionAmount = req.body?.amount || 0;

    // Validate the token
    const validationResult = await TokenService.validateToken(tokenValue, transactionAmount);
    
    if (!validationResult.isValid) {
      return res.status(403).json({
        success: false,
        message: validationResult.message
      });
    }

    // Attach token and business info to request
    req.token = validationResult.token;
    req.business = validationResult.token.business;
    
    next();

  } catch (error) {
    console.error('Token validation middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Token validation failed'
    });
  }
};

// Middleware to record token usage after successful transaction
export const recordTokenUsage = async (req, res, next) => {
  // Store the original send function
  const originalSend = res.send;

  // Override the send function
  res.send = async function(data) {
    try {
      // Only record usage if the request was successful and we have a token
      if (res.statusCode >= 200 && res.statusCode < 300 && req.token) {
        const transactionAmount = req.body?.amount || 0;
        
        // Record token usage asynchronously (don't block response)
        TokenService.recordTokenUsage(req.token._id, transactionAmount)
          .catch(error => {
            console.error('Error recording token usage:', error);
          });
      }
    } catch (error) {
      console.error('Error in recordTokenUsage middleware:', error);
    }

    // Call the original send function
    originalSend.call(this, data);
  };

  next();
};

// Middleware to check if business has active subscription
export const requireActiveSubscription = async (req, res, next) => {
  try {
    const businessId = req.business?._id || req.params.businessId || req.body.businessId;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID is required'
      });
    }

    const tokenStatus = await TokenService.getBusinessTokenStatus(businessId);
    
    if (!tokenStatus.canMakeTransactions) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required for transactions',
        tokenStatus
      });
    }

    // Attach token status to request
    req.tokenStatus = tokenStatus;
    next();

  } catch (error) {
    console.error('Active subscription check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Subscription check failed'
    });
  }
};

// Middleware for admin token management
export const requireTokenAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required for token management'
    });
  }
  next();
};

// Optional: Middleware to attach token to response for merchant endpoints
export const attachTokenStatus = async (req, res, next) => {
  try {
    const businessId = req.business?._id || req.params.businessId;
    
    if (businessId) {
      const tokenStatus = await TokenService.getBusinessTokenStatus(businessId);
      req.tokenStatus = tokenStatus;
    }
    
    next();
  } catch (error) {
    console.error('Attach token status error:', error);
    // Don't block the request if token status fails
    next();
  }
};