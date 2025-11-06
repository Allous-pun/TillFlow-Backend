import Transaction from "../models/Transaction.js";
import mpesaService from "../services/mpesaService.js";
import { MpesaUtils } from "../utils/mpesaUtils.js"; // Changed this line

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

    // Basic validation
    if (!validationData.BillRefNumber || !validationData.TransAmount || !validationData.MSISDN) {
      return res.json({
        ResultCode: 1,
        ResultDesc: "Rejected - Missing required fields"
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

    // Parse M-Pesa timestamp
    const parseMpesaTimestamp = (timestamp) => {
      const year = timestamp.substring(0, 4);
      const month = timestamp.substring(4, 6);
      const day = timestamp.substring(6, 8);
      const hour = timestamp.substring(8, 10);
      const minute = timestamp.substring(10, 12);
      const second = timestamp.substring(12, 14);
      return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    };

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
      transactionTime: parseMpesaTimestamp(confirmationData.TransTime),
      billRefNumber: confirmationData.BillRefNumber,
      invoiceNumber: confirmationData.InvoiceNumber,
      accountBalance: confirmationData.OrgAccountBalance ? parseFloat(confirmationData.OrgAccountBalance) : null,
      status: 'completed',
      rawMpesaResponse: confirmationData
    });

    await transaction.save();
    
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
      transaction = await Transaction.findOne({
        'customer.phoneNumber': phoneNumber,
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

    res.json({
      success: true,
      data: transactions.map(txn => txn.getSummary()),
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