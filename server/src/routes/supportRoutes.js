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

// --- UNIVERSAL INSTANT SEARCH & RESOLUTION ---

// Instant Multi-Attribute Search for Support Desk (by username, phone/mobile, email, full name, employee id)
router.get('/search-user', verifyAuth, requireSupportLevel(1), (req, res) => {
  const { q, company_id } = req.query;

  if (!q || !q.trim()) {
    return res.json({ results: [] });
  }

  const term = `%${q.trim()}%`;
  let query = `
    SELECT u.id as user_id, u.username, u.email as user_email, u.mobile as user_mobile, u.status as user_status,
           u.last_login_at, u.created_at as account_created_at,
           r.name as role_name,
           u.company_id, c.name as company_name, c.code as company_code,
           e.id as employee_id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           COALESCE(e.mobile, u.mobile, '') as mobile,
           COALESCE(e.email, u.email, '') as email,
           COALESCE(e.status, u.status) as status
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE u.is_deleted = 0
      AND (
        u.username LIKE ? OR
        u.email LIKE ? OR
        e.email LIKE ? OR
        u.mobile LIKE ? OR
        e.mobile LIKE ? OR
        e.full_name LIKE ? OR
        e.employee_id LIKE ?
      )
  `;
  const params = [term, term, term, term, term, term, term];

  if (company_id && company_id !== 'all') {
    query += ' AND u.company_id = ?';
    params.push(company_id);
  }

  query += ' ORDER BY u.last_login_at DESC, u.id DESC LIMIT 15';

  const rows = db.prepare(query).all(...params);

  // For each user, attach bound device, recent tickets/issues, and recent attendance
  const results = rows.map(user => {
    // 1. Bound Device
    const device = db.prepare(`
      SELECT * FROM employee_devices 
      WHERE user_id = ? AND status = 'bound'
      ORDER BY last_login_at DESC LIMIT 1
    `).get(user.user_id) || null;

    // 2. Tickets & Service Requests
    let tickets = [];
    if (user.employee_id) {
      tickets = db.prepare(`
        SELECT sr.*, c.name as company_name
        FROM service_requests sr
        LEFT JOIN companies c ON sr.company_id = c.id
        WHERE sr.employee_id = ?
        ORDER BY sr.created_at DESC LIMIT 10
      `).all(user.employee_id);
    } else {
      tickets = db.prepare(`
        SELECT sr.*, c.name as company_name
        FROM service_requests sr
        LEFT JOIN companies c ON sr.company_id = c.id
        WHERE sr.company_id = ? AND (sr.title LIKE ? OR sr.description LIKE ?)
        ORDER BY sr.created_at DESC LIMIT 5
      `).all(user.company_id, `%${user.username}%`, `%${user.username}%`);
    }

    // 3. Recent Attendance Records
    let recentAttendance = [];
    if (user.employee_id) {
      recentAttendance = db.prepare(`
        SELECT * FROM attendance_records 
        WHERE employee_id = ? 
        ORDER BY date DESC LIMIT 7
      `).all(user.employee_id);
    }

    return {
      ...user,
      device,
      tickets,
      recentAttendance
    };
  });

  res.json({ results });
});

