import mongoose from "mongoose";

const helpSchema = new mongoose.Schema({
  // Help Item Identity
  title: {
    type: String,
    required: [true, "Help item title is required"],
    trim: true,
    maxlength: [200, "Title cannot exceed 200 characters"]
  },

  description: {
    type: String,
    required: [true, "Help item description is required"],
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },

  content: {
    type: String,
    required: [true, "Help content is required"],
    trim: true
  },

  // Help Item Type
  type: {
    type: String,
    enum: ['faq', 'guide', 'article', 'video', 'pdf'],
    default: 'article'
  },

  // Category
  category: {
    type: String,
    required: [true, "Category is required"],
    enum: ['getting-started', 'payments', 'security', 'user-management', 'account', 'development'],
    index: true
  },

  // Media/File Information
  mediaUrl: {
    type: String,
    default: null
  },

  fileType: {
    type: String,
    enum: ['pdf', 'video', 'image', 'none'],
    default: 'none'
  },

  fileSize: {
    type: Number,
    default: 0
  },

  duration: {
    type: String, // For videos - e.g., "5:30"
    default: null
  },

  // Status & Visibility
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },

  isFeatured: {
    type: Boolean,
    default: false
  },

  displayOrder: {
    type: Number,
    default: 0
  },

  // Usage Tracking
  viewCount: {
    type: Number,
    default: 0
  },

  helpfulCount: {
    type: Number,
    default: 0
  },

  notHelpfulCount: {
    type: Number,
    default: 0
  },

  // SEO & Search
  keywords: [{
    type: String,
    trim: true
  }],

  searchTerms: [{
    type: String,
    trim: true
  }],

  // Admin who created/updated
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Virtual for checking if help item is published
helpSchema.virtual('isPublished').get(function() {
  return this.status === 'published';
});

// Virtual for total feedback count
helpSchema.virtual('totalFeedback').get(function() {
  return this.helpfulCount + this.notHelpfulCount;
});

// Virtual for helpful percentage
helpSchema.virtual('helpfulPercentage').get(function() {
  if (this.totalFeedback === 0) return 0;
  return Math.round((this.helpfulCount / this.totalFeedback) * 100);
});

// Indexes for better performance
helpSchema.index({ category: 1, status: 1 });
helpSchema.index({ type: 1, status: 1 });
helpSchema.index({ isFeatured: 1, status: 1 });
helpSchema.index({ title: 'text', description: 'text', content: 'text', keywords: 'text' });
helpSchema.index({ displayOrder: 1 });
helpSchema.index({ createdAt: -1 });

// Static Methods
helpSchema.statics = {
  // Find published help items with filtering
  async findPublished(filters = {}) {
    const {
      category,
      type,
      isFeatured,
      search,
      page = 1,
      limit = 20,
      sortBy = 'displayOrder',
      sortOrder = 'asc'
    } = filters;

    const query = { status: 'published' };
    
    if (category) query.category = category;
    if (type) query.type = type;
    if (isFeatured !== undefined) query.isFeatured = isFeatured;

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [helpItems, total] = await Promise.all([
      this.find(query)
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .exec(),
      this.countDocuments(query)
    ]);

    return {
      helpItems,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    };
  },

  // Get help statistics
  async getStatistics() {
    const stats = await this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalViews: { $sum: '$viewCount' }
        }
      },
      {
        $group: {
          _id: null,
          statusCounts: {
            $push: {
              status: '$_id',
              count: '$count'
            }
          },
          totalItems: { $sum: '$count' },
          totalViews: { $sum: '$totalViews' }
        }
      },
      {
        $lookup: {
          from: 'help',
          let: {},
          pipeline: [
            { $match: { status: 'published' } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ],
          as: 'categoryCounts'
        }
      }
    ]);

    return stats[0] || { totalItems: 0, totalViews: 0, statusCounts: [], categoryCounts: [] };
  },

  // Increment view count
  async incrementViewCount(helpId) {
    return this.findByIdAndUpdate(
      helpId,
      { $inc: { viewCount: 1 } },
      { new: true }
    );
  },

  // Record feedback
  async recordFeedback(helpId, wasHelpful) {
    const updateField = wasHelpful ? 'helpfulCount' : 'notHelpfulCount';
    return this.findByIdAndUpdate(
      helpId,
      { $inc: { [updateField]: 1 } },
      { new: true }
    );
  }
};

// Instance Methods
helpSchema.methods = {
  // Get help item summary for API responses
  getSummary() {
    return {
      id: this._id,
      title: this.title,
      description: this.description,
      type: this.type,
      category: this.category,
      mediaUrl: this.mediaUrl,
      fileType: this.fileType,
      duration: this.duration,
      isFeatured: this.isFeatured,
      viewCount: this.viewCount,
      helpfulCount: this.helpfulCount,
      notHelpfulCount: this.notHelpfulCount,
      totalFeedback: this.totalFeedback,
      helpfulPercentage: this.helpfulPercentage,
      status: this.status,
      displayOrder: this.displayOrder,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Get full help item details
  getFullDetails() {
    const summary = this.getSummary();
    return {
      ...summary,
      content: this.content,
      keywords: this.keywords,
      searchTerms: this.searchTerms,
      createdBy: this.createdBy ? {
        id: this.createdBy._id,
        name: this.createdBy.fullName,
        email: this.createdBy.email
      } : null,
      updatedBy: this.updatedBy ? {
        id: this.updatedBy._id,
        name: this.updatedBy.fullName,
        email: this.updatedBy.email
      } : null,
      fileSize: this.fileSize
    };
  },

  // Publish help item
  async publish() {
    this.status = 'published';
    await this.save();
    return this;
  },

  // Archive help item
  async archive() {
    this.status = 'archived';
    await this.save();
    return this;
  },

  // Mark as featured
  async markAsFeatured() {
    this.isFeatured = true;
    await this.save();
    return this;
  },

  // Remove featured status
  async removeFeatured() {
    this.isFeatured = false;
    await this.save();
    return this;
  },

  // Increment view count
  async incrementViews() {
    this.viewCount += 1;
    await this.save();
    return this;
  }
};

// Middleware to update updatedAt before save
helpSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Help", helpSchema);