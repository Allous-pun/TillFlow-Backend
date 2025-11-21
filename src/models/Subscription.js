import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  // Relationships
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business",
    required: true,
    index: true
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  // Current active token
  currentToken: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Token"
  },

  // Subscription Status
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'suspended'],
    default: 'active',
    index: true
  },

  // Auto-renewal settings
  autoRenew: {
    type: Boolean,
    default: false
  },

  // Billing information
  billingCycle: {
    type: String,
    enum: ['manual', 'auto'],
    default: 'manual'
  },

  // Payment history reference
  lastPayment: {
    amount: Number,
    currency: {
      type: String,
      default: 'KES'
    },
    paymentDate: Date,
    paymentMethod: String,
    reference: String
  },

  nextBillingDate: Date,

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

// Virtual for subscription health - FIXED: changed tokenSchema to subscriptionSchema
subscriptionSchema.virtual('isHealthy').get(function() {
  return this.status === 'active' && this.currentToken && this.currentToken.isActive;
});

// Indexes
subscriptionSchema.index({ user: 1, business: 1 }, { unique: true });
subscriptionSchema.index({ status: 1, nextBillingDate: 1 });

// Static Methods
subscriptionSchema.statics = {
  // Find subscription by business
  findByBusiness(businessId) {
    return this.findOne({ business: businessId })
      .populate('currentToken')
      .populate('user', 'fullName email phoneNumber')
      .populate('business', 'businessName mpesaShortCode businessType')
      .exec();
  },

  // Find subscription by user
  findByUser(userId) {
    return this.find({ user: userId })
      .populate('currentToken')
      .populate('business', 'businessName mpesaShortCode businessType')
      .exec();
  },

  // Find active subscriptions
  findActiveSubscriptions() {
    return this.find({ status: 'active' })
      .populate('currentToken')
      .populate('business', 'businessName mpesaShortCode')
      .populate('user', 'fullName email')
      .exec();
  }
};

// Instance Methods
subscriptionSchema.methods = {
  // Get subscription summary
  getSummary() {
    return {
      id: this._id,
      business: this.business ? {
        id: this.business._id,
        name: this.business.businessName,
        shortCode: this.business.mpesaShortCode
      } : null,
      currentToken: this.currentToken ? this.currentToken.getSummary() : null,
      status: this.status,
      autoRenew: this.autoRenew,
      billingCycle: this.billingCycle,
      isHealthy: this.isHealthy,
      lastPayment: this.lastPayment,
      nextBillingDate: this.nextBillingDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Update current token
  async updateToken(newTokenId) {
    this.currentToken = newTokenId;
    this.status = 'active';
    await this.save();
    return this.populate('currentToken');
  },

  // Cancel subscription
  cancel() {
    this.status = 'cancelled';
    this.autoRenew = false;
    return this.save();
  },

  // Enable auto-renewal
  enableAutoRenew() {
    this.autoRenew = true;
    this.billingCycle = 'auto';
    return this.save();
  },

  // Disable auto-renewal
  disableAutoRenew() {
    this.autoRenew = false;
    this.billingCycle = 'manual';
    return this.save();
  }
};

export default mongoose.model("Subscription", subscriptionSchema);