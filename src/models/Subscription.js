// src/models/Subscription.js
import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  // Merchant who owns this subscription
  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // Current active token
  currentToken: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Token",
    required: true
  },

  // Plan they're subscribed to
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TokenPlan",
    required: true
  },

  // Subscription status
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },

  // Auto-renewal
  autoRenew: {
    type: Boolean,
    default: false
  },

  // When the current token expires
  expiresAt: {
    type: Date
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true
});

// Virtual for subscription health
subscriptionSchema.virtual('isHealthy').get(function() {
  return this.status === 'active' && this.currentToken && this.currentToken.isActive;
});

// Methods
subscriptionSchema.methods = {
  async renewSubscription(newTokenId) {
    this.currentToken = newTokenId;
    this.status = 'active';
    
    const token = await mongoose.model('Token').findById(newTokenId).populate('plan');
    if (token && token.plan.duration > 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + token.plan.duration);
      this.expiresAt = expiry;
    }
    
    await this.save();
    return this.populate('currentToken');
  },

  getSummary() {
    return {
      id: this._id,
      merchant: this.merchant,
      currentToken: this.currentToken ? this.currentToken.getSummary() : null,
      plan: this.plan,
      status: this.status,
      autoRenew: this.autoRenew,
      isHealthy: this.isHealthy,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt
    };
  }
};

export default mongoose.model("Subscription", subscriptionSchema);