const { v4: uuidv4 } = require('uuid');
const { notifications, students } = require('../db/store');
const { Log } = require('../config/logger');

// GET /api/notifications/:studentId
// returns all notifications for a student, newest first
async function getNotifications(req, res) {
  const { studentId } = req.params;
  const { type, isRead, page = 1, limit = 20 } = req.query;

  await Log('backend', 'info', 'handler', `Fetching notifs for ${studentId}`);

  if (!students.has(studentId)) {
    await Log('backend', 'warn', 'handler', `Student ${studentId} not found`);
    return res.status(404).json({ error: 'Student not found' });
  }

  let results = [...notifications.values()].filter(n => n.studentId === studentId);

  // apply optional filters
  if (type) results = results.filter(n => n.type === type);
  if (isRead !== undefined) results = results.filter(n => n.isRead === (isRead === 'true'));

  // sort newest first
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // paginate
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const paginated = results.slice(offset, offset + parseInt(limit));

  await Log('backend', 'info', 'handler', `Returning ${paginated.length} notifs`);

  res.json({
    studentId,
    total: results.length,
    page: parseInt(page),
    limit: parseInt(limit),
    notifications: paginated
  });
}

// GET /api/notifications/:studentId/unread-count
async function getUnreadCount(req, res) {
  const { studentId } = req.params;

  await Log('backend', 'info', 'handler', `Unread count for ${studentId}`);

  if (!students.has(studentId)) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const count = [...notifications.values()].filter(
    n => n.studentId === studentId && !n.isRead
  ).length;

  res.json({ studentId, unreadCount: count });
}

// POST /api/notifications
// create a new notification (called by internal services / admin)
async function createNotification(req, res) {
  const { studentId, type, title, message, metadata } = req.body;

  await Log('backend', 'info', 'handler', `Creating ${type} notif for ${studentId}`);

  if (!studentId || !type || !title || !message) {
    await Log('backend', 'warn', 'handler', 'Missing required fields');
    return res.status(400).json({ error: 'studentId, type, title and message are required' });
  }

  const validTypes = ['placement', 'event', 'result', 'general'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }

  if (!students.has(studentId)) {
    await Log('backend', 'warn', 'db', `Student ${studentId} not found`);
    return res.status(404).json({ error: 'Student not found' });
  }

  const notif = {
    id: uuidv4(),
    studentId,
    type,
    title,
    message,
    metadata: metadata || {},
    isRead: false,
    createdAt: new Date().toISOString()
  };

  notifications.set(notif.id, notif);

  await Log('backend', 'info', 'db', `Notif ${notif.id.slice(0,8)} stored`);

  res.status(201).json({ message: 'Notification created', notification: notif });
}

// PATCH /api/notifications/:notifId/read
// mark a single notification as read
async function markAsRead(req, res) {
  const { notifId } = req.params;

  await Log('backend', 'info', 'handler', `Mark read: ${notifId.slice(0,8)}`);

  const notif = notifications.get(notifId);
  if (!notif) {
    await Log('backend', 'warn', 'handler', `Notification ${notifId} not found`);
    return res.status(404).json({ error: 'Notification not found' });
  }

  notif.isRead = true;
  notif.readAt = new Date().toISOString();
  notifications.set(notifId, notif);

  await Log('backend', 'info', 'db', `Notif ${notifId.slice(0,8)} marked read`);

  res.json({ message: 'Marked as read', notification: notif });
}

// PATCH /api/notifications/:studentId/read-all
// mark everything as read for a student
async function markAllAsRead(req, res) {
  const { studentId } = req.params;

  await Log('backend', 'info', 'handler', `Mark all read for ${studentId}`);

  if (!students.has(studentId)) {
    return res.status(404).json({ error: 'Student not found' });
  }

  let count = 0;
  for (const [id, notif] of notifications) {
    if (notif.studentId === studentId && !notif.isRead) {
      notif.isRead = true;
      notif.readAt = new Date().toISOString();
      notifications.set(id, notif);
      count++;
    }
  }

  await Log('backend', 'info', 'db', `${count} notifs marked read`);

  res.json({ message: `${count} notifications marked as read` });
}

// DELETE /api/notifications/:notifId
async function deleteNotification(req, res) {
  const { notifId } = req.params;

  await Log('backend', 'info', 'handler', `Delete: ${notifId.slice(0,8)}`);

  if (!notifications.has(notifId)) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  notifications.delete(notifId);

  await Log('backend', 'info', 'db', `Notif ${notifId.slice(0,8)} deleted`);

  res.json({ message: 'Notification deleted' });
}

module.exports = {
  getNotifications,
  getUnreadCount,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
