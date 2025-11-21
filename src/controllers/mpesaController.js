import Transaction from "../models/Transaction.js";
import mpesaService from "../services/mpesaService.js";
import { MpesaUtils } from "../utils/mpesaUtils.js";
import eventBus from "../utils/eventBus.js";
import TokenService from "../services/tokenService.js"; 

// Handle validation webhook from Daraja
export const handleValidation = async (req, res) => {
  try {
    const validationData = req.body;
    
    console.log('🔍 Validation Request Received:', {
      billRef: validationData.BillRefNumber,
      amount: validationData.TransAmount,
      phone: validationData.MSISDN,
      shortCode: validationData.BusinessShortCode
    });

    // 🆕 USE MPESAUTILS FOR VALIDATION
    const validation = MpesaUtils.validateSTKParameters(
      validationData.MSISDN, 
      validationData.TransAmount, 
      validationData.BillRefNumber
    );
    
    if (!validation.isValid) {
      return res.json({
        ResultCode: 1,
        ResultDesc: `Rejected - ${validation.errors[0]}`
      });
    }

    // Accept all valid payments for now
    res.json({
      ResultCode: 0,
      ResultDesc: "Accepted - Payment validation successful"
    });

  } catch (error) {
    console.error('Validation error:', error);
    res.json({
      ResultCode: 1,
      ResultDesc: "Rejected - Server error"
    });
  }
};

// Handle confirmation webhook from Daraja
export const handleConfirmation = async (req, res) => {
  try {
    const confirmationData = req.body;
    
    console.log('💰 Confirmation Request Received:', {
      transactionId: confirmationData.TransID,
      billRef: confirmationData.BillRefNumber,
      amount: confirmationData.TransAmount,
      phone: confirmationData.MSISDN
    });

    // 🆕 USE MPESAUTILS FOR TIMESTAMP PARSING
    const transactionTime = MpesaUtils.parseMpesaTimestamp(confirmationData.TransTime);

    // For now, we'll create a transaction without merchant association
    // Later we'll map billRefNumber to specific merchants
    const transaction = new Transaction({
      mpesaTransactionId: confirmationData.TransID,
      businessShortCode: confirmationData.BusinessShortCode,
      amount: parseFloat(confirmationData.TransAmount),
      transactionType: confirmationData.TransactionType || 'Buy Goods',
      customer: {
        phoneNumber: confirmationData.MSISDN,
        name: {
          firstName: confirmationData.FirstName || '',
          middleName: confirmationData.MiddleName || '',
          lastName: confirmationData.LastName || ''
        }
      },
      transactionTime: transactionTime, // 🆕 USING UTILS
      billRefNumber: confirmationData.BillRefNumber,
      invoiceNumber: confirmationData.InvoiceNumber,
      accountBalance: confirmationData.OrgAccountBalance ? parseFloat(confirmationData.OrgAccountBalance) : null,
      status: 'completed',
      rawMpesaResponse: confirmationData
    });

    await transaction.save();
    
    // EMIT EVENT FOR AUTO-CLASSIFICATION
    eventBus.emit("TRANSACTION_CREATED", transaction);
    
    console.log('✅ Transaction saved:', transaction.internalReference);

    // Always return 200 to Daraja even if we have processing errors
    res.status(200).json({ 
      success: true, 
      message: "Confirmation processed successfully"
    });

  } catch (error) {
    console.error('❌ Confirmation error:', error);
    res.status(200).json({ 
      success: false, 
      message: "Confirmation received but processing failed"
    });
  }
};

// Check transaction status
export const checkTransactionStatus = async (req, res) => {
  try {
    const { transactionId, phoneNumber, amount, reference } = req.body;
    
    let transaction;
    if (transactionId) {
      transaction = await Transaction.findOne({ 
        mpesaTransactionId: transactionId 
      });
    } else {
      // 🆕 USE MPESAUTILS FOR PHONE NUMBER FORMATTING
      const formattedPhone = MpesaUtils.formatPhoneNumber(phoneNumber);
      transaction = await Transaction.findOne({
        'customer.phoneNumber': formattedPhone,
        amount: parseFloat(amount),
        billRefNumber: reference,
        status: 'completed'
      }).sort({ createdAt: -1 });
    }

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    res.json({
      success: true,
      transaction: transaction.getSummary()
    });

  } catch (error) {
    console.error('Transaction status check error:', error);
    res.status(500).json({
      success: false,
      message: "Error checking transaction status"
    });
  }
};

