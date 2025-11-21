import mongoose from "mongoose";
import crypto from "crypto";

const tokenSchema = new mongoose.Schema({
  // Token Identity
  tokenValue: {
    type: String,
    required: [true, "Token value is required"],
    unique: true,
    //index: true,
    default: function() {
      return `TKN-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    }
  },

  // Relationships
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TokenPlan",
    required: true
  },

  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true
  },

  // Subscription Details
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },

  expiryDate: {
    type: Date,
    required: true
  },

  // Usage Tracking
  transactionsUsed: {
    type: Number,
    default: 0,
    min: 0
  },

  revenueUsed: {
    type: Number, // in cents
    default: 0,
    min: 0
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'expired', 'suspended', 'revoked'],
    default: 'active',
    index: true
  },

  // Payment Reference (if paid)
  paymentReference: {
    type: String,
    sparse: true
  },

  // Metadata
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

// Virtual for checking if token is active
tokenSchema.virtual('isActive').get(function() {
  return this.status === 'active' && this.expiryDate > new Date();
});

// Virtual for days remaining
tokenSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const diffTime = this.expiryDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Virtual for usage percentage
tokenSchema.virtual('usagePercentage').get(function() {
  const plan = this.populated('plan') || this.plan;
  if (!plan || plan.transactionLimit === 0) return 0;
  return Math.min(100, (this.transactionsUsed / plan.transactionLimit) * 100);
});

// Indexes for performance
tokenSchema.index({ business: 1, status: 1 });
tokenSchema.index({ expiryDate: 1 });
//tokenSchema.index({ tokenValue: 1 }, { unique: true });
tokenSchema.index({ createdAt: -1 });

// Pre-save middleware to set expiry date
tokenSchema.pre('save', function(next) {
  if (this.isModified('startDate') || this.isNew) {
    const plan = this.populated('plan') || this.plan;
    if (plan && plan.duration) {
      const expiry = new Date(this.startDate);
      expiry.setDate(expiry.getDate() + plan.duration);
      this.expiryDate = expiry;
    }
  }
  this.updatedAt = new Date();
  next();
});

// Static Methods
tokenSchema.statics = {
  // Find active token by value
  findByValue(tokenValue) {
    return this.findOne({ tokenValue, status: 'active' })
      .populate('plan')
      .populate('business', 'businessName mpesaShortCode businessType owner')
      .exec();
  },

  // Find active tokens for business
  findActiveByBusiness(businessId) {
    return this.findOne({ 
      business: businessId, 
      status: 'active',
      expiryDate: { $gt: new Date() }
    })
    .populate('plan')
    .sort({ expiryDate: -1 })
    .exec();
  },

  // Find all tokens for business
  findByBusiness(businessId, options = {}) {
    const { page = 1, limit = 50, status } = options;
    const skip = (page - 1) * limit;

    const filter = { business: businessId };
    if (status) filter.status = status;

    return this.find(filter)
      .populate('plan')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  },

  // Update token usage
  async incrementUsage(tokenId, amount) {
    const update = { 
      $inc: { 
        transactionsUsed: 1,
        revenueUsed: Math.round(amount * 100) // Convert to cents
      } 
    };

    return this.findByIdAndUpdate(
      tokenId,
      update,
      { new: true }
    ).populate('plan').exec();
  }
};

// Instance Methods
tokenSchema.methods = {
  // Check if token can be used (within limits)
  canUse(amount = 0) {
    if (!this.isActive) return false;

    const plan = this.populated('plan') || this.plan;
    
    // Check transaction limit
    if (plan.transactionLimit > 0 && this.transactionsUsed >= plan.transactionLimit) {
      return false;
    }

    // Check revenue limit
    const amountInCents = Math.round(amount * 100);
    if (plan.revenueLimit > 0 && (this.revenueUsed + amountInCents) > plan.revenueLimit) {
      return false;
    }

    return true;
  },

  // Get token summary
  getSummary() {
    const plan = this.populated('plan') || this.plan;
    return {
      id: this._id,
      tokenValue: this.tokenValue,
      plan: plan ? plan.getSummary() : null,
      startDate: this.startDate,
      expiryDate: this.expiryDate,
      transactionsUsed: this.transactionsUsed,
      revenueUsed: this.revenueUsed / 100, // Convert back to currency units
      status: this.status,
      isActive: this.isActive,
      daysRemaining: this.daysRemaining,
      usagePercentage: this.usagePercentage,
      createdAt: this.createdAt
    };
  },

  // Suspend token
  suspend() {
    this.status = 'suspended';
    return this.save();
  },

  // Revoke token
  revoke() {
    this.status = 'revoked';
    return this.save();
  },

  // Reactivate token
  reactivate() {
    if (this.expiryDate > new Date()) {
      this.status = 'active';
      return this.save();
    }
    throw new Error('Cannot reactivate expired token');
  }
};

export default mongoose.model("Token", tokenSchema);