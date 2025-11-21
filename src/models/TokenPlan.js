import mongoose from "mongoose";

const tokenPlanSchema = new mongoose.Schema({
  // Plan Identity
  name: {
    type: String,
    required: [true, "Plan name is required"],
    trim: true,
    maxlength: [100, "Plan name cannot exceed 100 characters"]
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },

  // Duration & Pricing
  duration: {
    type: Number, // Duration in days
    required: [true, "Duration is required"],
    min: [1, "Duration must be at least 1 day"]
  },

  price: {
    type: Number, // Price in cents (KES)
    required: [true, "Price is required"],
    min: [0, "Price cannot be negative"],
    default: 0
  },

  // Usage Limits
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

  // Features
  features: [{
    type: String,
    enum: [
      'basic-transactions',
      'advanced-analytics',
      'csv-export',
      'pdf-reports',
      'manual-uploads',
      'stk-push',
      'api-access',
      'priority-support'
    ]
  }],

  // Plan Status
  isActive: {
    type: Boolean,
    default: true
  },

  isPublic: {
    type: Boolean,
    default: true // Whether merchants can see and subscribe
  },

  // Admin Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
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

// Virtual for formatted price
tokenPlanSchema.virtual('formattedPrice').get(function() {
  return this.price === 0 ? 'Free' : `KES ${(this.price / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
});

// Virtual for formatted duration
tokenPlanSchema.virtual('formattedDuration').get(function() {
  if (this.duration === 1) return '1 Day';
  if (this.duration === 7) return '1 Week';
  if (this.duration === 30) return '1 Month';
  if (this.duration === 90) return '3 Months';
  if (this.duration === 365) return '1 Year';
  return `${this.duration} Days`;
});

// Static Methods
tokenPlanSchema.statics = {
  // Find active public plans for merchants
  findActivePlans() {
    return this.find({ isActive: true, isPublic: true })
      .sort({ price: 1, duration: 1 })
      .populate('createdBy', 'fullName email')
      .exec();
  },

  // Find plans by admin
  findByAdmin(adminId) {
    return this.find({ createdBy: adminId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'fullName email')
      .exec();
  }
};

// Instance Methods
tokenPlanSchema.methods = {
  // Get plan summary for API responses
  getSummary() {
    return {
      id: this._id,
      name: this.name,
      description: this.description,
      duration: this.duration,
      formattedDuration: this.formattedDuration,
      price: this.price,
      formattedPrice: this.formattedPrice,
      transactionLimit: this.transactionLimit,
      revenueLimit: this.revenueLimit,
      features: this.features,
      isActive: this.isActive,
      isPublic: this.isPublic,
      createdAt: this.createdAt
    };
  },

  // Get full plan details
  getFullDetails() {
    return {
      ...this.getSummary(),
      createdBy: this.createdBy ? {
        id: this.createdBy._id,
        name: this.createdBy.fullName,
        email: this.createdBy.email
      } : null,
      updatedAt: this.updatedAt
    };
  }
};

export default mongoose.model("TokenPlan", tokenPlanSchema);