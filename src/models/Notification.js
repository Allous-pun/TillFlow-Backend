import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  // Notification Identity
  title: {
    type: String,
    required: [true, "Notification title is required"],
    trim: true,
    maxlength: [200, "Title cannot exceed 200 characters"]
  },

  message: {
    type: String,
    required: [true, "Notification message is required"],
    trim: true,
    maxlength: [1000, "Message cannot exceed 1000 characters"]
  },

  // Notification Type
  type: {
    type: String,
    enum: ['maintenance', 'upgrade', 'info', 'alert', 'feature'],
    default: 'info'
  },

  // Priority Level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Target Audience
  audience: {
    type: String,
    enum: ['all', 'merchants', 'specific_businesses', 'admins'],
    default: 'all'
  },

  // Specific businesses (if audience is 'specific_businesses')
  targetBusinesses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Business"
  }],

  // Schedule
  scheduledFor: {
    type: Date,
    default: null // Immediate if null
  },

  expiresAt: {
    type: Date,
    default: null // Never expires if null
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'expired', 'cancelled'],
    default: 'draft'
  },

  // Read tracking
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Admin who created the notification
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // Action buttons (optional)
  actions: [{
    text: String,
    url: String,
    type: {
      type: String,
      enum: ['primary', 'secondary', 'link']
    }
  }],

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

// Virtual for checking if notification is active
notificationSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         (!this.expiresAt || this.expiresAt > now) &&
         (!this.scheduledFor || this.scheduledFor <= now);
});

// Virtual for checking if notification is unread for a user
notificationSchema.virtual('isUnread').get(function() {
  return (user) => {
    return !this.readBy.some(read => read.user.toString() === user.toString());
  };
});

// Indexes for better performance
notificationSchema.index({ status: 1, scheduledFor: 1 });
notificationSchema.index({ audience: 1, status: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ createdAt: -1 });

// Static Methods
notificationSchema.statics = {
  // Find active notifications for a user
  async findActiveForUser(userId, businessId = null) {
    const now = new Date();
    
    let audienceFilter = {
      $or: [
        { audience: 'all' },
        { audience: 'merchants' },
        { audience: 'admins', createdBy: userId } // Admin can see their own admin notifications
      ]
    };

    // If user has businesses, include specific business notifications
    if (businessId) {
      audienceFilter.$or.push({
        audience: 'specific_businesses',
        targetBusinesses: businessId
      });
    }

    return this.find({
      $and: [
        audienceFilter,
        {
          $or: [
            { scheduledFor: null },
            { scheduledFor: { $lte: now } }
          ]
        },
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: now } }
          ]
        },
        { status: 'active' }
      ]
    })
    .populate('createdBy', 'fullName email')
    .populate('targetBusinesses', 'businessName mpesaShortCode')
    .sort({ priority: -1, createdAt: -1 })
    .exec();
  },

  // Find unread count for user
  async getUnreadCount(userId, businessId = null) {
    const activeNotifications = await this.findActiveForUser(userId, businessId);
    const unreadCount = activeNotifications.filter(notification => 
      notification.isUnread(userId)
    ).length;
    
    return unreadCount;
  },

  // Mark notification as read for user
  async markAsRead(notificationId, userId) {
    return this.findByIdAndUpdate(
      notificationId,
      {
        $addToSet: {
          readBy: {
            user: userId,
            readAt: new Date()
          }
        }
      },
      { new: true }
    );
  },

  // Mark all as read for user
  async markAllAsRead(userId, businessId = null) {
    const activeNotifications = await this.findActiveForUser(userId, businessId);
    const unreadNotifications = activeNotifications.filter(notification => 
      notification.isUnread(userId)
    );

    const updatePromises = unreadNotifications.map(notification =>
      this.markAsRead(notification._id, userId)
    );

    await Promise.all(updatePromises);
    return unreadNotifications.length;
  }
};

// Instance Methods
notificationSchema.methods = {
  // Get notification summary for API responses
  getSummary() {
    return {
      id: this._id,
      title: this.title,
      message: this.message,
      type: this.type,
      priority: this.priority,
      audience: this.audience,
      isActive: this.isActive,
      scheduledFor: this.scheduledFor,
      expiresAt: this.expiresAt,
      status: this.status,
      actions: this.actions,
      createdBy: this.createdBy ? {
        id: this.createdBy._id,
        name: this.createdBy.fullName,
        email: this.createdBy.email
      } : null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  },

  // Get full notification details
  getFullDetails(userId = null) {
    const summary = this.getSummary();
    return {
      ...summary,
      targetBusinesses: this.targetBusinesses ? this.targetBusinesses.map(business => ({
        id: business._id,
        businessName: business.businessName,
        mpesaShortCode: business.mpesaShortCode
      })) : [],
      isUnread: userId ? this.isUnread(userId) : null,
      readCount: this.readBy.length
    };
  },

  // Publish notification (change status to active)
  async publish() {
    this.status = 'active';
    if (!this.scheduledFor) {
      this.scheduledFor = new Date();
    }
    await this.save();
    return this;
  },

  // Schedule notification for future
  async schedule(scheduleDate) {
    this.scheduledFor = scheduleDate;
    this.status = 'scheduled';
    await this.save();
    return this;
  },

  // Cancel notification
  async cancel() {
    this.status = 'cancelled';
    await this.save();
    return this;
  }
};

// Middleware to update updatedAt before save
notificationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Notification", notificationSchema);