// Update User Profile & Requirements from Support Panel
router.put('/update-user-profile/:id', verifyAuth, requireSupportLevel(1), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { email, mobile, status, password, reason } = req.body;

  const targetUser = db.prepare(`
    SELECT u.*, r.name as role_name, e.id as employee_row_id, e.full_name, c.name as company_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE u.id = ? AND u.is_deleted = 0
  `).get(userId);

  if (!targetUser) {
    return res.status(404).json({ error: 'User account not found or deleted.' });
  }

  // Prevent modifying super_admin accounts via support
  if (targetUser.role_name === 'super_admin') {
    return res.status(403).json({ error: 'Super Admin accounts cannot be modified by Support.' });
  }

  const transaction = db.transaction(() => {
    // 1. Update Email
    if (email !== undefined) {
      const cleanEmail = email ? email.trim() : null;
      db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanEmail, userId);
      if (targetUser.employee_row_id) {
        db.prepare('UPDATE employees SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanEmail, targetUser.employee_row_id);
      }
    }

    // 2. Update Mobile / Phone
    if (mobile !== undefined) {
      const cleanMobile = mobile ? mobile.trim() : null;
      db.prepare('UPDATE users SET mobile = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanMobile, userId);
      if (targetUser.employee_row_id) {
        db.prepare('UPDATE employees SET mobile = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cleanMobile, targetUser.employee_row_id);
      }
    }

    // 3. Update Status
    if (status && ['active', 'disabled', 'suspended'].includes(status)) {
      db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, userId);
      if (targetUser.employee_row_id) {
        const empStatus = status === 'active' ? 'active' : 'inactive';
        db.prepare('UPDATE employees SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(empStatus, targetUser.employee_row_id);
      }
    }

    // 4. Update Password if specified
    if (password && password.trim()) {
      if (password.trim().length < 4) {
        throw new Error('Password must be at least 4 characters.');
      }
      const passHash = bcrypt.hashSync(password.trim(), 10);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passHash, userId);
    }

    // 5. Audit Log
    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Support Operations Hub',
      action: 'SUPPORT_USER_REQUIREMENTS_UPDATED',
      targetEntity: 'users',
      targetId: userId,
      companyId: targetUser.company_id,
      oldValues: { email: targetUser.email, mobile: targetUser.mobile, status: targetUser.status },
      newValues: { email, mobile, status, passwordUpdated: !!(password && password.trim()) },
      reason: reason ? reason.trim() : 'Support updated user profile / requirements per customer request'
    });
  });

  try {
    transaction();
    res.json({
      success: true,
      message: `Account requirements updated successfully for "${targetUser.username}".`
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update user profile.' });
  }
});

// --- LEVEL 4 ONLINE REMOTE ACCESS CONSOLE ---

// Remote Targets: List companies and users accessible for remote diagnostics (Level 4 Support only)
router.get('/remote/targets', verifyAuth, requireSupportLevel(4), (req, res) => {
  const { company_id, search } = req.query;

  let compQuery = `
    SELECT c.id, c.name, c.code, c.status, c.created_at,
           (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.is_deleted = 0) as total_employees,
           (SELECT COUNT(*) FROM employee_devices d JOIN users u ON d.user_id = u.id WHERE u.company_id = c.id AND d.status = 'bound') as bound_devices_count,
           (SELECT COUNT(*) FROM service_requests sr WHERE sr.company_id = c.id AND sr.status IN ('pending', 'in_progress')) as open_tickets_count
    FROM companies c
    WHERE c.status != 'deleted'
  `;
  const compParams = [];
  if (company_id && company_id !== 'all') {
    compQuery += ' AND c.id = ?';
    compParams.push(company_id);
  }
  compQuery += ' ORDER BY c.name ASC';
  const companies = db.prepare(compQuery).all(...compParams);

  // Also query matching target employees/users
  let userQuery = `
    SELECT u.id as user_id, u.username, u.email, u.mobile, u.status, u.last_login_at,
           r.name as role_name,
           c.id as company_id, c.name as company_name, c.code as company_code,
           e.id as employee_id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           d.id as device_row_id, d.device_name, d.device_type, d.mac_address, d.device_id, d.status as device_status, d.bound_ip
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    LEFT JOIN employee_devices d ON u.id = d.user_id AND d.status = 'bound'
    WHERE u.is_deleted = 0 AND r.name NOT IN ('super_admin', 'support')
  `;
  const userParams = [];

  if (company_id && company_id !== 'all') {
    userQuery += ' AND u.company_id = ?';
    userParams.push(company_id);
  }

  if (search && search.trim()) {
    const sTerm = `%${search.trim()}%`;
    userQuery += ' AND (u.username LIKE ? OR e.full_name LIKE ? OR e.employee_id LIKE ? OR e.mobile LIKE ? OR u.mobile LIKE ? OR u.email LIKE ?)';
    userParams.push(sTerm, sTerm, sTerm, sTerm, sTerm, sTerm);
  }

  userQuery += ' ORDER BY u.last_login_at DESC, u.id DESC LIMIT 50';
  const targetUsers = db.prepare(userQuery).all(...userParams);

  res.json({
    companies,
    targetUsers
  });
});

