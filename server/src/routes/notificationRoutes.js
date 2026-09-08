const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');

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

module.exports = router;
