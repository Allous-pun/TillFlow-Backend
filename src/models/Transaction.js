import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  // Source of transaction (new)
  source: {
    type: String,
    enum: ['mpesa-api', 'manual-pdf', 'manual-csv'],
    required: true,
    default: 'mpesa-api',
    index: true
  },

  // Core Transaction Identifiers
  mpesaTransactionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
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

  // Merchant/Business Context
  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  businessShortCode: {
    type: String,
    required: true,
    index: true
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
    enum: ['Pay Bill', 'Buy Goods', 'Send Money', 'Withdraw'],
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
    index: true
  },
  billRefNumber: {
    type: String,
    index: true,
    trim: true
  },
  invoiceNumber: String,

  // Status Tracking
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
    index: true
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
  }
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

// Indexes for performance
transactionSchema.index({ merchant: 1, createdAt: -1 });
transactionSchema.index({ 'customer.phoneNumber': 1 });
transactionSchema.index({ transactionTime: -1 });
transactionSchema.index({ status: 1, merchant: 1 });

// Static Methods
transactionSchema.statics = {
  findByMerchant(merchantId, options = {}) {
    const { page = 1, limit = 50, sort = '-createdAt' } = options;
    const skip = (page - 1) * limit;

    return this.find({ merchant: merchantId })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('merchant', 'fullName email')
      .exec();
  },

  async getDailySummary(merchantId, date = new Date()) {
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    return this.aggregate([
      {
        $match: {
          merchant: new mongoose.Types.ObjectId(merchantId),
          transactionTime: { $gte: startOfDay, $lte: endOfDay },
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
  }
};

// Instance Methods
transactionSchema.methods = {
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
      source: this.source,         // added here too
      time: this.transactionTime,
      status: this.status,
      type: this.transactionType,
      reference: this.billRefNumber
    };
  }
};

export default mongoose.model("Transaction", transactionSchema);