// Remote Deep Diagnostics for Target User (Level 4 Support only)
router.get('/remote/diagnostics/:userId', verifyAuth, requireSupportLevel(4), (req, res) => {
  const userId = parseInt(req.params.userId, 10);

  const user = db.prepare(`
    SELECT u.id as user_id, u.username, u.email, u.mobile, u.status as user_status, u.last_login_at, u.created_at,
           r.name as role_name,
           c.id as company_id, c.name as company_name, c.code as company_code,
           e.id as employee_id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           e.geofence_id, e.shift_id
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE u.id = ? AND u.is_deleted = 0
  `).get(userId);

  if (!user) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  // Bound Device info
  const device = db.prepare(`
    SELECT * FROM employee_devices 
    WHERE user_id = ? AND status = 'bound'
    ORDER BY last_login_at DESC LIMIT 1
  `).get(userId) || null;

  // Today's attendance record
  const todayStr = new Date().toISOString().split('T')[0];
  let todayAttendance = null;
  if (user.employee_id) {
    todayAttendance = db.prepare(`
      SELECT * FROM attendance_records 
      WHERE employee_id = ? AND date = ?
    `).get(user.employee_id, todayStr) || null;
  }

  // Last GPS location tracking log
  let lastLocation = null;
  if (user.employee_id) {
    lastLocation = db.prepare(`
      SELECT * FROM location_tracking_logs 
      WHERE employee_id = ? 
      ORDER BY captured_at DESC LIMIT 1
    `).get(user.employee_id) || null;
  }

  // Assigned Geofence
  let geofence = null;
  if (user.geofence_id) {
    geofence = db.prepare('SELECT * FROM geofences WHERE id = ?').get(user.geofence_id) || null;
  }

  // Assigned Shift
  let shift = null;
  if (user.shift_id) {
    shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(user.shift_id) || null;
  }

  // Active Tickets
  let activeTickets = [];
  if (user.employee_id) {
    activeTickets = db.prepare(`
      SELECT * FROM service_requests 
      WHERE employee_id = ? AND status IN ('pending', 'in_progress')
      ORDER BY created_at DESC
    `).all(user.employee_id);
  }

  res.json({
    user,
    device,
    todayAttendance,
    lastLocation,
    geofence,
    shift,
    activeTickets
  });
});

