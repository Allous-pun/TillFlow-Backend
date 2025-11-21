import NotificationService from '../services/notificationService.js';

// Admin: Create notification
export const createNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      priority,
      audience,
      targetBusinesses,
      scheduledFor,
      expiresAt,
      actions
    } = req.body;

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }

    const result = await NotificationService.createNotification({
      title,
      message,
      type,
      priority,
      audience,
      targetBusinesses,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      actions,
      createdBy: req.user.id
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);

  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating notification',
      error: error.message
    });
  }
};

// Admin: Get all notifications
export const getAllNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, type, audience } = req.query;

    const result = await NotificationService.getAllNotifications({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      type,
      audience
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications',
      error: error.message
    });
  }
};

// Admin: Update notification
export const updateNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const updateData = req.body;

    const result = await NotificationService.updateNotification(notificationId, updateData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Update notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating notification',
      error: error.message
    });
  }
};

// Admin: Publish notification
export const publishNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await NotificationService.publishNotification(notificationId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Publish notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while publishing notification',
      error: error.message
    });
  }
};

// Admin: Delete notification
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await NotificationService.deleteNotification(notificationId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting notification',
      error: error.message
    });
  }
};

// Admin: Get notification statistics
export const getNotificationStats = async (req, res) => {
  try {
    const result = await NotificationService.getNotificationStats();

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notification statistics',
      error: error.message
    });
  }
};

// Merchant: Get my notifications
export const getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const businessId = req.query.businessId || null;

    const result = await NotificationService.getUserNotifications(
      req.user.id, 
      businessId, 
      {
        page: parseInt(page),
        limit: parseInt(limit),
        unreadOnly: unreadOnly === 'true'
      }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Get my notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications',
      error: error.message
    });
  }
};

// Merchant: Mark notification as read
export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await NotificationService.markAsRead(notificationId, req.user.id);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking notification as read',
      error: error.message
    });
  }
};

// Merchant: Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const businessId = req.query.businessId || null;

    const result = await NotificationService.markAllAsRead(req.user.id, businessId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while marking notifications as read',
      error: error.message
    });
  }
};

// Merchant: Get unread count
export const getUnreadCount = async (req, res) => {
  try {
    const businessId = req.query.businessId || null;

    const result = await NotificationService.getUserNotifications(
      req.user.id, 
      businessId, 
      { unreadOnly: true, limit: 1 }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      unreadCount: result.unreadCount
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching unread count',
      error: error.message
    });
  }
};