const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, requireSupportLevel } = require('../middleware/rbac');
const { unbindUserDevice } = require('../services/deviceBinding');
const { logAudit } = require('../services/audit');

// List Support Accounts (Super Admin only)
router.get('/users', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const users = db.prepare(`
    SELECT u.id as user_id, u.username, u.email, u.status, u.created_at, u.last_login_at,
           s.id as support_id, s.full_name, s.permission_level, s.device_status
    FROM users u
    JOIN support_users s ON u.id = s.user_id
    WHERE u.is_deleted = 0
    ORDER BY u.created_at DESC
  `).all();

  res.json({ supportUsers: users });
});

// Create Support Account (Super Admin only)
router.post('/users', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { full_name, username, password, email, permission_level } = req.body;

  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'Full Name, Username, and Password are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: `Username "${username}" already exists.` });
  }

  const roleSupport = db.prepare("SELECT id FROM roles WHERE name = 'support'").get();
  const passHash = bcrypt.hashSync(password, 10);
  const pLevel = Math.min(Math.max(parseInt(permission_level || 1, 10), 1), 4);

  let createdSupportId = null;
  const transaction = db.transaction(() => {
    const userRes = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, NULL, 'active')
    `).run(username.trim(), passHash, email, roleSupport.id);

    const supportRes = db.prepare(`
      INSERT INTO support_users (user_id, full_name, permission_level, device_status)
      VALUES (?, ?, ?, 'active')
    `).run(userRes.lastInsertRowid, full_name.trim(), pLevel);

    createdSupportId = supportRes.lastInsertRowid;

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Support Management',
      action: 'SUPPORT_USER_CREATED',
      targetEntity: 'support_users',
      targetId: supportRes.lastInsertRowid,
      newValues: { username, full_name, permission_level: pLevel },
      reason: 'Created new support team member'
    });
  });

  transaction();
  res.status(201).json({ success: true, supportId: createdSupportId, message: 'Support account created successfully.' });
});

// Update Support Account & Permission Level (Super Admin only)
router.put('/users/:id', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { username, full_name, email, permission_level, status, password } = req.body;

  const currentSupport = db.prepare(`
    SELECT u.*, s.permission_level, s.full_name
    FROM users u
    JOIN support_users s ON u.id = s.user_id
    WHERE u.id = ?
  `).get(userId);

  if (!currentSupport) {
    return res.status(404).json({ error: 'Support user not found.' });
  }

  // Check unique username if changing
  if (username && username.trim() && username.trim() !== currentSupport.username) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), userId);
    if (existing) {
      return res.status(400).json({ error: `Username "${username}" is already taken.` });
    }
  }

  const transaction = db.transaction(() => {
    // Update users table
    const updatedUsername = (username && username.trim()) ? username.trim() : currentSupport.username;
    const updatedEmail = email !== undefined ? (email ? email.trim() : null) : currentSupport.email;
    const updatedStatus = status || currentSupport.status;

    db.prepare(`
      UPDATE users SET
        username = ?,
        email = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(updatedUsername, updatedEmail, updatedStatus, userId);

    if (password && password.trim()) {
      const passHash = bcrypt.hashSync(password.trim(), 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passHash, userId);
    }

    // Update support_users table
    const updatedName = (full_name && full_name.trim()) ? full_name.trim() : currentSupport.full_name;
    const pLevel = permission_level ? Math.min(Math.max(parseInt(permission_level, 10), 1), 4) : currentSupport.permission_level;

    db.prepare(`
      UPDATE support_users SET
        full_name = ?,
        permission_level = ?
      WHERE user_id = ?
    `).run(updatedName, pLevel, userId);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Support Management',
      action: 'SUPPORT_USER_UPDATED',
      targetEntity: 'support_users',
      targetId: userId,
      oldValues: { username: currentSupport.username, full_name: currentSupport.full_name, permission_level: currentSupport.permission_level, status: currentSupport.status },
      newValues: { username: updatedUsername, full_name: updatedName, permission_level: pLevel, status: updatedStatus },
      reason: 'Support user master attributes updated'
    });
  });

  transaction();
  res.json({ success: true, message: 'Support user updated successfully.' });
});

// Dedicated Change Password for Support Account (Super Admin only)
router.post('/users/:id/change-password', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const new_password = req.body.new_password || req.body.newPassword;

  if (!new_password || !new_password.trim() || new_password.trim().length < 4) {
    return res.status(400).json({ error: 'New password is required (minimum 4 characters).' });
  }

  const user = db.prepare('SELECT u.username FROM users u JOIN support_users s ON u.id = s.user_id WHERE u.id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Support user not found.' });
  }

  const passHash = bcrypt.hashSync(new_password.trim(), 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passHash, userId);

  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: 'super_admin',
    panel: 'Super Admin Support Management',
    action: 'SUPPORT_USER_PASSWORD_CHANGED',
    targetEntity: 'users',
    targetId: userId,
    reason: `Password updated for support staff (${user.username})`
  });

  res.json({ success: true, message: `Password for support user "${user.username}" updated successfully.` });
});

