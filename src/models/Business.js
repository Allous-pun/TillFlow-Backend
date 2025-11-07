import mongoose from "mongoose";

const businessSchema = new mongoose.Schema({
  // Core Business Identity
  businessName: {
    type: String,
    required: [true, "Business name is required"],
    trim: true,
    maxlength: [100, "Business name cannot exceed 100 characters"]
  },
  
  industry: {
    type: String,
    enum: [
      'Retail', 'Restaurant', 'Hospitality', 'Services', 
      'E-commerce', 'Manufacturing', 'Healthcare', 'Education',
      'Transportation', 'Real Estate', 'Other'
    ],
    default: 'Retail'
  },

  // Business Owner Reference
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  // M-Pesa Business Configuration
  mpesaShortCode: {
    type: String,
    required: [true, "M-Pesa shortcode is required"],
    match: [/^\d{5,7}$/, "Shortcode must be 5-7 digits"],
    unique: true
  },

  mpesaConsumerKey: {
    type: String,
    required: [true, "M-Pesa consumer key is required"],
    trim: true
  },

  mpesaConsumerSecret: {
    type: String,
    required: [true, "M-Pesa consumer secret is required"],
    trim: true
  },

  mpesaPassKey: {
    type: String,
    required: [true, "M-Pesa passkey is required"],
    trim: true
  },

  // Business Contact Information
  contactEmail: {
    type: String,
    required: [true, "Contact email is required"],
    lowercase: true,
    match: [/\S+@\S+\.\S+/, "Invalid email format"]
  },

  contactPhone: {
    type: String,
    required: [true, "Contact phone is required"],
    match: [/^\+?\d{10,15}$/, "Invalid phone number format"]
  },

  // Business Location
  location: {
    address: String,
    city: String,
    country: {
      type: String,
      default: "Kenya"
    }
  },

  // Business Status & Metadata
  isActive: {
    type: Boolean,
    default: true
  },

  businessType: {
    type: String,
    enum: ['PayBill', 'Buy Goods'],
    required: true,
    default: 'PayBill'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Virtual for formatted business info
businessSchema.virtual('formattedInfo').get(function() {
  return {
    name: this.businessName,
    shortCode: this.mpesaShortCode,
    type: this.businessType,
    industry: this.industry
  };
});

// Virtual for transaction count
businessSchema.virtual('transactionCount', {
  ref: 'Transaction',
  localField: '_id',
  foreignField: 'business',
  count: true
});

// Indexes for performance
businessSchema.index({ owner: 1, businessName: 1 });
businessSchema.index({ mpesaShortCode: 1 }, { unique: true });
businessSchema.index({ isActive: 1 });
businessSchema.index({ createdAt: -1 });

// Static Methods
businessSchema.statics = {
  // Find businesses by owner with pagination
  findByOwner(ownerId, options = {}) {
    const { page = 1, limit = 50, isActive = true } = options;
    const skip = (page - 1) * limit;

    return this.find({ owner: ownerId, isActive })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('owner', 'fullName email')
      .exec();
  },

  // Find business by shortcode
  findByShortCode(shortCode) {
    return this.findOne({ mpesaShortCode: shortCode, isActive: true }).exec();
  },

  // Get business stats
  async getBusinessStats(businessId) {
    const Transaction = mongoose.model('Transaction');
    
    const stats = await Transaction.aggregate([
      {
        $match: {
          business: new mongoose.Types.ObjectId(businessId),
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          averageTransaction: { $avg: '$amount' }
        }
      }
    ]);

    return stats[0] || {
      totalTransactions: 0,
      totalRevenue: 0,
      averageTransaction: 0
    };
  }
};

// Instance Methods
businessSchema.methods = {
  // Get business summary for API responses
  getSummary() {
    return {
      id: this._id,
      businessName: this.businessName,
      shortCode: this.mpesaShortCode,
      businessType: this.businessType,
      industry: this.industry,
      contactEmail: this.contactEmail,
      contactPhone: this.contactPhone,
      isActive: this.isActive,
      createdAt: this.createdAt
    };
  },

  // Get full business details (including sensitive M-Pesa credentials)
  getFullDetails() {
    return {
      id: this._id,
      businessName: this.businessName,
      shortCode: this.mpesaShortCode,
      businessType: this.businessType,
      industry: this.industry,
      contactEmail: this.contactEmail,
      contactPhone: this.contactPhone,
      location: this.location,
      mpesaCredentials: {
        consumerKey: this.mpesaConsumerKey,
        consumerSecret: this.mpesaConsumerSecret,
        passKey: this.mpesaPassKey
      },
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Deactivate business
  deactivate() {
    this.isActive = false;
    this.updatedAt = new Date();
    return this.save();
  },

  // Update M-Pesa credentials
  updateMpesaCredentials(credentials) {
    if (credentials.consumerKey) this.mpesaConsumerKey = credentials.consumerKey;
    if (credentials.consumerSecret) this.mpesaConsumerSecret = credentials.consumerSecret;
    if (credentials.passKey) this.mpesaPassKey = credentials.passKey;
    this.updatedAt = new Date();
    return this.save();
  }
};

// Pre-save middleware to update timestamps
businessSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Business", businessSchema);