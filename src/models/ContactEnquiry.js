import mongoose from "mongoose";

const enquirySchema = new mongoose.Schema({
  // Core Enquiry Information
  merchant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business'
  },
  enquiryType: {
    type: String,
    enum: ['support', 'sales', 'general', 'feedback', 'technical'],
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: [200, "Subject cannot exceed 200 characters"]
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: [2000, "Message cannot exceed 2000 characters"]
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'closed'],
    default: 'pending'
  },

  // Admin Response
  adminResponse: {
    message: {
      type: String,
      trim: true,
      maxlength: [2000, "Response cannot exceed 2000 characters"]
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  },

  // File Attachments
  attachments: [{
    filename: String,
    path: String,
    mimetype: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Virtual for formatted enquiry info
enquirySchema.virtual('formattedInfo').get(function() {
  return {
    id: this._id,
    enquiryType: this.enquiryType,
    subject: this.subject,
    priority: this.priority,
    status: this.status,
    createdAt: this.createdAt
  };
});

// Indexes for performance
enquirySchema.index({ merchant: 1, createdAt: -1 });
enquirySchema.index({ status: 1 });
enquirySchema.index({ enquiryType: 1 });
enquirySchema.index({ priority: 1 });
enquirySchema.index({ createdAt: -1 });

// Static Methods
enquirySchema.statics = {
  // Find enquiries by merchant with pagination
  findByMerchant(merchantId, options = {}) {
    const { page = 1, limit = 20, status } = options;
    const skip = (page - 1) * limit;
    
    const filter = { merchant: merchantId };
    if (status) filter.status = status;

    return this.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('business', 'businessName industry')
      .populate('merchant', 'name email')
      .exec();
  },

  // Find enquiries with filters (admin)
  findWithFilters(options = {}) {
    const { page = 1, limit = 50, status, enquiryType, priority } = options;
    const skip = (page - 1) * limit;
    
    const filter = {};
    if (status) filter.status = status;
    if (enquiryType) filter.enquiryType = enquiryType;
    if (priority) filter.priority = priority;

    return this.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('merchant', 'name email phone')
      .populate('business', 'businessName industry')
      .populate('adminResponse.respondedBy', 'name email')
      .exec();
  },

  // Get enquiry statistics
  async getEnquiryStats() {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await this.countDocuments();
    
    return {
      total,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      byType: await this.aggregate([
        {
          $group: {
            _id: '$enquiryType',
            count: { $sum: 1 }
          }
        }
      ])
    };
  }
};

// Instance Methods
enquirySchema.methods = {
  // Get enquiry summary
  getSummary() {
    return {
      id: this._id,
      enquiryType: this.enquiryType,
      subject: this.subject,
      priority: this.priority,
      status: this.status,
      createdAt: this.createdAt,
      hasAttachments: this.attachments && this.attachments.length > 0
    };
  },

  // Get full enquiry details
  getFullDetails() {
    return {
      id: this._id,
      enquiryType: this.enquiryType,
      subject: this.subject,
      message: this.message,
      priority: this.priority,
      status: this.status,
      merchant: this.merchant,
      business: this.business,
      adminResponse: this.adminResponse,
      attachments: this.attachments,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Add admin response
  addAdminResponse(responseData, adminId) {
    this.adminResponse = {
      message: responseData.message,
      respondedBy: adminId,
      respondedAt: new Date()
    };
    this.status = 'in_progress';
    return this.save();
  },

  // Update enquiry status
  updateStatus(newStatus) {
    this.status = newStatus;
    return this.save();
  },

  // Check if enquiry can be modified
  canBeModified() {
    return ['pending', 'in_progress'].includes(this.status);
  }
};

// Pre-save middleware
enquirySchema.pre('save', function(next) {
  // Auto-set respondedAt if response is added
  if (this.adminResponse && this.adminResponse.message && !this.adminResponse.respondedAt) {
    this.adminResponse.respondedAt = new Date();
  }
  next();
});

export default mongoose.model("ContactEnquiry", enquirySchema);