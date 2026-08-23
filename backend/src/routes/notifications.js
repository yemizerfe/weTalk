const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const NotificationController = require('../controllers/notifications');

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Get all notifications
router.get('/', NotificationController.getNotifications);

// Get unread count
router.get('/unread/count', NotificationController.getUnreadCount);

// Mark notification as read
router.put('/:notificationId/read', NotificationController.markAsRead);

// Mark all as read
router.put('/mark-all-read', NotificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', NotificationController.deleteNotification);

// Delete all read notifications
router.delete('/read/all', NotificationController.deleteAllRead);

module.exports = router;
