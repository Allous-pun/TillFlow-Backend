import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  // Source of transaction
  source: {
    type: String,
    enum: ['mpesa-api', 'manual-pdf', 'manual-csv', 'stk-push'],
    required: true,
    default: 'mpesa-api',
    //index: true
  },

  // Core Transaction Identifiers
  mpesaTransactionId: {
    type: String,
    required: function() {
      // Only require for completed transactions, not pending STK
      return this.status === 'completed' && this.source !== 'stk-push';
    },
    unique: true,
    sparse: true, // Allow null for pending transactions
    //index: true,
    trim: true
  },
  internalReference: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  },

  // STK Push specific fields
  checkoutRequestId: {
    type: String,
    sparse: true // Allow null for non-STK transactions
  },

  // Business Context (UPDATED: Changed from merchant to business)
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    //index: true
  },

  // Payment Details
  amount: {
    type: Number,
    required: true,
    min: 1,
    set: v => Math.round(v * 100) / 100
  },
  currency: {
    type: String,
    default: 'KES',
    enum: ['KES']
  },
  transactionType: {
    type: String,
    enum: ['Pay Bill', 'Buy Goods', 'Send Money', 'Withdraw', 'STK Push'],
    required: true
  },

  // Customer Information
  customer: {
    phoneNumber: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^254[0-9]{9}$/.test(v);
        },
        message: 'Phone number must be in format 254XXXXXXXXX'
      }
    },
    name: {
      firstName: String,
      middleName: String,
      lastName: String
    }
  },

  // Transaction Metadata
  transactionTime: {
    type: Date,
    required: true,
    //index: true
  },
  billRefNumber: {
    type: String,
    //index: true,
    trim: true
  },
  invoiceNumber: String,

  // Status Tracking
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
    //index: true
  },

  // Financial Reconciliation
  accountBalance: Number,

  // Analytics & Categorization
  category: {
    type: String,
    enum: ['sale', 'refund', 'transfer', 'withdrawal', 'other'],
    default: 'sale'
  },
  description: String,

  // Technical Metadata
  rawMpesaResponse: {
    type: mongoose.Schema.Types.Mixed
  },

  // Error tracking for failed transactions
  errorMessage: String,
  errorCode: String
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  return `KES ${this.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
});

// Virtual for customer display phone
transactionSchema.virtual('customer.displayPhone').get(function() {
  return this.customer.phoneNumber.replace(/^254/, '0');
});

// Virtual for STK Push status
transactionSchema.virtual('isSTKPush').get(function() {
  return this.source === 'stk-push';
});

// Virtual for pending payment
transactionSchema.virtual('isPending').get(function() {
  return this.status === 'pending';
});

// Indexes for performance
transactionSchema.index({ business: 1, createdAt: -1 });
transactionSchema.index({ 'customer.phoneNumber': 1 });
transactionSchema.index({ transactionTime: -1 });
transactionSchema.index({ status: 1, business: 1 });
//transactionSchema.index({ checkoutRequestId: 1 }); // For STK callback lookups
transactionSchema.index({ source: 1, status: 1 }); // For filtering by source and status

// Static Methods
transactionSchema.statics = {
  // Find transactions by business with pagination (UPDATED)
  findByBusiness(businessId, options = {}) {
    const { page = 1, limit = 50, sort = '-createdAt', status, source } = options;
    const skip = (page - 1) * limit;

    const filter = { business: businessId };
    if (status) filter.status = status;
    if (source) filter.source = source;

    return this.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('business', 'businessName mpesaShortCode businessType')
      .exec();
  },

  // Find transactions by owner (across all businesses) (NEW)
  findByOwner(ownerId, options = {}) {
    const { page = 1, limit = 50, sort = '-createdAt', status, source } = options;
    const skip = (page - 1) * limit;

    const Business = mongoose.model('Business');
    
    return Business.find({ owner: ownerId })
      .then(businesses => {
        const businessIds = businesses.map(b => b._id);
        const filter = { business: { $in: businessIds } };
        if (status) filter.status = status;
        if (source) filter.source = source;

        return this.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('business', 'businessName mpesaShortCode businessType')
          .exec();
      });
  },

  // Get daily summary for a business (UPDATED)
  async getDailySummary(businessId, date = new Date()) {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    return this.aggregate([
      {
        $match: {
          business: new mongoose.Types.ObjectId(businessId),
          transactionTime: { $gte: startOfDay, $lte: endOfDay },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          stkPushCount: {
            $sum: { $cond: [{ $eq: ['$source', 'stk-push'] }, 1, 0] }
          },
          c2bCount: {
            $sum: { $cond: [{ $eq: ['$source', 'mpesa-api'] }, 1, 0] }
          }
        }
      }
    ]);
  },

  // Get daily summary for owner (across all businesses) (NEW)
  async getOwnerDailySummary(ownerId, date = new Date()) {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const Business = mongoose.model('Business');
    const businesses = await Business.find({ owner: ownerId });
    const businessIds = businesses.map(b => b._id);

    return this.aggregate([
      {
        $match: {
          business: { $in: businessIds },
          transactionTime: { $gte: startOfDay, $lte: endOfDay },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          averageAmount: { $avg: '$amount' },
          stkPushCount: {
            $sum: { $cond: [{ $eq: ['$source', 'stk-push'] }, 1, 0] }
          },
          c2bCount: {
            $sum: { $cond: [{ $eq: ['$source', 'mpesa-api'] }, 1, 0] }
          },
          businessCount: { $addToSet: '$business' }
        }
      },
      {
        $project: {
          totalTransactions: 1,
          totalAmount: 1,
          averageAmount: 1,
          stkPushCount: 1,
          c2bCount: 1,
          activeBusinesses: { $size: '$businessCount' }
        }
      }
    ]);
  },

  // Find STK transaction by checkout request ID
  findByCheckoutRequestId(checkoutRequestId) {
    return this.findOne({ checkoutRequestId })
      .populate('business', 'businessName mpesaShortCode')
      .exec();
  },

  // Update STK transaction status
  async updateSTKStatus(checkoutRequestId, status, mpesaTransactionId = null, error = null) {
    const updateData = { status };
    
    if (mpesaTransactionId) {
      updateData.mpesaTransactionId = mpesaTransactionId;
    }
    
    if (error) {
      updateData.errorMessage = error.message;
      updateData.errorCode = error.code;
    }

    return this.findOneAndUpdate(
      { checkoutRequestId },
      updateData,
      { new: true }
    ).populate('business', 'businessName mpesaShortCode').exec();
  }
};

// Instance Methods
transactionSchema.methods = {
  // Get transaction summary for API responses
  getSummary() {
    return {
      id: this.internalReference,
      mpesaId: this.mpesaTransactionId,
      amount: this.amount,
      formattedAmount: this.formattedAmount,
      customer: {
        phone: this.customer.displayPhone,
        name: this.customer.name
      },
      source: this.source,
      time: this.transactionTime,
      status: this.status,
      type: this.transactionType,
      reference: this.billRefNumber,
      isPending: this.isPending,
      isSTKPush: this.isSTKPush,
      description: this.description,
      createdAt: this.createdAt
    };
  },

  // Get transaction with business details
  getFullDetails() {
    return {
      ...this.getSummary(),
      business: this.business ? {
        id: this.business._id,
        name: this.business.businessName,
        shortCode: this.business.mpesaShortCode,
        type: this.business.businessType
      } : null
    };
  },

  // Mark as completed (for STK callbacks)
  markAsCompleted(mpesaTransactionId, rawResponse = null) {
    this.status = 'completed';
    this.mpesaTransactionId = mpesaTransactionId;
    if (rawResponse) {
      this.rawMpesaResponse = rawResponse;
    }
    return this.save();
  },

  // Mark as failed (for STK callbacks)
  markAsFailed(errorMessage, errorCode = null) {
    this.status = 'failed';
    this.errorMessage = errorMessage;
    this.errorCode = errorCode;
    return this.save();
  }
};

// Pre-save middleware to set transaction type for STK
transactionSchema.pre('save', function(next) {
  if (this.source === 'stk-push' && !this.transactionType) {
    this.transactionType = 'STK Push';
  }
  next();
});

export default mongoose.model("Transaction", transactionSchema);