// src/models/Token.js
import mongoose from "mongoose";
import crypto from "crypto";

const tokenSchema = new mongoose.Schema({
  // Token Identity
  tokenValue: {
    type: String,
    required: [true, "Token value is required"],
    unique: true,
    default: function() {
      return `TKN-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    }
  },

  // Plan relationship (template)
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TokenPlan",
    required: true
  },

  // PRICING AND LIMITS - MOVED FROM TokenPlan TO HERE
  price: {
    type: Number, // Price in cents (KES)
    required: [true, "Price is required"],
    min: [0, "Price cannot be negative"],
    default: 0
  },

  transactionLimit: {
    type: Number,
    required: [true, "Transaction limit is required"],
    min: [0, "Transaction limit cannot be negative"],
    default: 0 // 0 = unlimited
  },

  revenueLimit: {
    type: Number, // Maximum revenue allowed in cents
    min: [0, "Revenue limit cannot be negative"],
    default: 0 // 0 = unlimited
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

  // Token Status
  status: {
    type: String,
    enum: ['active', 'expired', 'suspended', 'revoked'],
    default: 'active'
  },

  // Activation dates
  activatedAt: {
    type: Date,
    default: null
  },

  expiresAt: {
    type: Date,
    default: null
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

// ADD formattedPrice virtual to Token
tokenSchema.virtual('formattedPrice').get(function() {
  return this.price === 0 ? 'Free' : `KES ${(this.price / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
});

// Virtual for checking if token is active
tokenSchema.virtual('isActive').get(function() {
  return this.status === 'active' && 
         (!this.expiresAt || this.expiresAt > new Date()) &&
         this.hasRemainingTransactions();
});

// Virtual for checking transaction limits
tokenSchema.virtual('hasRemainingTransactions').get(function() {
  return this.transactionLimit === 0 || this.transactionsUsed < this.transactionLimit;
});

// Virtual for usage percentage
tokenSchema.virtual('usagePercentage').get(function() {
  if (this.transactionLimit === 0) return 0;
  return Math.min(100, (this.transactionsUsed / this.transactionLimit) * 100);
});

// Virtual for days remaining (if time-based)
tokenSchema.virtual('daysRemaining').get(function() {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diffTime = this.expiresAt - now;
  return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
});

// Methods
tokenSchema.methods = {
  // Check if token can be used for a transaction
  canProcessTransaction(amount = 0) {
    if (!this.isActive) {
      return { canUse: false, reason: 'Token is not active' };
    }
    
    // Check transaction limit
    if (this.transactionLimit > 0 && this.transactionsUsed >= this.transactionLimit) {
      this.status = 'expired';
      this.save().catch(console.error);
      return { canUse: false, reason: 'Transaction limit reached' };
    }

    // Check revenue limit
    const amountInCents = Math.round(amount * 100);
    if (this.revenueLimit > 0 && (this.revenueUsed + amountInCents) > this.revenueLimit) {
      this.status = 'expired';
      this.save().catch(console.error);
      return { canUse: false, reason: 'Revenue limit reached' };
    }

    return { canUse: true };
  },

  // Process a transaction
  async processTransaction(amount = 0) {
    const canUse = this.canProcessTransaction(amount);
    if (!canUse.canUse) {
      return canUse;
    }

    const amountInCents = Math.round(amount * 100);
    
    this.transactionsUsed += 1;
    this.revenueUsed += amountInCents;
    
    // Check if we just reached the limit
    if ((this.transactionLimit > 0 && this.transactionsUsed >= this.transactionLimit) ||
        (this.revenueLimit > 0 && this.revenueUsed >= this.revenueLimit)) {
      this.status = 'expired';
    }

    await this.save();
    return { success: true, token: this };
  },

  // Activate token (when merchant subscribes)
  async activate() {
    this.activatedAt = new Date();
    
    const plan = this.populated('plan') || this.plan;
    if (plan.duration > 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + plan.duration);
      this.expiresAt = expiry;
    }
    
    this.status = 'active';
    await this.save();
    return this;
  },

  getSummary() {
    const plan = this.populated('plan') || this.plan;
    return {
      id: this._id,
      tokenValue: this.tokenValue,
      plan: plan ? plan.getSummary() : null,
      price: this.price,
      formattedPrice: this.formattedPrice,
      transactionLimit: this.transactionLimit,
      revenueLimit: this.revenueLimit,
      transactionsUsed: this.transactionsUsed,
      revenueUsed: this.revenueUsed / 100,
      status: this.status,
      isActive: this.isActive,
      usagePercentage: this.usagePercentage,
      daysRemaining: this.daysRemaining,
      activatedAt: this.activatedAt,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt
    };
  }
};

export default mongoose.model("Token", tokenSchema);