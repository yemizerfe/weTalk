const prisma = require('../config/db');

class NotificationController {
  // Get all notifications for user
  static async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0, unreadOnly = false } = req.query;

      const where = { userId };
      if (unreadOnly === 'true') {
        where.isRead = false;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit),
          skip: parseInt(offset)
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({
          where: { userId, isRead: false }
        })
      ]);

      res.json({
        notifications,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + notifications.length) < total
        },
        unreadCount
      });

    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: 'Failed to get notifications' });
    }
  }

  // Get unread count
  static async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;

      const count = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      res.json({ count });

    } catch (error) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  }

  // Mark notification as read
  static async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId
        }
      });

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      await prisma.notification.update({
        where: { id: notificationId },
        data: { isRead: true }
      });

      res.json({ message: 'Notification marked as read' });

    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }

  // Mark all as read
  static async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;

      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: { isRead: true }
      });

      res.json({ 
        message: 'All notifications marked as read',
        count: result.count 
      });

    } catch (error) {
      console.error('Mark all as read error:', error);
      res.status(500).json({ error: 'Failed to mark all as read' });
    }
  }

  // Delete notification
  static async deleteNotification(req, res) {
    try {
      const userId = req.user.id;
      const { notificationId } = req.params;

      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId
        }
      });

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      await prisma.notification.delete({
        where: { id: notificationId }
      });

      res.json({ message: 'Notification deleted' });

    } catch (error) {
      console.error('Delete notification error:', error);
      res.status(500).json({ error: 'Failed to delete notification' });
    }
  }

  // Delete all read notifications
  static async deleteAllRead(req, res) {
    try {
      const userId = req.user.id;

      const result = await prisma.notification.deleteMany({
        where: {
          userId,
          isRead: true
        }
      });

      res.json({ 
        message: 'All read notifications deleted',
        count: result.count 
      });

    } catch (error) {
      console.error('Delete all read error:', error);
      res.status(500).json({ error: 'Failed to delete read notifications' });
    }
  }

  // Create notification (internal use, called by other controllers)
  static async createNotification(userId, type, title, message, data = null) {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data: data ? JSON.stringify(data) : null
        }
      });

      // Emit socket event if user is online
      const { activeUsers } = require('../socket');
      const userSocket = activeUsers.get(userId);
      if (userSocket) {
        const io = require('../server').io;
        if (io) {
          io.to(userSocket.socketId).emit('notification:new', notification);
        }
      }

      return notification;

    } catch (error) {
      console.error('Create notification error:', error);
      throw error;
    }
  }
}

module.exports = NotificationController;
