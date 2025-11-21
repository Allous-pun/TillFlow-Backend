import Notification from '../models/Notification.js';
import User from '../models/User.js';

class NotificationService {
  // Create a new notification
  async createNotification(notificationData) {
    try {
      const {
        title,
        message,
        type = 'info',
        priority = 'medium',
        audience = 'all',
        targetBusinesses = [],
        scheduledFor = null,
        expiresAt = null,
        actions = [],
        createdBy
      } = notificationData;

      // Validate required fields
      if (!title || !message) {
        throw new Error('Title and message are required');
      }

      // Validate audience and target businesses
      if (audience === 'specific_businesses' && targetBusinesses.length === 0) {
        throw new Error('Target businesses are required for specific audience');
      }

      // Create notification
      const notification = new Notification({
        title,
        message,
        type,
        priority,
        audience,
        targetBusinesses,
        scheduledFor,
        expiresAt,
        actions,
        createdBy,
        status: scheduledFor ? 'scheduled' : 'draft'
      });

      await notification.save();
      await notification.populate('createdBy', 'fullName email');
      await notification.populate('targetBusinesses', 'businessName mpesaShortCode');

      return {
        success: true,
        notification: notification.getFullDetails(),
        message: 'Notification created successfully'
      };

    } catch (error) {
      console.error('Create notification error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get notifications for user
  async getUserNotifications(userId, businessId = null, options = {}) {
    try {
      const { page = 1, limit = 20, unreadOnly = false } = options;

      let notifications = await Notification.findActiveForUser(userId, businessId);

      // Filter unread if requested
      if (unreadOnly) {
        notifications = notifications.filter(notification => 
          notification.isUnread(userId)
        );
      }

      // Apply pagination
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;
      const paginatedNotifications = notifications.slice(startIndex, endIndex);

      // Format response with user-specific data
      const formattedNotifications = paginatedNotifications.map(notification => 
        notification.getFullDetails(userId)
      );

      return {
        success: true,
        notifications: formattedNotifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: notifications.length,
          pages: Math.ceil(notifications.length / parseInt(limit))
        },
        unreadCount: notifications.filter(n => n.isUnread(userId)).length
      };

    } catch (error) {
      console.error('Get user notifications error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.markAsRead(notificationId, userId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      return {
        success: true,
        message: 'Notification marked as read',
        notification: notification.getFullDetails(userId)
      };

    } catch (error) {
      console.error('Mark as read error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Mark all notifications as read
  async markAllAsRead(userId, businessId = null) {
    try {
      const markedCount = await Notification.markAllAsRead(userId, businessId);

      return {
        success: true,
        message: `Marked ${markedCount} notifications as read`,
        markedCount
      };

    } catch (error) {
      console.error('Mark all as read error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get notification statistics (admin)
  async getNotificationStats() {
    try {
      const totalNotifications = await Notification.countDocuments();
      const activeNotifications = await Notification.countDocuments({ status: 'active' });
      const scheduledNotifications = await Notification.countDocuments({ status: 'scheduled' });
      
      const typeStats = await Notification.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);

      const priorityStats = await Notification.aggregate([
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]);

      return {
        success: true,
        stats: {
          total: totalNotifications,
          active: activeNotifications,
          scheduled: scheduledNotifications,
          byType: typeStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          byPriority: priorityStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {})
        }
      };

    } catch (error) {
      console.error('Get notification stats error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Publish notification (admin)
  async publishNotification(notificationId) {
    try {
      const notification = await Notification.findById(notificationId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status === 'active') {
        throw new Error('Notification is already active');
      }

      await notification.publish();

      return {
        success: true,
        message: 'Notification published successfully',
        notification: notification.getFullDetails()
      };

    } catch (error) {
      console.error('Publish notification error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Update notification (admin)
  async updateNotification(notificationId, updateData) {
    try {
      const notification = await Notification.findById(notificationId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status === 'active') {
        throw new Error('Cannot update active notification');
      }

      const allowedFields = [
        'title', 'message', 'type', 'priority', 'audience', 
        'targetBusinesses', 'scheduledFor', 'expiresAt', 'actions'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          notification[field] = updateData[field];
        }
      });

      // Update status if scheduledFor changed
      if (updateData.scheduledFor !== undefined) {
        notification.status = updateData.scheduledFor ? 'scheduled' : 'draft';
      }

      await notification.save();
      await notification.populate('createdBy', 'fullName email');
      await notification.populate('targetBusinesses', 'businessName mpesaShortCode');

      return {
        success: true,
        message: 'Notification updated successfully',
        notification: notification.getFullDetails()
      };

    } catch (error) {
      console.error('Update notification error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Delete notification (admin)
  async deleteNotification(notificationId) {
    try {
      const notification = await Notification.findById(notificationId);
      
      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.status === 'active') {
        throw new Error('Cannot delete active notification');
      }

      await Notification.findByIdAndDelete(notificationId);

      return {
        success: true,
        message: 'Notification deleted successfully'
      };

    } catch (error) {
      console.error('Delete notification error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get all notifications (admin)
  async getAllNotifications(options = {}) {
    try {
      const { page = 1, limit = 50, status, type, audience } = options;

      let filter = {};
      if (status) filter.status = status;
      if (type) filter.type = type;
      if (audience) filter.audience = audience;

      const notifications = await Notification.find(filter)
        .populate('createdBy', 'fullName email')
        .populate('targetBusinesses', 'businessName mpesaShortCode')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .exec();

      const total = await Notification.countDocuments(filter);

      return {
        success: true,
        notifications: notifications.map(notification => notification.getFullDetails()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };

    } catch (error) {
      console.error('Get all notifications error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default new NotificationService();