// Get merchant transactions
export const getMerchantTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      startDate, 
      endDate 
    } = req.query;

    const merchantId = req.user.id; // From auth middleware
    
    const filter = { merchant: merchantId };
    
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.transactionTime = {};
      if (startDate) filter.transactionTime.$gte = new Date(startDate);
      if (endDate) filter.transactionTime.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(filter)
      .sort({ transactionTime: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .exec();

    const total = await Transaction.countDocuments(filter);

    // 🆕 USE MPESAUTILS FOR STATISTICS
    const stats = MpesaUtils.calculateTransactionStats(transactions);

    res.json({
      success: true,
      data: transactions.map(txn => txn.getSummary()),
      stats: {
        totalTransactions: stats.totalTransactions,
        totalAmount: MpesaUtils.formatCurrency(stats.totalAmount),
        averageAmount: MpesaUtils.formatCurrency(stats.averageAmount)
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get merchant transactions error:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching transactions"
    });
  }
};

// Get transaction analytics for merchant
export const getTransactionAnalytics = async (req, res) => {
  try {
    const merchantId = req.user.id;
    const { period = 'today' } = req.query;

    // Calculate date range based on period
    const getDateRange = (period) => {
      const now = new Date();
      const start = new Date();
      const end = new Date();

      switch (period) {
        case 'today':
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
        case 'this_week':
          start.setDate(start.getDate() - start.getDay());
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
        case 'this_month':
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
        default:
          // Last 24 hours
          start.setDate(start.getDate() - 1);
          break;
      }

      return { start, end };
    };

    const { start, end } = getDateRange(period);

    const summary = await Transaction.aggregate([
      {
        $match: {
          merchant: merchantId,
          transactionTime: { $gte: start, $lte: end },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' }
        }
      }
    ]);

    const result = summary[0] || {
      totalTransactions: 0,
      totalAmount: 0,
      averageAmount: 0
    };

    res.json({
      success: true,
      analytics: {
        ...result,
        totalAmountFormatted: MpesaUtils.formatCurrency(result.totalAmount), // 🆕 FORMATTED CURRENCY
        averageAmountFormatted: MpesaUtils.formatCurrency(result.averageAmount), // 🆕 FORMATTED CURRENCY
        period,
        dateRange: { start, end }
      }
    });

  } catch (error) {
    console.error('Get transaction analytics error:', error);
    res.status(500).json({
      success: false,
      message: "Error fetching transaction analytics"
    });
  }
};

// STK Callback from Safaricom (after customer enters PIN)
export const handleSTKCallback = async (req, res) => {
  try {
    const callback = req.body.Body.stkCallback;

    console.log("📥 STK CALLBACK RECEIVED:", callback);

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata
    } = callback;

    // Find the pending transaction by checkout request ID
    const transaction = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });

    if (!transaction) {
      console.log("❌ STK Callback: No transaction found for checkout request:", CheckoutRequestID);
      return res.json({ success: false, message: "Transaction not found" });
    }

    // MPESA result codes: 0 = success, anything else = cancelled/failed
    if (ResultCode !== 0) {
      console.log("❌ STK Failed:", ResultDesc);
      
      // 🆕 USE MPESAUTILS FOR ERROR MESSAGE PARSING
      const userFriendlyError = MpesaUtils.parseErrorCode(ResultCode.toString());
      
      // Update transaction status to failed
      await transaction.markAsFailed(userFriendlyError, ResultCode.toString());
      
      return res.json({ success: true }); // Always return success to Daraja
    }

    const meta = {};
    CallbackMetadata?.Item?.forEach(item => {
      meta[item.Name] = item.Value;
    });

    // Update transaction as completed
    await transaction.markAsCompleted(meta.MpesaReceiptNumber, callback);

    // EMIT EVENT FOR AUTO-CLASSIFICATION
    eventBus.emit("TRANSACTION_CREATED", transaction);

    console.log("✅ STK Transaction completed:", transaction.internalReference);

    res.json({ success: true });

  } catch (error) {
    console.error("❌ STK Callback error:", error);

    res.json({
      success: false,
      message: "Callback received but processing failed"
    });
  }
};