// Initiate Remote Online Support Session (Level 4 Support only)
router.post('/remote/session', verifyAuth, requireSupportLevel(4), (req, res) => {
  const { user_id, company_id, reason } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Target user_id is required.' });
  }

  const targetUser = db.prepare(`
    SELECT u.id, u.username, u.company_id, e.full_name, c.name as company_name
    FROM users u
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE u.id = ?
  `).get(user_id);

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Generate 6-digit session PIN
  const sessionPin = 'REM-' + Math.floor(100000 + Math.random() * 900000);
  const now = new Date().toISOString();

  // Log session in audit_logs
  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Level 4 Remote Access Console',
    action: 'REMOTE_ONLINE_SESSION_INITIATED',
    targetEntity: 'users',
    targetId: user_id,
    companyId: targetUser.company_id,
    newValues: { sessionPin, targetUser: targetUser.username, targetCompany: targetUser.company_name },
    reason: reason || 'Support Level 4 initiated live online remote diagnostic session'
  });

  // Dispatch notification to user
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type)
      VALUES (?, ?, 'Online Support Remote Assist Active', ?, 'system')
    `).run(user_id, targetUser.company_id, `Support Engineer ${req.user.username} has initiated an Online Remote Assistance Session (Session PIN: ${sessionPin}) to diagnose and resolve your issue.`);
  } catch (e) {}

  res.json({
    success: true,
    sessionPin,
    connectedAt: now,
    target: {
      userId: targetUser.id,
      username: targetUser.username,
      fullName: targetUser.full_name || targetUser.username,
      companyName: targetUser.company_name
    },
    message: `Online Remote Assist Session ${sessionPin} initiated successfully.`
  });
});

// Remote Quick Action Dispatch (Level 4 Support only)
router.post('/remote/quick-action', verifyAuth, requireSupportLevel(4), (req, res) => {
  const { user_id, action, payload = {}, reason } = req.body;

  if (!user_id || !action) {
    return res.status(400).json({ error: 'Target user_id and action are required.' });
  }

  const targetUser = db.prepare(`
    SELECT u.*, e.id as employee_id, e.full_name, c.name as company_name
    FROM users u
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE u.id = ?
  `).get(user_id);

  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  if (action === 'unbind_device') {
    const result = unbindUserDevice({
      userId: user_id,
      authorizedUserId: req.user.id,
      authorizerName: req.user.username,
      authorizerRole: req.user.role_name,
      reason: reason || 'Support Level 4 remote device unlock and MAC reset',
      ipAddress
    });
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json({ success: true, message: 'Device unbound and MAC lock cleared successfully via Remote Control.' });
  }

  if (action === 'sync_attendance') {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!targetUser.employee_id) {
      return res.status(400).json({ error: 'Target user is not an employee.' });
    }

    const existingAtt = db.prepare('SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?').get(targetUser.employee_id, todayStr);
    const punchIn = payload.punch_in_time || '09:30:00';
    const punchOut = payload.punch_out_time || '18:30:00';
    const attStatus = payload.status || 'Present';

    if (existingAtt) {
      db.prepare(`
        UPDATE attendance_records 
        SET punch_in_time = ?, punch_out_time = ?, status = ?, total_hours = 9, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(punchIn, punchOut, attStatus, existingAtt.id);
    } else {
      db.prepare(`
        INSERT INTO attendance_records (company_id, employee_id, date, punch_in_time, punch_out_time, status, total_hours)
        VALUES (?, ?, ?, ?, ?, ?, 9)
      `).run(targetUser.company_id, targetUser.employee_id, todayStr, punchIn, punchOut, attStatus);
    }

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_ATTENDANCE_SYNCED',
      targetEntity: 'attendance_records',
      targetId: targetUser.employee_id,
      companyId: targetUser.company_id,
      reason: reason || 'Remote Attendance Force-Sync & Correction'
    });

    return res.json({ success: true, message: `Remote Attendance synced as "${attStatus}" for today.` });
  }

  if (action === 'reset_password') {
    const newPass = payload.new_password || 'Npb@' + Math.floor(1000 + Math.random() * 9000);
    const passHash = bcrypt.hashSync(newPass, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passHash, user_id);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_PASSWORD_RESET',
      targetEntity: 'users',
      targetId: user_id,
      companyId: targetUser.company_id,
      reason: reason || 'Remote Password Reset by Level 4 Support'
    });

    return res.json({ success: true, newPassword: newPass, message: `Password reset successfully. New temporary password: ${newPass}` });
  }

  if (action === 'toggle_status') {
    const newStatus = targetUser.status === 'active' ? 'disabled' : 'active';
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, user_id);
    if (targetUser.employee_id) {
      db.prepare('UPDATE employees SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus === 'active' ? 'active' : 'inactive', targetUser.employee_id);
    }

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_ACCOUNT_STATUS_TOGGLED',
      targetEntity: 'users',
      targetId: user_id,
      companyId: targetUser.company_id,
      newValues: { status: newStatus },
      reason: reason || `Remote account status changed to ${newStatus}`
    });

    return res.json({ success: true, newStatus, message: `Account status remotely set to ${newStatus}.` });
  }

  if (action === 'send_alert') {
    const title = payload.title || 'Technical Support Notice';
    const message = payload.message || 'Support Team is reviewing your account.';
    try {
      db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type)
        VALUES (?, ?, ?, ?, 'system')
      `).run(user_id, targetUser.company_id, title, message);
    } catch (e) {}

    return res.json({ success: true, message: 'Priority alert notification sent to user portal.' });
  }

  return res.status(400).json({ error: `Unknown remote action "${action}".` });
});

module.exports = router;