// Dedicated Status Toggle / Suspend / Enable for Support Account (Super Admin only)
router.put('/users/:id/status', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { status } = req.body; // 'active' or 'disabled'

  if (!['active', 'disabled', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be active, disabled, or suspended.' });
  }

  const user = db.prepare('SELECT u.username, u.status FROM users u JOIN support_users s ON u.id = s.user_id WHERE u.id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Support user not found.' });
  }

  db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, userId);

  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: 'super_admin',
    panel: 'Super Admin Support Management',
    action: status === 'active' ? 'SUPPORT_USER_ACTIVATED' : 'SUPPORT_USER_SUSPENDED',
    targetEntity: 'users',
    targetId: userId,
    oldValues: { status: user.status },
    newValues: { status },
    reason: `Support account status changed to ${status}`
  });

  res.json({ success: true, message: `Support account "${user.username}" status updated to ${status}.` });
});

// Delete Support Account (Super Admin only)
router.delete('/users/:id', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const currentSupport = db.prepare(`
    SELECT u.username, s.full_name
    FROM users u
    JOIN support_users s ON u.id = s.user_id
    WHERE u.id = ?
  `).get(userId);

  if (!currentSupport) {
    return res.status(404).json({ error: 'Support user not found.' });
  }

  const transaction = db.transaction(() => {
    try {
      db.prepare('UPDATE service_requests SET resolved_by = NULL WHERE resolved_by = ?').run(userId);
    } catch (e) {}

    try {
      db.prepare('DELETE FROM service_request_messages WHERE user_id = ?').run(userId);
    } catch (e) {}

    try {
      db.prepare('DELETE FROM support_permissions WHERE support_user_id IN (SELECT id FROM support_users WHERE user_id = ?)').run(userId);
    } catch (e) {}

    db.prepare('DELETE FROM support_users WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Support Management',
      action: 'SUPPORT_USER_DELETED',
      targetEntity: 'support_users',
      targetId: userId,
      oldValues: { username: currentSupport.username, full_name: currentSupport.full_name },
      reason: 'Support staff account permanently deleted from database'
    });
  });

  transaction();
  res.json({ success: true, message: `Support account "${currentSupport.username}" deleted successfully.` });
});

// Deregister & Unbind Device (Support Level 1+ or Super Admin)
router.post('/unbind-device', verifyAuth, requireSupportLevel(1), (req, res) => {
  const { user_id, reason } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Target user_id is required.' });
  }

  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const result = unbindUserDevice({
    userId: user_id,
    authorizedUserId: req.user.id,
    authorizerName: req.user.username,
    authorizerRole: req.user.role_name,
    reason: reason || 'Support deregistered device via MAC address lock',
    ipAddress
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Create notification for employee
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Device Deregistered', 'Your device registration and MAC lock have been reset by Support. You can now log in and register your new device.', 'device')
    `).run(user_id);
  } catch (e) {}

  res.json({ success: true, message: result.message });
});

// View Registered Devices (Support Level 1+ or Super Admin)
router.get('/devices', verifyAuth, requireSupportLevel(1), (req, res) => {
  const { company_id, search } = req.query;

  let query = `
    SELECT d.*, u.username, u.company_id, e.employee_id as employee_code, e.full_name, c.name as company_name
    FROM employee_devices d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (company_id) {
    query += ' AND u.company_id = ?';
    params.push(company_id);
  }

  if (search) {
    query += ' AND (u.username LIKE ? OR e.full_name LIKE ? OR e.employee_id LIKE ? OR d.device_id LIKE ? OR d.mac_address LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY d.last_login_at DESC LIMIT 100';

  const devices = db.prepare(query).all(...params);
  res.json({ devices });
});

// Audit Logs View (Support Level 1+ or Super Admin)
router.get('/audit-logs', verifyAuth, requireSupportLevel(1), (req, res) => {
  const { company_id, action, search, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT a.*, c.name as company_name
    FROM audit_logs a
    LEFT JOIN companies c ON a.company_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (company_id) {
    query += ' AND a.company_id = ?';
    params.push(company_id);
  }

  if (action) {
    query += ' AND a.action = ?';
    params.push(action);
  }

  if (search) {
    query += ' AND (a.user_name LIKE ? OR a.reason LIKE ? OR a.target_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const logs = db.prepare(query).all(...params);
  const totalCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get().count;

  res.json({ logs, total: totalCount });
});

module.exports = router;