// Initiate STK Push (Lipa Na M-Pesa) - UPDATED with token validation
export const initiateSTKPush = async (req, res) => {
  try {
    const { phoneNumber, amount, accountReference, description, businessId } = req.body;
    const merchantId = req.user.id;

    // 🆕 TOKEN VALIDATION - Check if user has provided a valid token
    const tokenValue = req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!tokenValue) {
      return res.status(401).json({
        success: false,
        message: 'API token is required for transactions. Please subscribe to a token plan.'
      });
    }

    // Validate the token
    const tokenValidation = await TokenService.validateToken(tokenValue, amount);
    if (!tokenValidation.isValid) {
      return res.status(403).json({
        success: false,
        message: tokenValidation.message
      });
    }

    // 🆕 USE MPESAUTILS FOR VALIDATION
    const validation = MpesaUtils.validateSTKParameters(phoneNumber, amount, accountReference);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors.join(', ')
      });
    }

    // Get business credentials from database
    const businessCredentials = await mpesaService.getBusinessCredentials(businessId, merchantId);
    
    if (!businessCredentials.success) {
      return res.status(400).json({
        success: false,
        message: businessCredentials.message
      });
    }

    // Create pending transaction first
    const pendingTransaction = new Transaction({
      mpesaTransactionId: `PENDING-${Date.now()}`,
      internalReference: MpesaUtils.generateTransactionReference('STK'), // 🆕 USING UTILS
      merchant: merchantId,
      business: businessId, // Link to specific business
      businessShortCode: businessCredentials.shortCode,
      amount: validation.amount, // 🆕 USING VALIDATED AMOUNT
      transactionType: 'Buy Goods',
      customer: {
        phoneNumber: validation.formattedPhone // 🆕 USING FORMATTED PHONE
      },
      transactionTime: new Date(),
      billRefNumber: accountReference,
      status: 'pending',
      source: 'mpesa-api',
      description: description || `STK Push payment for ${accountReference}`,
      tokenUsed: tokenValidation.token._id // 🆕 RECORD WHICH TOKEN WAS USED
    });

    await pendingTransaction.save();

    // Initiate STK Push via M-Pesa service with business credentials
    const stkResult = await mpesaService.initiateSTKPush({
      phoneNumber: validation.formattedPhone, // 🆕 USING FORMATTED PHONE
      amount: validation.amount, // 🆕 USING VALIDATED AMOUNT
      accountReference,
      transactionDesc: description || `Payment for ${accountReference}`,
      businessShortCode: businessCredentials.shortCode,
      consumerKey: businessCredentials.consumerKey,
      consumerSecret: businessCredentials.consumerSecret,
      passKey: businessCredentials.passKey
    });

    if (!stkResult.success) {
      // 🆕 USE MPESAUTILS FOR ERROR MESSAGE PARSING
      const userFriendlyError = MpesaUtils.parseErrorCode(stkResult.errorCode);
      
      // Update transaction status to failed
      await Transaction.findByIdAndUpdate(pendingTransaction._id, {
        status: 'failed',
        description: `STK Push failed: ${userFriendlyError}`
      });

      return res.status(400).json({
        success: false,
        message: userFriendlyError
      });
    }

    // Update transaction with checkout request ID
    await Transaction.findByIdAndUpdate(pendingTransaction._id, {
      checkoutRequestId: stkResult.checkoutRequestId
    });

    // 🆕 RECORD TOKEN USAGE ASYNCHRONOUSLY (don't block the response)
    TokenService.recordTokenUsage(tokenValidation.token._id, amount)
      .catch(error => {
        console.error('Error recording token usage:', error);
      });

    res.json({
      success: true,
      message: "STK Push initiated successfully",
      checkoutRequestId: stkResult.checkoutRequestId,
      customerMessage: stkResult.customerMessage,
      internalReference: pendingTransaction.internalReference,
      business: {
        id: businessId,
        name: businessCredentials.businessName,
        shortCode: businessCredentials.shortCode
      },
      tokenInfo: { // 🆕 RETURN TOKEN INFO FOR TRANSPARENCY
        tokenId: tokenValidation.token._id,
        transactionsRemaining: tokenValidation.token.plan.transactionLimit - tokenValidation.token.transactionsUsed,
        usagePercentage: tokenValidation.token.usagePercentage
      }
    });

  } catch (error) {
    console.error('STK Push initiation error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to initiate STK Push"
    });
  }
};