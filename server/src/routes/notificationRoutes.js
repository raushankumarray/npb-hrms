const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { deleteFromFirebase } = require('../services/firebase');

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
