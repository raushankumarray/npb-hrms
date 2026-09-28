const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { deleteFromFirebase } = require('../services/firebase');
const { addSseClient, removeSseClient, createNotification } = require('../services/notificationService');

// Get Notifications for logged-in user
router.get('/', verifyAuth, (req, res) => {
  const { status, limit = 50 } = req.query;
  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [req.user.id];

  if (status === 'unread') {
    query += ' AND is_read = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit, 10) || 50);

  const notifications = db.prepare(query).all(...params);

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND is_read = 0
  `).get(req.user.id).count;

  res.json({ notifications, unreadCount });
});

// Server-Sent Events (SSE) Stream for Instant Real-Time Push Notifications
router.get('/stream', verifyAuth, (req, res) => {
  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const userId = req.user.id;
  addSseClient(userId, res);

  // Send initial connection event
  res.write(': connected\n\n');

  // Heartbeat to keep connection open through firewalls and mobile proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
      removeSseClient(userId, res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(userId, res);
  });
});

// Trigger a Test Notification (for browser permission and audio verification)
router.post('/test', verifyAuth, (req, res) => {
  const userRole = req.user.role_name || req.user.role || 'user';
  const notif = createNotification({
    userId: req.user.id,
    companyId: req.user.company_id,
    title: 'NPB HRMS Notification Test',
    message: `Phone and browser notifications are successfully active for ${req.user.full_name || req.user.username} (${userRole}).`,
    type: 'system',
    link: '/dashboard'
  });

  res.json({ success: true, notification: notif });
});

// Mark single notification as read (supports both PUT and PATCH)
const markSingleRead = (req, res) => {
  const notifId = parseInt(req.params.id, 10);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notifId, req.user.id);
  res.json({ success: true });
};
router.put('/:id/read', verifyAuth, markSingleRead);
router.patch('/:id/read', verifyAuth, markSingleRead);

// Mark all as read
router.put('/read-all', verifyAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true, message: 'All notifications marked as read.' });
});

// Delete single notification
router.delete('/:id', verifyAuth, (req, res) => {
  const notifId = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(notifId, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(notifId, req.user.id);

  try {
    deleteFromFirebase('notifications', notifId).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: 'Notification deleted.' });
});

// Clear all notifications for user
router.delete('/', verifyAuth, (req, res) => {
  const existingIds = db.prepare('SELECT id FROM notifications WHERE user_id = ?').all(req.user.id).map(n => n.id);
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);

  try {
    for (const nId of existingIds) {
      deleteFromFirebase('notifications', nId).catch(() => {});
    }
  } catch (e) {}

  res.json({ success: true, message: 'All notifications cleared.' });
});

module.exports = router;
