const express = require('express');
const router = express.Router();

const {
  getNotifications,
  getUnreadCount,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controller/notificationController');

router.get('/:studentId', getNotifications);
router.get('/:studentId/unread-count', getUnreadCount);
router.post('/', createNotification);
router.patch('/:notifId/read', markAsRead);
router.patch('/:studentId/read-all', markAllAsRead);
router.delete('/:notifId', deleteNotification);

module.exports = router;
