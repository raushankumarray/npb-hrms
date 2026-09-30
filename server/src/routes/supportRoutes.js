const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, requireSupportLevel, parseSupportAssignedCompanies, isCompanyAuthorized } = require('../middleware/rbac');
const { unbindUserDevice } = require('../services/deviceBinding');
const { logAudit } = require('../services/audit');
const { createNotification } = require('../services/notificationService');
const { syncSupportUser, syncUser, syncEmployee, syncLeaveRequest, syncLeaveBalance, syncLeaveTransaction, syncAttendancePunch, deleteFromFirebase } = require('../services/firebase');

// List Support Accounts (Super Admin only)
router.get('/users', verifyAuth, requireRole(['super_admin']), (req, res) => {
  let hasAiCol = true;
  let hasAuditCol = true;
  try {
    const cols = db.prepare("PRAGMA table_info(support_users)").all();
    hasAiCol = cols.some(c => c.name === 'enable_ai_assistant');
    if (!hasAiCol) {
      db.prepare("ALTER TABLE support_users ADD COLUMN enable_ai_assistant INTEGER DEFAULT 0").run();
      hasAiCol = true;
    }
    hasAuditCol = cols.some(c => c.name === 'enable_audit_logs');
    if (!hasAuditCol) {
      db.prepare("ALTER TABLE support_users ADD COLUMN enable_audit_logs INTEGER DEFAULT 1").run();
      hasAuditCol = true;
    }
    if (!cols.some(c => c.name === 'support_level')) {
      db.prepare("ALTER TABLE support_users ADD COLUMN support_level TEXT DEFAULT 'Level 1'").run();
      db.prepare("UPDATE support_users SET support_level = 'Level ' || COALESCE(permission_level, 1)").run();
    }
  } catch (e) {
    hasAiCol = false;
    hasAuditCol = false;
  }

  const aiSelect = hasAiCol ? 'COALESCE(s.enable_ai_assistant, 0)' : '0';
  const auditSelect = hasAuditCol ? 'COALESCE(s.enable_audit_logs, 1)' : '1';
  const users = db.prepare(`
    SELECT u.id as user_id, u.username, u.email, u.status, u.created_at, u.last_login_at,
           s.id as support_id, s.full_name, s.permission_level,
           COALESCE(s.support_level, 'Level ' || s.permission_level) as support_level,
           s.device_status, ${aiSelect} as enable_ai_assistant,
           ${auditSelect} as enable_audit_logs,
           COALESCE(s.assigned_companies, 'all') as assigned_companies
    FROM users u
    JOIN support_users s ON u.id = s.user_id
    WHERE u.is_deleted = 0
      AND LOWER(u.username) != 'support_rahul'
      AND LOWER(COALESCE(u.email, '')) != 'rahul.support@npbhrms.com'
      AND LOWER(s.full_name) NOT LIKE '%rahul verma%'
    ORDER BY u.created_at DESC
  `).all();

  res.json({ supportUsers: users });
});

// Create Support Account (Super Admin only)
router.post('/users', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { full_name, username, password, email, permission_level, support_level, enable_ai_assistant, enable_audit_logs, assigned_companies } = req.body;

  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'Full Name, Username, and Password are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: `Username "${username}" already exists.` });
  }

  const roleSupport = db.prepare("SELECT id FROM roles WHERE name = 'support'").get();
  const passHash = bcrypt.hashSync(password, 10);
  const rawLvl = support_level || permission_level || 1;
  const digits = String(rawLvl).replace(/\D/g, '');
  const pLevel = Math.min(Math.max(digits ? parseInt(digits, 10) : (typeof rawLvl === 'number' ? rawLvl : 1), 1), 4);
  const sLevelStr = `Level ${pLevel}`;
  const aiEnabled = enable_ai_assistant === true || enable_ai_assistant === 1 || enable_ai_assistant === 'true' ? 1 : 0;
  const auditLogsEnabled = enable_audit_logs === false || enable_audit_logs === 0 || enable_audit_logs === 'false' ? 0 : 1;

  let assignedCompVal = 'all';
  if (assigned_companies && assigned_companies !== 'all') {
    if (Array.isArray(assigned_companies)) {
      const cleanIds = assigned_companies.map(Number).filter(n => !isNaN(n) && n > 0);
      assignedCompVal = cleanIds.length > 0 ? JSON.stringify(cleanIds) : 'all';
    } else if (typeof assigned_companies === 'string') {
      try {
        const p = JSON.parse(assigned_companies);
        if (Array.isArray(p)) {
          const cleanIds = p.map(Number).filter(n => !isNaN(n) && n > 0);
          assignedCompVal = cleanIds.length > 0 ? JSON.stringify(cleanIds) : 'all';
        } else {
          assignedCompVal = assigned_companies;
        }
      } catch (e) {
        const cleanIds = assigned_companies.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        assignedCompVal = cleanIds.length > 0 ? JSON.stringify(cleanIds) : 'all';
      }
    }
  }

  let createdSupportId = null;
  let createdUserId = null;
  const transaction = db.transaction(() => {
    const userRes = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, NULL, 'active')
    `).run(username.trim(), passHash, email, roleSupport.id);

    createdUserId = userRes.lastInsertRowid;

    const supportRes = db.prepare(`
      INSERT INTO support_users (user_id, full_name, permission_level, support_level, device_status, enable_ai_assistant, enable_audit_logs, assigned_companies)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(createdUserId, full_name.trim(), pLevel, sLevelStr, aiEnabled, auditLogsEnabled, assignedCompVal);

    createdSupportId = supportRes.lastInsertRowid;

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Support Management',
      action: 'SUPPORT_USER_CREATED',
      targetEntity: 'support_users',
      targetId: supportRes.lastInsertRowid,
      newValues: { username, full_name, permission_level: pLevel, support_level: sLevelStr, enable_audit_logs: auditLogsEnabled, assigned_companies: assignedCompVal },
      reason: 'Created new support team member'
    });
  });

  transaction();

  // Real-time sync to Firebase (Firestore & RTDB)
  try {
    syncUser({
      id: createdUserId,
      username: username.trim(),
      email,
      role_id: roleSupport.id,
      role_name: 'support',
      status: 'active',
      assigned_companies: assignedCompVal
    }).catch(() => {});

    syncSupportUser({
      id: createdSupportId,
      user_id: createdUserId,
      full_name: full_name.trim(),
      username: username.trim(),
      email,
      permission_level: pLevel,
      permissionLevel: pLevel,
      support_level: sLevelStr,
      supportLevel: sLevelStr,
      device_status: 'active',
      enable_ai_assistant: aiEnabled,
      enable_audit_logs: auditLogsEnabled,
      assigned_companies: assignedCompVal,
      status: 'active'
    }).catch(() => {});
  } catch (e) {}

  res.status(201).json({ success: true, supportId: createdSupportId, userId: createdUserId, supportLevel: sLevelStr, permissionLevel: pLevel, message: 'Support account created successfully.' });
});

// Update Support Account & Permission Level (Super Admin only)
router.put('/users/:id', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { username, full_name, email, permission_level, support_level, status, password, enable_ai_assistant, enable_audit_logs, assigned_companies } = req.body;

  const currentSupport = db.prepare(`
    SELECT u.*, s.id as support_id, s.permission_level, s.support_level, s.full_name, s.enable_ai_assistant, s.enable_audit_logs, s.assigned_companies
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

  let updatedUsername = (username && username.trim()) ? username.trim() : currentSupport.username;
  let updatedEmail = email !== undefined ? (email ? email.trim() : null) : currentSupport.email;
  let updatedStatus = status || currentSupport.status;
  let updatedName = (full_name && full_name.trim()) ? full_name.trim() : currentSupport.full_name;

  let pLevel = currentSupport.permission_level || 1;
  if (support_level !== undefined || permission_level !== undefined) {
    const rawLvl = support_level !== undefined ? support_level : permission_level;
    const digits = String(rawLvl).replace(/\D/g, '');
    pLevel = digits ? parseInt(digits, 10) : (typeof rawLvl === 'number' ? rawLvl : pLevel);
    pLevel = Math.min(Math.max(pLevel, 1), 4);
  }
  const sLevelStr = `Level ${pLevel}`;

  let aiEnabled = enable_ai_assistant !== undefined
    ? (enable_ai_assistant === true || enable_ai_assistant === 1 || enable_ai_assistant === 'true' ? 1 : 0)
    : (currentSupport.enable_ai_assistant || 0);

  let auditLogsEnabled = enable_audit_logs !== undefined
    ? (enable_audit_logs === true || enable_audit_logs === 1 || enable_audit_logs === 'true' ? 1 : 0)
    : (currentSupport.enable_audit_logs !== undefined ? (currentSupport.enable_audit_logs === 0 ? 0 : 1) : 1);

  let updatedAssignedComp = currentSupport.assigned_companies || 'all';
  if (assigned_companies !== undefined) {
    if (!assigned_companies || assigned_companies === 'all') {
      updatedAssignedComp = 'all';
    } else if (Array.isArray(assigned_companies)) {
      const cleanIds = assigned_companies.map(Number).filter(n => !isNaN(n) && n > 0);
      updatedAssignedComp = cleanIds.length > 0 ? JSON.stringify(cleanIds) : 'all';
    } else if (typeof assigned_companies === 'string') {
      try {
        const p = JSON.parse(assigned_companies);
        if (Array.isArray(p)) {
          const cleanIds = p.map(Number).filter(n => !isNaN(n) && n > 0);
          updatedAssignedComp = cleanIds.length > 0 ? JSON.stringify(cleanIds) : 'all';
        } else {
          updatedAssignedComp = assigned_companies;
        }
      } catch (e) {
        const cleanIds = assigned_companies.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        updatedAssignedComp = cleanIds.length > 0 ? JSON.stringify(cleanIds) : 'all';
      }
    }
  }

  const transaction = db.transaction(() => {
    // Update users table
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
    db.prepare(`
      UPDATE support_users SET
        full_name = ?,
        permission_level = ?,
        support_level = ?,
        enable_ai_assistant = ?,
        enable_audit_logs = ?,
        assigned_companies = ?
      WHERE user_id = ?
    `).run(updatedName, pLevel, sLevelStr, aiEnabled, auditLogsEnabled, updatedAssignedComp, userId);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Support Management',
      action: 'SUPPORT_USER_UPDATED',
      targetEntity: 'support_users',
      targetId: userId,
      oldValues: { username: currentSupport.username, full_name: currentSupport.full_name, permission_level: currentSupport.permission_level, support_level: currentSupport.support_level, status: currentSupport.status, enable_audit_logs: currentSupport.enable_audit_logs, assigned_companies: currentSupport.assigned_companies },
      newValues: { username: updatedUsername, full_name: updatedName, permission_level: pLevel, support_level: sLevelStr, status: updatedStatus, enable_audit_logs: auditLogsEnabled, assigned_companies: updatedAssignedComp },
      reason: 'Support user master attributes updated'
    });
  });

  transaction();

  // Realtime sync to Firebase (Firestore & RTDB)
  try {
    syncUser({
      id: userId,
      username: updatedUsername,
      email: updatedEmail,
      role_name: 'support',
      status: updatedStatus,
      assigned_companies: updatedAssignedComp
    }).catch(() => {});

    syncSupportUser({
      id: currentSupport.support_id || userId,
      user_id: userId,
      full_name: updatedName,
      username: updatedUsername,
      email: updatedEmail,
      permission_level: pLevel,
      permissionLevel: pLevel,
      support_level: sLevelStr,
      supportLevel: sLevelStr,
      enable_ai_assistant: aiEnabled,
      enable_audit_logs: auditLogsEnabled,
      assigned_companies: updatedAssignedComp,
      status: updatedStatus
    }).catch(() => {});
  } catch (e) {}

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

  // Clean up from Firebase
  try {
    const { deleteFromFirebase } = require('../services/firebase');
    if (deleteFromFirebase) {
      deleteFromFirebase('users', userId).catch(() => {});
    }
  } catch (e) {}

  res.json({ success: true, message: `Support account "${currentSupport.username}" deleted successfully.` });
});

// Deregister & Unbind Device (Support Level 1+ or Super Admin)
router.post('/unbind-device', verifyAuth, requireSupportLevel(1), (req, res) => {
  const targetUserId = req.body.user_id || req.body.userId || req.body.id;
  const reason = req.body.reason;

  if (!targetUserId) {
    return res.status(400).json({ error: 'Target user_id is required.' });
  }

  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const result = unbindUserDevice({
    userId: targetUserId,
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
    try {
      const { createNotification } = require('../services/notificationService');
      const targetU = db.prepare('SELECT company_id FROM users WHERE id = ?').get(targetUserId);
      createNotification({
        userId: targetUserId,
        companyId: targetU ? targetU.company_id : null,
        title: 'Device De-Registration Approved',
        message: 'Your device binding and MAC lock have been cleared by Support. You can now log in from your new device.',
        type: 'device',
        link: '/login'
      });
    } catch (e) {}
  } catch (e) {}

  // Auto-resolve any open device deregistration tickets for this employee
  try {
    const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(targetUserId);
    if (emp) {
      const openTickets = db.prepare(`
        SELECT id FROM service_requests 
        WHERE employee_id = ? AND request_type = 'device_change' AND status NOT IN ('resolved', 'closed')
      `).all(emp.id);

      for (const t of openTickets) {
        db.prepare(`
          UPDATE service_requests
          SET status = 'resolved',
              resolved_by = ?,
              resolution_notes = 'Device deregistered by Support Team. Employee can now log in and register their new device.',
              is_archived = 1,
              archived_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(req.user.id, t.id);

        try {
          db.prepare(`
            INSERT INTO service_request_messages (request_id, user_id, sender_name, sender_role, message)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            t.id, req.user.id, req.user.username, req.user.role_name,
            'Device deregistered by Support Team. Employee can now log in and bind their new device. Ticket marked as resolved.'
          );
        } catch (e) {}

        try {
          const { syncServiceRequest } = require('../services/firebase');
          const freshSr = db.prepare('SELECT * FROM service_requests WHERE id = ?').get(t.id);
          if (freshSr && syncServiceRequest) syncServiceRequest(freshSr).catch(() => {});
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('Auto-resolving device tickets notice:', e.message);
  }

  res.json({ success: true, message: result.message });
});

// View Registered Devices (Support Level 1+ or Super Admin)
router.get('/devices', verifyAuth, requireSupportLevel(1), (req, res) => {
  const { company_id, search } = req.query;

  let query = `
    SELECT d.*, u.username, u.company_id, e.employee_id as employee_code, e.full_name, c.name as company_name
    FROM employee_devices d
    JOIN users u ON d.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN employees e ON u.id = e.user_id
    LEFT JOIN companies c ON u.company_id = c.id
    WHERE 1=1 AND r.name NOT IN ('super_admin') AND u.role_id != 1
  `;
  const params = [];

  if (req.user.role_name === 'support') {
    const authComp = parseSupportAssignedCompanies(req.user);
    if (authComp !== 'all') {
      if (company_id && company_id !== 'all') {
        const cId = parseInt(company_id, 10);
        if (authComp.includes(cId)) {
          query += ' AND u.company_id = ?';
          params.push(cId);
        } else {
          return res.json({ devices: [] });
        }
      } else {
        query += ` AND u.company_id IN (${authComp.join(',')})`;
      }
    } else if (company_id && company_id !== 'all') {
      query += ' AND u.company_id = ?';
      params.push(parseInt(company_id, 10));
    }
  } else if (company_id && company_id !== 'all') {
    query += ' AND u.company_id = ?';
    params.push(parseInt(company_id, 10));
  }

  if (search) {
    query += ' AND (u.username LIKE ? OR e.full_name LIKE ? OR e.employee_id LIKE ? OR d.device_id LIKE ? OR d.mac_address LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY d.last_login_at DESC LIMIT 100';

  const devices = db.prepare(query).all(...params);
  res.json({ devices });
});

// Audit Logs & System Reports View (Support Level 1+ or Super Admin)
const handleGetAuditLogs = (req, res) => {
  if (req.user.role_name === 'support' && (req.user.enable_audit_logs === 0 || req.user.enable_audit_logs === false)) {
    return res.status(403).json({ error: 'Audit log access is disabled for your support account by Super Admin.' });
  }

  const { view = 'all', date, month, company_id, action, search, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT a.*, c.name as company_name
    FROM audit_logs a
    LEFT JOIN companies c ON a.company_id = c.id
    WHERE 1=1
  `;
  const params = [];

  // Automatic 1-day archival segregation
  // Today's auto-logs: logs created today
  // Archived logs: logs older than 1 day
  if (view === 'today') {
    query += " AND date(a.created_at) = date('now', 'localtime')";
  } else if (view === 'archived') {
    query += " AND date(a.created_at) < date('now', 'localtime')";
  }

  // Day-wise filter (exact date match YYYY-MM-DD)
  if (date) {
    query += " AND date(a.created_at) = date(?)";
    params.push(date);
  }

  // Month-wise filter (exact month match YYYY-MM)
  if (month) {
    query += " AND strftime('%Y-%m', a.created_at) = ?";
    params.push(month);
  }

  if (req.user.role_name === 'support') {
    query += " AND (a.role != 'super_admin' AND (a.panel IS NULL OR a.panel NOT LIKE '%Super Admin%'))";
    const authComp = parseSupportAssignedCompanies(req.user);
    if (authComp !== 'all') {
      if (company_id && company_id !== 'all') {
        const cId = parseInt(company_id, 10);
        if (authComp.includes(cId)) {
          query += ' AND a.company_id = ?';
          params.push(cId);
        } else {
          return res.json({ logs: [], total: 0, totalCount: 0, todayCount: 0, archivedCount: 0 });
        }
      } else {
        query += ` AND a.company_id IN (${authComp.join(',')})`;
      }
    } else if (company_id && company_id !== 'all') {
      query += ' AND a.company_id = ?';
      params.push(parseInt(company_id, 10));
    }
  } else if (company_id && company_id !== 'all') {
    query += ' AND a.company_id = ?';
    params.push(parseInt(company_id, 10));
  }

  if (action) {
    query += ' AND a.action = ?';
    params.push(action);
  }

  if (search) {
    query += ' AND (a.user_name LIKE ? OR a.reason LIKE ? OR a.target_id LIKE ? OR a.target_entity LIKE ? OR a.ip_address LIKE ? OR a.panel LIKE ? OR c.name LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term);
  }

  // Count matching current filter
  const countQuery = query.replace('SELECT a.*, c.name as company_name', 'SELECT COUNT(*) as count');
  const filteredCount = db.prepare(countQuery).get(...params)?.count || 0;

  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  const queryParams = [...params, parseInt(limit, 10), parseInt(offset, 10)];

  const logs = db.prepare(query).all(...queryParams);

  // Global metric counters
  const totalCount = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get()?.count || 0;
  const todayCount = db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE date(created_at) = date('now', 'localtime')").get()?.count || 0;
  const archivedCount = db.prepare("SELECT COUNT(*) as count FROM audit_logs WHERE date(created_at) < date('now', 'localtime')").get()?.count || 0;

  res.json({
    logs,
    total: totalCount,
    counts: {
      total: totalCount,
      today: todayCount,
      archived: archivedCount,
      filtered: filteredCount
    }
  });
};

router.get('/audit-logs', verifyAuth, requireSupportLevel(1), handleGetAuditLogs);
router.get('/audit-reports', verifyAuth, requireSupportLevel(1), handleGetAuditLogs);

// Delete Audit Logs (Level 4 Support or Super Admin only)
// Supports Day-wise, Month-wise, Filtered, and Single-row deletion
router.delete('/audit-logs', verifyAuth, requireSupportLevel(4), (req, res) => {
  if (req.user.role_name === 'support' && (req.user.enable_audit_logs === 0 || req.user.enable_audit_logs === false)) {
    return res.status(403).json({ error: 'Audit log access is disabled for your support account by Super Admin.' });
  }

  const payload = { ...(req.body || {}), ...(req.query || {}) };
  const { mode = 'single', id, date, month, company_id, action, search, view } = payload;

  let deleteSql = 'DELETE FROM audit_logs WHERE ';
  const params = [];
  let description = '';

  if (mode === 'single') {
    if (!id) {
      return res.status(400).json({ error: 'Audit log ID is required for single deletion.' });
    }
    deleteSql += 'id = ?';
    params.push(id);
    description = `Single audit record #${id}`;
  } else if (mode === 'day') {
    if (!date) {
      return res.status(400).json({ error: 'Target date (YYYY-MM-DD) is required for day-wise deletion.' });
    }
    deleteSql += 'date(created_at) = date(?)';
    params.push(date);
    description = `All audit logs for day ${date}`;
  } else if (mode === 'month') {
    if (!month) {
      return res.status(400).json({ error: 'Target month (YYYY-MM) is required for month-wise deletion.' });
    }
    deleteSql += "strftime('%Y-%m', created_at) = ?";
    params.push(month);
    description = `All audit logs for month ${month}`;
  } else if (mode === 'filtered') {
    const conditions = ['1=1'];
    if (view === 'today') {
      conditions.push("date(created_at) = date('now', 'localtime')");
    } else if (view === 'archived') {
      conditions.push("date(created_at) < date('now', 'localtime')");
    }
    if (date) {
      conditions.push("date(created_at) = date(?)");
      params.push(date);
    }
    if (month) {
      conditions.push("strftime('%Y-%m', created_at) = ?");
      params.push(month);
    }
    if (company_id) {
      conditions.push('company_id = ?');
      params.push(company_id);
    }
    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (search) {
      conditions.push('(user_name LIKE ? OR reason LIKE ? OR target_id LIKE ? OR target_entity LIKE ? OR ip_address LIKE ? OR panel LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }
    if (conditions.length === 1) {
      return res.status(400).json({ error: 'At least one filter condition required for filtered deletion.' });
    }
    deleteSql += conditions.join(' AND ');
    description = 'Audit logs matching active filters';
  } else if (mode === 'all') {
    deleteSql = 'DELETE FROM audit_logs';
    description = 'All audit records in system';
  } else {
    return res.status(400).json({ error: `Invalid deletion mode: ${mode}` });
  }

  try {
    const result = db.prepare(deleteSql).run(...params);
    const deletedCount = result.changes;

    logAudit({
      companyId: null,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Support L4 Audit Console',
      action: 'AUDIT_LOGS_DELETED',
      targetEntity: 'audit_logs',
      targetId: String(mode === 'single' ? id : mode),
      newValues: { mode, deletedCount, date, month },
      reason: `Deleted ${deletedCount} record(s): ${description} by Level 4 Support`
    });

    if (mode === 'single' && id) {
      try {
        const { deleteFromFirebase } = require('../services/firebase');
        deleteFromFirebase('audit_logs', id).catch(() => {});
      } catch (e) {}
    }

    res.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} audit log record(s) (${description}).`
    });
  } catch (err) {
    console.error('Failed to delete audit logs:', err.message);
    res.status(500).json({ error: `Failed to delete audit logs: ${err.message}` });
  }
});
router.delete('/audit-reports', verifyAuth, requireSupportLevel(4), (req, res, next) => {
  req.url = '/audit-logs';
  router.handle(req, res, next);
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
      AND r.name NOT IN ('super_admin')
      AND u.role_id != 1
      AND u.company_id IS NOT NULL
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

  if (req.user.role_name === 'support') {
    const authComp = parseSupportAssignedCompanies(req.user);
    if (authComp !== 'all') {
      if (company_id && company_id !== 'all') {
        const cId = parseInt(company_id, 10);
        if (authComp.includes(cId)) {
          query += ' AND u.company_id = ?';
          params.push(cId);
        } else {
          return res.json({ results: [] });
        }
      } else {
        query += ` AND u.company_id IN (${authComp.join(',')})`;
      }
    } else if (company_id && company_id !== 'all') {
      query += ' AND u.company_id = ?';
      params.push(parseInt(company_id, 10));
    }
  } else if (company_id && company_id !== 'all') {
    query += ' AND u.company_id = ?';
    params.push(parseInt(company_id, 10));
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
  if (targetUser.role_name === 'super_admin' || targetUser.role_id === 1) {
    return res.status(403).json({ error: 'Super Admin accounts cannot be modified by Support.' });
  }

  if (req.user.role_name === 'support' && !isCompanyAuthorized(req.user, targetUser.company_id)) {
    return res.status(403).json({ error: 'Access denied: Target user belongs to a company outside your assigned scope.' });
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

  if (req.user.role_name === 'support') {
    const authComp = parseSupportAssignedCompanies(req.user);
    if (authComp !== 'all') {
      compQuery += ` AND c.id IN (${authComp.join(',')})`;
    }
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

  if (req.user.role_name === 'support') {
    const authComp = parseSupportAssignedCompanies(req.user);
    if (authComp !== 'all') {
      userQuery += ` AND u.company_id IN (${authComp.join(',')})`;
    }
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
    WHERE u.id = ? AND u.is_deleted = 0 AND r.name NOT IN ('super_admin') AND u.role_id != 1
  `).get(userId);

  if (!user) {
    return res.status(404).json({ error: 'Target user not found or access restricted.' });
  }

  if (req.user.role_name === 'support' && !isCompanyAuthorized(req.user, user.company_id)) {
    return res.status(403).json({ error: 'Access denied: Target user belongs to a company outside your assigned scope.' });
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

  // Dispatch notification to user via real-time push
  try {
    createNotification({
      userId: user_id,
      companyId: targetUser.company_id,
      title: 'Online Support Remote Assist Active',
      message: `Support Engineer ${req.user.username} has initiated an Online Remote Assistance Session (Session PIN: ${sessionPin}) to diagnose and resolve your issue.`,
      type: 'system',
      link: '/support'
    });
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

    // Auto-resolve any open device deregistration tickets for this employee
    try {
      const openTickets = db.prepare(`
        SELECT id FROM service_requests 
        WHERE (employee_id = ? OR employee_id = (SELECT id FROM employees WHERE user_id = ?))
          AND request_type = 'device_change' AND status NOT IN ('resolved', 'closed')
      `).all(targetUser.employee_id || 0, user_id);

      for (const t of openTickets) {
        db.prepare(`
          UPDATE service_requests
          SET status = 'resolved',
              resolved_by = ?,
              resolution_notes = 'Device deregistered by Support Team. Employee can now log in and register their new device.',
              is_archived = 1,
              archived_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(req.user.id, t.id);

        try {
          db.prepare(`
            INSERT INTO service_request_messages (request_id, user_id, sender_name, sender_role, message)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            t.id, req.user.id, req.user.username, req.user.role_name,
            'Device deregistered by Support Team via Remote Control. Employee can now log in and bind their new device. Ticket marked as resolved.'
          );
        } catch (e) {}

        try {
          const { syncServiceRequest } = require('../services/firebase');
          const freshSr = db.prepare('SELECT * FROM service_requests WHERE id = ?').get(t.id);
          if (freshSr && syncServiceRequest) syncServiceRequest(freshSr).catch(() => {});
        } catch (e) {}
      }
    } catch (e) {}

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

    try {
      createNotification({
        userId: user_id,
        companyId: targetUser.company_id,
        title: 'Account Status Changed',
        message: `Your account status was remotely updated to "${newStatus.toUpperCase()}" by Technical Support.`,
        type: newStatus === 'active' ? 'success' : 'warning',
        link: '/profile'
      });
    } catch (e) {}

    return res.json({ success: true, newStatus, message: `Account status remotely set to ${newStatus}.` });
  }

  if (action === 'send_alert') {
    const title = payload.title || 'Technical Support Notice';
    const message = payload.message || 'Support Team is reviewing your account.';
    try {
      createNotification({
        userId: user_id,
        companyId: targetUser.company_id,
        title,
        message,
        type: 'warning',
        link: '/support'
      });
    } catch (e) {}

    return res.json({ success: true, message: 'Priority alert notification sent to user portal.' });
  }

  return res.status(400).json({ error: `Unknown remote action "${action}".` });
});

// Full Company Remote Data: Retrieve all company data (employees, managers, leaves, attendance, policies)
router.get('/remote/company/:companyId/full-data', verifyAuth, requireSupportLevel(2), (req, res) => {
  const companyId = parseInt(req.params.companyId, 10);
  if (!isCompanyAuthorized(req.user, companyId)) {
    return res.status(403).json({ error: 'Access denied: Company is outside your assigned support scope.' });
  }

  const company = db.prepare('SELECT id, name, code, portal_name, email, phone, status, logo, created_at FROM companies WHERE id = ? AND status != ?').get(companyId, 'deleted');
  if (!company) {
    return res.status(404).json({ error: 'Company not found.' });
  }

  const adminUser = db.prepare(`
    SELECT u.id, u.username, u.email, u.mobile, u.status, u.last_login_at
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.company_id = ? AND r.name = 'company_admin' AND u.is_deleted = 0
    LIMIT 1
  `).get(companyId) || null;

  const employees = db.prepare(`
    SELECT e.id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           e.mobile, e.email, e.status, e.manager_id, e.shift_id, e.geofence_id, e.reports_to_admin,
           u.id as user_id, u.username, u.status as user_status, u.last_login_at,
           r.name as role_name,
           s.name as shift_name,
           g.location_name as geofence_name,
           m.full_name as manager_name,
           d.id as device_id, d.mac_address, d.device_name, d.status as device_status
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    LEFT JOIN geofences g ON e.geofence_id = g.id
    LEFT JOIN employees m ON e.manager_id = m.id
    LEFT JOIN employee_devices d ON u.id = d.user_id AND d.status = 'bound'
    WHERE e.company_id = ? AND e.is_deleted = 0 AND u.is_deleted = 0
    ORDER BY (CASE WHEN r.name = 'manager' THEN 0 ELSE 1 END), e.full_name ASC
  `).all(companyId);

  const managers = employees.filter(e => e.role_name === 'manager');

  const leaveTypes = db.prepare(`
    SELECT id, name, default_yearly_quota, monthly_accrual_rate
    FROM leave_types
    WHERE company_id = ?
    ORDER BY name ASC
  `).all(companyId);

  const leaveRequests = db.prepare(`
    SELECT lr.id, lr.employee_id, lr.leave_type_id, lr.start_date, lr.end_date, lr.total_days,
           lr.reason, lr.status, lr.created_at,
           e.full_name as employee_name, e.employee_id as employee_code,
           lt.name as leave_type_name
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.company_id = ?
    ORDER BY lr.created_at DESC LIMIT 50
  `).all(companyId);

  const recentAttendance = db.prepare(`
    SELECT a.id, a.employee_id, a.date, a.punch_in_time, a.punch_out_time, a.status, a.total_hours,
           a.punch_in_location, a.punch_out_location,
           e.full_name as employee_name, e.employee_id as employee_code
    FROM attendance_records a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.company_id = ?
    ORDER BY a.date DESC, a.punch_in_time DESC LIMIT 50
  `).all(companyId);

  const shifts = db.prepare('SELECT id, name, start_time, end_time, working_hours, status FROM shifts WHERE company_id = ?').all(companyId);
  const geofences = db.prepare('SELECT id, location_name, latitude, longitude, radius, status FROM geofences WHERE company_id = ?').all(companyId);

  const correctionRequests = db.prepare(`
    SELECT cr.*, e.full_name as employee_name, e.employee_id as employee_code
    FROM attendance_correction_requests cr
    JOIN employees e ON cr.employee_id = e.id
    WHERE cr.company_id = ?
    ORDER BY cr.created_at DESC LIMIT 60
  `).all(companyId);

  let tickets = [];
  try {
    tickets = db.prepare(`
      SELECT sr.id, sr.employee_id, sr.request_type, sr.title, sr.description, sr.status, sr.created_at,
             e.full_name as employee_name, e.employee_id as employee_code
      FROM service_requests sr
      LEFT JOIN employees e ON sr.employee_id = e.id
      WHERE sr.company_id = ?
      ORDER BY sr.created_at DESC LIMIT 60
    `).all(companyId);
  } catch (e) {}

  res.json({
    success: true,
    company,
    adminUser,
    admin: adminUser,
    employees,
    managers,
    leaveTypes,
    leaveRequests,
    recentAttendance,
    attendanceLogs: recentAttendance,
    shifts,
    geofences,
    correctionRequests,
    tickets
  });
});

// Full Employee Remote Data: Retrieve complete profile, balances, leaves, attendance, and devices
router.get('/remote/employee/:employeeId/full-data', verifyAuth, requireSupportLevel(2), (req, res) => {
  const employeeId = parseInt(req.params.employeeId, 10);
  const emp = db.prepare(`
    SELECT e.*, u.id as user_id, u.username, u.email as user_email, u.mobile as user_mobile,
           u.status as user_status, u.last_login_at, r.name as role_name,
           c.name as company_name, c.code as company_code,
           s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end,
           g.location_name as geofence_name, g.latitude as geofence_lat, g.longitude as geofence_lng, g.radius as geofence_radius,
           m.full_name as manager_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    JOIN companies c ON e.company_id = c.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    LEFT JOIN geofences g ON e.geofence_id = g.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE e.id = ? AND e.is_deleted = 0
  `).get(employeeId);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Target employee belongs to an unauthorized company.' });
  }

  const currentYear = new Date().getFullYear();
  const leaveBalances = db.prepare(`
    SELECT lb.id, lb.leave_type_id, lb.year, lb.opening_balance, lb.accrued, lb.used, lb.balance,
           lt.name as leave_type_name, lt.default_yearly_quota, lt.monthly_accrual_rate
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    WHERE lb.employee_id = ? AND lb.year = ?
  `).all(employeeId, currentYear);

  const leaveRequests = db.prepare(`
    SELECT lr.id, lr.leave_type_id, lr.start_date, lr.end_date, lr.total_days, lr.reason, lr.status, lr.created_at,
           lt.name as leave_type_name
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.employee_id = ?
    ORDER BY lr.created_at DESC
  `).all(employeeId);

  const attendanceRecords = db.prepare(`
    SELECT id, date, punch_in_time, punch_out_time, status, total_hours, punch_in_location, punch_out_location, punch_in_area
    FROM attendance_records
    WHERE employee_id = ?
    ORDER BY date DESC LIMIT 45
  `).all(employeeId);

  const device = db.prepare(`
    SELECT * FROM employee_devices
    WHERE user_id = ?
    ORDER BY last_login_at DESC LIMIT 1
  `).get(emp.user_id) || null;

  const tickets = db.prepare(`
    SELECT id, request_type, title, description, status, created_at
    FROM service_requests
    WHERE employee_id = ?
    ORDER BY created_at DESC
  `).all(employeeId);

  const correctionRequests = db.prepare(`
    SELECT * FROM attendance_correction_requests
    WHERE employee_id = ?
    ORDER BY created_at DESC LIMIT 45
  `).all(employeeId);

  const assignedManager = emp.manager_id ? db.prepare('SELECT id, full_name, mobile, email, designation FROM employees WHERE id = ?').get(emp.manager_id) : null;

  res.json({
    success: true,
    employee: emp,
    currentBalances: leaveBalances,
    leaveBalances,
    leaveRequests,
    attendanceHistory: attendanceRecords,
    attendanceRecords,
    correctionRequests,
    device,
    tickets,
    assignedManager
  });
});

// Remote Apply Leave: Apply leave directly on behalf of any employee/manager upon request
router.post('/remote/leave/apply', verifyAuth, requireSupportLevel(2), (req, res) => {
  const { employee_id, leave_type_id, start_date, end_date, total_days, reason, auto_approve } = req.body;

  if (!employee_id || !leave_type_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'employee_id, leave_type_id, start_date, and end_date are required.' });
  }

  const emp = db.prepare('SELECT id, company_id, user_id, full_name, employee_id as employee_code FROM employees WHERE id = ?').get(employee_id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const lt = db.prepare('SELECT id, name FROM leave_types WHERE id = ? AND company_id = ?').get(leave_type_id, emp.company_id);
  if (!lt) return res.status(404).json({ error: 'Invalid leave type for this company.' });

  const days = parseFloat(total_days) || 1.0;
  const status = (auto_approve === false || auto_approve === 0 || auto_approve === 'false') ? 'pending' : 'approved';
  const finalReason = (reason && reason.trim()) ? reason.trim() : 'Applied via Support Team Remote Portal';

  const tx = db.transaction(() => {
    const ins = db.prepare(`
      INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      emp.company_id,
      emp.id,
      leave_type_id,
      start_date,
      end_date,
      days,
      finalReason,
      status,
      status === 'approved' ? req.user.id : null
    );

    const newReqId = ins.lastInsertRowid;
    const currentYear = new Date().getFullYear();

    if (status === 'approved') {
      const bal = db.prepare('SELECT id, used, balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(emp.id, leave_type_id, currentYear);
      if (bal) {
        db.prepare('UPDATE leave_balances SET used = used + ?, balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(days, days, bal.id);
      } else {
        db.prepare('INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance) VALUES (?, ?, ?, 0, 0, ?, ?)').run(emp.id, leave_type_id, currentYear, days, -days);
      }

      try {
        db.prepare(`
          INSERT INTO leave_transactions (employee_id, leave_type_id, leave_request_id, transaction_type, days, notes, created_by)
          VALUES (?, ?, ?, 'deduct', ?, ?, ?)
        `).run(emp.id, leave_type_id, newReqId, days, `Remotely approved leave: ${start_date} to ${end_date}`, req.user.id);
      } catch (e) {}
    }

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_LEAVE_APPLIED_BY_SUPPORT',
      targetEntity: 'leave_requests',
      targetId: newReqId,
      companyId: emp.company_id,
      newValues: { employee: emp.full_name, leaveType: lt.name, days, start_date, end_date, status },
      reason: `Leave remotely applied on behalf of ${emp.full_name} (${emp.employee_code}) upon request`
    });

    try {
      createNotification({
        userId: emp.user_id,
        companyId: emp.company_id,
        title: 'Leave Application Processed',
        message: `Your ${lt.name} request (${start_date} to ${end_date}, ${days} day(s)) has been processed by Technical Support: Status ${status.toUpperCase()}.`,
        type: status === 'approved' ? 'success' : 'info',
        link: '/leaves'
      });
    } catch (e) {}

    if (status === 'pending') {
      const notifyUserIds = new Set();
      if (emp.manager_id) {
        const mgrUser = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
        if (mgrUser && mgrUser.user_id) notifyUserIds.add(mgrUser.user_id);
      }
      try {
        const mappings = db.prepare('SELECT manager_id FROM employee_mappings WHERE employee_id = ?').all(emp.id);
        for (const m of mappings) {
          if (m.manager_id) {
            const u = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(m.manager_id);
            if (u && u.user_id) notifyUserIds.add(u.user_id);
          }
        }
      } catch (e) {}

      if (notifyUserIds.size === 0 || emp.reports_to_admin) {
        const admins = db.prepare(`
          SELECT u.id FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE u.company_id = ? AND r.name IN ('company_admin', 'admin')
        `).all(emp.company_id);
        for (const a of admins) {
          notifyUserIds.add(a.id);
        }
      }

      for (const uid of notifyUserIds) {
        try {
          createNotification({
            userId: uid,
            companyId: emp.company_id,
            title: 'Leave Request Pending Approval',
            message: `New ${lt.name} request (${days} days: ${start_date} to ${end_date}) submitted for ${emp.full_name} via Support on user request.`,
            type: 'info',
            link: '/leaves'
          });
        } catch (e) {}
      }
    }

    return newReqId;
  });

  const createdRequestId = tx();

  try {
    const freshReq = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(createdRequestId);
    if (freshReq) syncLeaveRequest(freshReq).catch(() => {});
    const currentYear = new Date().getFullYear();
    const freshBal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(emp.id, leave_type_id, currentYear);
    if (freshBal) syncLeaveBalance(freshBal).catch(() => {});
  } catch (e) {}

  res.json({
    success: true,
    requestId: createdRequestId,
    status,
    message: `Leave successfully applied for ${emp.full_name} (${days} days ${lt.name}) with status "${status}".`
  });
});

// Remote Update Leave Status (Approve / Reject)
router.put('/remote/leave/:id/status', verifyAuth, requireSupportLevel(2), (req, res) => {
  const reqId = parseInt(req.params.id, 10);
  const { status, review_notes } = req.body;

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved, rejected, or pending.' });
  }

  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(reqId);
  if (!lr) return res.status(404).json({ error: 'Leave request not found.' });

  if (!isCompanyAuthorized(req.user, lr.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const currentYear = new Date().getFullYear();
  const tx = db.transaction(() => {
    const oldStatus = lr.status;
    if (oldStatus === status) return;

    if (oldStatus !== 'approved' && status === 'approved') {
      const bal = db.prepare('SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(lr.employee_id, lr.leave_type_id, currentYear);
      if (bal) {
        db.prepare('UPDATE leave_balances SET used = used + ?, balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(lr.total_days, lr.total_days, bal.id);
      }
    } else if (oldStatus === 'approved' && status !== 'approved') {
      const bal = db.prepare('SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(lr.employee_id, lr.leave_type_id, currentYear);
      if (bal) {
        db.prepare('UPDATE leave_balances SET used = MAX(0, used - ?), balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(lr.total_days, lr.total_days, bal.id);
      }
    }

    db.prepare(`
      UPDATE leave_requests 
      SET status = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user.id, reqId);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_LEAVE_STATUS_UPDATED',
      targetEntity: 'leave_requests',
      targetId: reqId,
      companyId: lr.company_id,
      oldValues: { status: oldStatus },
      newValues: { status, notes: review_notes },
      reason: review_notes || `Leave status remotely updated to ${status} by Support`
    });
  });

  tx();

  try {
    const fresh = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(reqId);
    if (fresh) syncLeaveRequest(fresh).catch(() => {});
    const freshBal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(lr.employee_id, lr.leave_type_id, currentYear);
    if (freshBal) syncLeaveBalance(freshBal).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: `Leave request status updated to "${status}".` });
});

// Remote Delete Leave Request (Support deletion feature as requested)
router.delete('/remote/leave/:id', verifyAuth, requireSupportLevel(2), (req, res) => {
  const reqId = parseInt(req.params.id, 10);
  const lr = db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(reqId);
  if (!lr) return res.status(404).json({ error: 'Leave request not found.' });

  if (!isCompanyAuthorized(req.user, lr.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const currentYear = new Date().getFullYear();
  const tx = db.transaction(() => {
    if (lr.status === 'approved') {
      const bal = db.prepare('SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(lr.employee_id, lr.leave_type_id, currentYear);
      if (bal) {
        db.prepare('UPDATE leave_balances SET used = MAX(0, used - ?), balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(lr.total_days, lr.total_days, bal.id);
      }
    }

    try { db.prepare('DELETE FROM leave_transactions WHERE leave_request_id = ?').run(reqId); } catch (e) {}
    db.prepare('DELETE FROM leave_requests WHERE id = ?').run(reqId);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_LEAVE_DELETED_BY_SUPPORT',
      targetEntity: 'leave_requests',
      targetId: reqId,
      companyId: lr.company_id,
      oldValues: { total_days: lr.total_days, start_date: lr.start_date, end_date: lr.end_date, status: lr.status },
      reason: 'Leave request deleted by Support Team as per user/admin request'
    });
  });

  tx();

  try {
    deleteFromFirebase('leave_requests', reqId).catch(() => {});
    const freshBal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(lr.employee_id, lr.leave_type_id, currentYear);
    if (freshBal) syncLeaveBalance(freshBal).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: 'Leave request has been permanently deleted as requested.' });
});

// Remote Adjust Leave Balance (Credit / Deduct / Set)
router.post('/remote/leave/adjust-balance', verifyAuth, requireSupportLevel(2), (req, res) => {
  const { employee_id, leave_type_id, action_type, days, reason } = req.body;
  if (!employee_id || !leave_type_id || !action_type) {
    return res.status(400).json({ error: 'employee_id, leave_type_id, and action_type are required.' });
  }

  const emp = db.prepare('SELECT id, company_id, full_name FROM employees WHERE id = ?').get(employee_id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const numDays = parseFloat(days) || 0;
  const currentYear = new Date().getFullYear();

  const tx = db.transaction(() => {
    let bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(emp.id, leave_type_id, currentYear);
    if (!bal) {
      db.prepare('INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance) VALUES (?, ?, ?, 0, 0, 0, 0)').run(emp.id, leave_type_id, currentYear);
      bal = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(emp.id, leave_type_id, currentYear);
    }

    let newBalance = bal.balance;
    let newOpening = bal.opening_balance;
    let newUsed = bal.used;

    if (action_type === 'credit') {
      newOpening = newOpening + numDays;
      newBalance = newBalance + numDays;
    } else if (action_type === 'deduct') {
      newUsed = newUsed + numDays;
      newBalance = Math.max(0, newBalance - numDays);
    } else if (action_type === 'set') {
      newOpening = numDays;
      newBalance = numDays;
      newUsed = 0;
    }

    db.prepare('UPDATE leave_balances SET opening_balance = ?, used = ?, balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newOpening, newUsed, newBalance, bal.id);

    try {
      db.prepare(`
        INSERT INTO leave_transactions (employee_id, leave_type_id, transaction_type, days, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(emp.id, leave_type_id, action_type === 'credit' ? 'credit' : 'deduct', numDays, reason || 'Support Remote Balance Adjustment', req.user.id);
    } catch (e) {}

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_LEAVE_BALANCE_ADJUSTED',
      targetEntity: 'leave_balances',
      targetId: bal.id,
      companyId: emp.company_id,
      oldValues: { balance: bal.balance, opening_balance: bal.opening_balance },
      newValues: { balance: newBalance, opening_balance: newOpening, action_type, days: numDays },
      reason: reason || 'Leave balance adjusted remotely by Support Team'
    });

    return bal.id;
  });

  const balId = tx();

  try {
    const freshBal = db.prepare('SELECT * FROM leave_balances WHERE id = ?').get(balId);
    if (freshBal) syncLeaveBalance(freshBal).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: `Leave balance updated successfully (${action_type}: ${numDays} days).` });
});

// Remote Add / Edit Attendance Punch
router.post('/remote/attendance/record', verifyAuth, requireSupportLevel(2), (req, res) => {
  const { employee_id, date, punch_in_time, punch_out_time, status, total_hours, location_name, reason } = req.body;
  if (!employee_id || !date) {
    return res.status(400).json({ error: 'employee_id and date are required.' });
  }

  const emp = db.prepare('SELECT id, company_id, full_name, employee_id as employee_code FROM employees WHERE id = ?').get(employee_id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const pIn = punch_in_time || null;
  const pOut = punch_out_time || null;
  const attStatus = status || 'Present';
  const hours = parseFloat(total_hours) || (pIn && pOut ? 8.5 : 0.0);
  const loc = location_name || 'Marked Remotely by Technical Support';

  const existing = db.prepare('SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?').get(emp.id, date);
  let recordId;

  if (existing) {
    db.prepare(`
      UPDATE attendance_records
      SET punch_in_time = COALESCE(?, punch_in_time),
          punch_out_time = COALESCE(?, punch_out_time),
          status = ?,
          total_hours = ?,
          punch_in_location = COALESCE(punch_in_location, ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(pIn, pOut, attStatus, hours, loc, existing.id);
    recordId = existing.id;
  } else {
    const ins = db.prepare(`
      INSERT INTO attendance_records (company_id, employee_id, date, punch_in_time, punch_out_time, status, total_hours, punch_in_location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(emp.company_id, emp.id, date, pIn, pOut, attStatus, hours, loc);
    recordId = ins.lastInsertRowid;
  }

  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Level 4 Remote Access Console',
    action: 'REMOTE_ATTENDANCE_RECORDED',
    targetEntity: 'attendance_records',
    targetId: recordId,
    companyId: emp.company_id,
    newValues: { employee: emp.full_name, date, status: attStatus, punch_in: pIn, punch_out: pOut },
    reason: reason || 'Attendance punch recorded/corrected remotely by Support Team'
  });

  try {
    const freshAtt = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recordId);
    if (freshAtt) syncAttendancePunch(freshAtt).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: `Attendance for "${emp.full_name}" on ${date} saved as "${attStatus}".` });
});

// Remote Delete Attendance Record
router.delete('/remote/attendance/:id', verifyAuth, requireSupportLevel(2), (req, res) => {
  const attId = parseInt(req.params.id, 10);
  const att = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(attId);
  if (!att) return res.status(404).json({ error: 'Attendance record not found.' });

  if (!isCompanyAuthorized(req.user, att.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  db.prepare('DELETE FROM attendance_records WHERE id = ?').run(attId);

  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Level 4 Remote Access Console',
    action: 'REMOTE_ATTENDANCE_DELETED',
    targetEntity: 'attendance_records',
    targetId: attId,
    companyId: att.company_id,
    oldValues: { employee_id: att.employee_id, date: att.date, status: att.status },
    reason: 'Attendance record deleted remotely by Support Team as per request'
  });

  try {
    deleteFromFirebase('attendance_records', attId, { companyId: att.company_id, employeeId: att.employee_id, date: att.date }).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: 'Attendance record permanently removed as requested.' });
});

// Remote Submit Attendance Correction on behalf of Employee
router.post('/remote/attendance-correction/submit', verifyAuth, requireSupportLevel(2), (req, res) => {
  const { employee_id, date, punch_in_time, punch_out_time, requested_status, correction_type, reason, auto_approve } = req.body;
  if (!employee_id || !date || !reason) {
    return res.status(400).json({ error: 'employee_id, date, and mandatory audit reason are required.' });
  }

  const emp = db.prepare('SELECT id, company_id, user_id, full_name, employee_id as employee_code, manager_id, reports_to_admin FROM employees WHERE id = ?').get(employee_id);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const currentAtt = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?').get(emp.id, date);
  const currentStatus = currentAtt?.status || 'Absent';
  const currentIn = currentAtt?.punch_in_time || null;
  const currentOut = currentAtt?.punch_out_time || null;

  const mode = correction_type || 'both';
  const reqIn = (mode === 'out') ? currentIn : (punch_in_time || currentIn);
  const reqOut = (mode === 'in') ? currentOut : (punch_out_time || currentOut);
  const finalStatus = requested_status || (reqIn ? 'Present' : currentStatus);

  if (auto_approve) {
    // Directly apply to attendance_records
    let totalHours = 8.5;
    if (reqIn && reqOut) {
      const [h1, m1, s1 = 0] = reqIn.split(':').map(Number);
      const [h2, m2, s2 = 0] = reqOut.split(':').map(Number);
      const diffSec = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
      if (diffSec > 0) totalHours = Math.round((diffSec / 3600) * 100) / 100;
    }

    let recId;
    if (currentAtt) {
      db.prepare(`
        UPDATE attendance_records
        SET punch_in_time = ?, punch_out_time = ?, status = ?, total_hours = ?, is_edited = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reqIn, reqOut, finalStatus, totalHours, currentAtt.id);
      recId = currentAtt.id;
    } else {
      const ins = db.prepare(`
        INSERT INTO attendance_records (company_id, employee_id, date, punch_in_time, punch_out_time, status, total_hours, is_edited)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(emp.company_id, emp.id, date, reqIn, reqOut, finalStatus, totalHours);
      recId = ins.lastInsertRowid;
    }

    // Insert approved correction request record
    db.prepare(`
      INSERT INTO attendance_correction_requests (
        company_id, employee_id, date, current_status, current_punch_in, current_punch_out,
        requested_punch_in, requested_punch_out, requested_status, reason, status, correction_type,
        reviewed_by, review_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, 'Directly approved by Support')
    `).run(
      emp.company_id, emp.id, date, currentStatus, currentIn, currentOut,
      reqIn, reqOut, finalStatus, reason.trim(), mode, req.user.id
    );

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_ATTENDANCE_CORRECTION_AUTO_APPROVED',
      targetEntity: 'attendance_records',
      targetId: recId,
      companyId: emp.company_id,
      newValues: { employee: emp.full_name, date, status: finalStatus, punch_in: reqIn, punch_out: reqOut },
      reason: `Attendance correction directly approved by Support for ${emp.full_name}: ${reason}`
    });

    try {
      const freshAtt = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recId);
      if (freshAtt) syncAttendancePunch(freshAtt).catch(() => {});
    } catch (e) {}

    return res.json({ success: true, message: `Attendance correction directly applied and approved for ${emp.full_name} on ${date}.` });
  } else {
    // Send to assigned mapping rule (Manager/Admin) for approval
    const crIns = db.prepare(`
      INSERT INTO attendance_correction_requests (
        company_id, employee_id, date, current_status, current_punch_in, current_punch_out,
        requested_punch_in, requested_punch_out, requested_status, reason, status, correction_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      emp.company_id, emp.id, date, currentStatus, currentIn, currentOut,
      reqIn, reqOut, finalStatus, reason.trim(), mode
    );

    const notifyUserIds = new Set();
    if (emp.manager_id) {
      const mgrUser = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
      if (mgrUser && mgrUser.user_id) notifyUserIds.add(mgrUser.user_id);
    }
    try {
      const mappings = db.prepare('SELECT manager_id FROM employee_mappings WHERE employee_id = ?').all(emp.id);
      for (const m of mappings) {
        if (m.manager_id) {
          const u = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(m.manager_id);
          if (u && u.user_id) notifyUserIds.add(u.user_id);
        }
      }
    } catch (e) {}

    if (notifyUserIds.size === 0 || emp.reports_to_admin) {
      const admins = db.prepare(`
        SELECT u.id FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.company_id = ? AND r.name IN ('company_admin', 'admin')
      `).all(emp.company_id);
      for (const a of admins) {
        notifyUserIds.add(a.id);
      }
    }

    for (const uid of notifyUserIds) {
      try {
        createNotification({
          userId: uid,
          companyId: emp.company_id,
          title: 'Attendance Correction Submitted for Review',
          message: `Attendance correction for ${emp.full_name} (${date}) has been submitted via Support Team and is pending your supervisor approval.`,
          type: 'info',
          link: '/attendance'
        });
      } catch (e) {}
    }

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_ATTENDANCE_CORRECTION_SUBMITTED_TO_MAPPING',
      targetEntity: 'attendance_correction_requests',
      targetId: crIns.lastInsertRowid,
      companyId: emp.company_id,
      newValues: { employee: emp.full_name, date, requestedStatus: finalStatus, reason },
      reason: `Correction submitted on behalf of ${emp.full_name} routed to assigned supervisor mapping for approval`
    });

    return res.json({ success: true, message: `Attendance correction for ${emp.full_name} on ${date} submitted and routed to assigned supervisor for approval.` });
  }
});

// Remote Review Attendance Correction Request (Approve / Reject)
router.put('/remote/attendance-correction/:id/review', verifyAuth, requireSupportLevel(2), (req, res) => {
  const crId = parseInt(req.params.id, 10);
  const { status, review_notes } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected.' });
  }

  const cr = db.prepare('SELECT * FROM attendance_correction_requests WHERE id = ?').get(crId);
  if (!cr) return res.status(404).json({ error: 'Correction request not found.' });

  if (!isCompanyAuthorized(req.user, cr.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE attendance_correction_requests
      SET status = ?, reviewed_by = ?, review_notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user.id, review_notes || 'Reviewed by Support Authority', crId);

    if (status === 'approved') {
      const pIn = cr.requested_punch_in || null;
      const pOut = cr.requested_punch_out || null;
      let hours = 8.5;
      if (pIn && pOut) {
        const [h1, m1, s1 = 0] = pIn.split(':').map(Number);
        const [h2, m2, s2 = 0] = pOut.split(':').map(Number);
        const diffSec = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
        if (diffSec > 0) hours = Math.round((diffSec / 3600) * 100) / 100;
      }
      const finalStatus = cr.requested_status || 'Present';

      const existing = db.prepare('SELECT id FROM attendance_records WHERE employee_id = ? AND date = ?').get(cr.employee_id, cr.date);
      let recordId;
      if (existing) {
        db.prepare(`
          UPDATE attendance_records
          SET punch_in_time = ?, punch_out_time = ?, status = ?, total_hours = ?, is_edited = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(pIn, pOut, finalStatus, hours, existing.id);
        recordId = existing.id;
      } else {
        const ins = db.prepare(`
          INSERT INTO attendance_records (company_id, employee_id, date, punch_in_time, punch_out_time, status, total_hours, is_edited)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(cr.company_id, cr.employee_id, cr.date, pIn, pOut, finalStatus, hours);
        recordId = ins.lastInsertRowid;
      }

      try {
        const freshAtt = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(recordId);
        if (freshAtt) syncAttendancePunch(freshAtt).catch(() => {});
      } catch (e) {}
    }

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: `REMOTE_CORRECTION_${status.toUpperCase()}`,
      targetEntity: 'attendance_correction_requests',
      targetId: crId,
      companyId: cr.company_id,
      newValues: { status, review_notes },
      reason: review_notes || `Attendance correction request #${crId} ${status} by Support Authority`
    });
  });

  tx();
  res.json({ success: true, message: `Correction request #${crId} ${status} successfully.` });
});

// Remote Permanently Delete Attendance Correction Request
router.delete('/remote/attendance-correction/:id', verifyAuth, requireSupportLevel(2), (req, res) => {
  const crId = parseInt(req.params.id, 10);
  const cr = db.prepare('SELECT * FROM attendance_correction_requests WHERE id = ?').get(crId);
  if (!cr) return res.status(404).json({ error: 'Correction request not found.' });

  if (!isCompanyAuthorized(req.user, cr.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  db.prepare('DELETE FROM attendance_correction_requests WHERE id = ?').run(crId);

  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Level 4 Remote Access Console',
    action: 'REMOTE_CORRECTION_DELETED',
    targetEntity: 'attendance_correction_requests',
    targetId: crId,
    companyId: cr.company_id,
    reason: 'Attendance correction request permanently deleted by Support Team as per request'
  });

  try {
    deleteFromFirebase('attendance_correction_requests', crId).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: 'Attendance correction request permanently removed.' });
});

// Remote Update Personnel Profile
router.put('/remote/employee/:id/profile', verifyAuth, requireSupportLevel(2), (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  const { full_name, mobile, email, department, designation, shift_id, geofence_id, status } = req.body;

  const fName = full_name !== undefined ? full_name.trim() : emp.full_name;
  const fMobile = mobile !== undefined ? mobile.trim() : emp.mobile;
  const fEmail = email !== undefined ? email.trim() : emp.email;
  const fDept = department !== undefined ? department.trim() : emp.department;
  const fDesig = designation !== undefined ? designation.trim() : emp.designation;
  const fShift = shift_id !== undefined ? (shift_id ? parseInt(shift_id, 10) : null) : emp.shift_id;
  const fGeo = geofence_id !== undefined ? (geofence_id ? parseInt(geofence_id, 10) : null) : emp.geofence_id;
  const fStatus = status !== undefined ? status : emp.status;

  db.prepare(`
    UPDATE employees
    SET full_name = ?, mobile = ?, email = ?, department = ?, designation = ?, shift_id = ?, geofence_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(fName, fMobile, fEmail, fDept, fDesig, fShift, fGeo, fStatus, employeeId);

  if (emp.user_id) {
    db.prepare('UPDATE users SET email = ?, mobile = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(fEmail, fMobile, fStatus, emp.user_id);
  }

  logAudit({
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Level 4 Remote Access Console',
    action: 'REMOTE_EMPLOYEE_PROFILE_UPDATED',
    targetEntity: 'employees',
    targetId: employeeId,
    companyId: emp.company_id,
    newValues: { full_name: fName, mobile: fMobile, email: fEmail, department: fDept, designation: fDesig, status: fStatus },
    reason: 'Employee profile remotely updated by Support Team upon user/admin request'
  });

  try {
    const updatedEmp = db.prepare('SELECT e.*, u.username, c.name as company_name FROM employees e JOIN users u ON e.user_id = u.id JOIN companies c ON e.company_id = c.id WHERE e.id = ?').get(employeeId);
    if (updatedEmp) syncEmployee(updatedEmp).catch(() => {});
    const updatedUser = db.prepare('SELECT u.*, r.name as role_name, c.name as company_name FROM users u JOIN roles r ON u.role_id = r.id JOIN companies c ON u.company_id = c.id WHERE u.id = ?').get(emp.user_id);
    if (updatedUser) syncUser(updatedUser).catch(() => {});
  } catch (e) {}

  res.json({ success: true, message: `Personnel profile for "${fName}" updated successfully.` });
});

// Remote Permanent Delete Employee (with permanent tombstone registration)
router.delete('/remote/employee/:id', verifyAuth, requireSupportLevel(2), async (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const emp = db.prepare(`
    SELECT e.*, u.username, r.name as role_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.id = ?
  `).get(employeeId);

  if (!emp) return res.status(404).json({ error: 'Employee not found.' });

  if (!isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Company outside assigned scope.' });
  }

  if (emp.role_name === 'company_admin' || emp.role_name === 'super_admin') {
    return res.status(403).json({ error: 'Administrator accounts cannot be deleted here.' });
  }

  const tx = db.transaction(() => {
    try {
      const insTombstone = db.prepare('INSERT OR IGNORE INTO purged_tombstones (entity_type, entity_id, company_id, code, identifier) VALUES (?, ?, ?, ?, ?)');
      insTombstone.run('employee', String(employeeId), String(emp.company_id), emp.employee_id || '', emp.full_name || '');
      if (emp.user_id) {
        insTombstone.run('user', String(emp.user_id), String(emp.company_id), '', emp.username || '');
      }
    } catch (e) {}

    try { db.prepare('DELETE FROM attendance_records WHERE employee_id = ?').run(employeeId); } catch (e) {}
    try { db.prepare('DELETE FROM leave_requests WHERE employee_id = ?').run(employeeId); } catch (e) {}
    try { db.prepare('DELETE FROM leave_balances WHERE employee_id = ?').run(employeeId); } catch (e) {}
    try { db.prepare('DELETE FROM employee_mappings WHERE employee_id = ? OR manager_id = ?').run(employeeId, employeeId); } catch (e) {}
    if (emp.user_id) {
      try { db.prepare('DELETE FROM employee_devices WHERE user_id = ?').run(emp.user_id); } catch (e) {}
      db.prepare('DELETE FROM users WHERE id = ?').run(emp.user_id);
    }
    db.prepare('DELETE FROM employees WHERE id = ?').run(employeeId);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Level 4 Remote Access Console',
      action: 'REMOTE_EMPLOYEE_DELETED_BY_SUPPORT',
      targetEntity: 'employees',
      targetId: employeeId,
      companyId: emp.company_id,
      oldValues: { full_name: emp.full_name, employee_code: emp.employee_id },
      reason: 'Employee permanently deleted via Remote Control as requested by Company Admin'
    });
  });

  tx();

  await deleteFromFirebase('employees', employeeId, {
    companyId: emp.company_id,
    userId: emp.user_id,
    employeeCode: emp.employee_id,
    username: emp.username
  });

  res.json({ success: true, message: `Account for "${emp.full_name}" permanently deleted with zero recovery.` });
});

// --- SUSPENDED ACCOUNTS SEARCH & ACTIVATION HUB ---

// Search & List Suspended Accounts (by Name, Username, Email, Phone, or Code)
router.get('/suspended-accounts', verifyAuth, requireRole(['support', 'super_admin']), (req, res) => {
  const { search, company_id } = req.query;

  let query = `
    SELECT e.id as employee_id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           COALESCE(e.email, u.email, '') as email,
           COALESCE(e.mobile, u.mobile, '') as mobile,
           e.status as employee_status,
           u.id as user_id, u.username, u.status as user_status, u.last_login_at,
           c.id as company_id, c.name as company_name, c.code as company_code
    FROM employees e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN companies c ON e.company_id = c.id
    WHERE e.is_deleted = 0 AND u.is_deleted = 0 AND u.role_id != 1
      AND (
        e.status IN ('suspended', 'disabled', 'inactive') OR
        u.status IN ('suspended', 'disabled', 'inactive')
      )
  `;
  const params = [];

  if (req.user.role_name === 'support') {
    const authComp = parseSupportAssignedCompanies(req.user);
    if (authComp !== 'all') {
      if (company_id && company_id !== 'all') {
        const cId = parseInt(company_id, 10);
        if (authComp.includes(cId)) {
          query += ' AND e.company_id = ?';
          params.push(cId);
        } else {
          return res.json({ accounts: [] });
        }
      } else {
        query += ` AND e.company_id IN (${authComp.join(',')})`;
      }
    } else if (company_id && company_id !== 'all') {
      query += ' AND e.company_id = ?';
      params.push(parseInt(company_id, 10));
    }
  } else if (company_id && company_id !== 'all') {
    query += ' AND e.company_id = ?';
    params.push(parseInt(company_id, 10));
  }

  if (search && search.trim()) {
    const sTerm = `%${search.trim()}%`;
    query += ` AND (
      e.full_name LIKE ? OR
      u.username LIKE ? OR
      e.email LIKE ? OR
      u.email LIKE ? OR
      e.mobile LIKE ? OR
      u.mobile LIKE ? OR
      e.employee_id LIKE ?
    )`;
    params.push(sTerm, sTerm, sTerm, sTerm, sTerm, sTerm, sTerm);
  }

  query += ' ORDER BY e.updated_at DESC, e.id DESC LIMIT 100';

  const accounts = db.prepare(query).all(...params);
  res.json({ accounts });
});

// Enable / Activate Suspended Account (Support Team or Super Admin)
router.post('/enable-account/:id', verifyAuth, requireRole(['support', 'super_admin']), (req, res) => {
  const id = parseInt(req.params.id, 10);

  // Look up employee row first, or user row
  let emp = db.prepare(`
    SELECT e.*, u.id as user_id, u.username, u.email as user_email, u.mobile as user_mobile, u.status as user_status
    FROM employees e
    JOIN users u ON e.user_id = u.id
    WHERE e.id = ? AND e.is_deleted = 0
  `).get(id);

  if (!emp) {
    emp = db.prepare(`
      SELECT e.*, u.id as user_id, u.username, u.email as user_email, u.mobile as user_mobile, u.status as user_status
      FROM users u
      LEFT JOIN employees e ON u.id = e.user_id
      WHERE u.id = ? AND u.is_deleted = 0
    `).get(id);
  }

  if (!emp) {
    return res.status(404).json({ error: 'Account not found.' });
  }

  // Prevent modifying super_admin accounts
  const userRole = db.prepare('SELECT r.name FROM roles r JOIN users u ON u.role_id = r.id WHERE u.id = ?').get(emp.user_id);
  if (userRole && userRole.name === 'super_admin') {
    return res.status(403).json({ error: 'Super Admin accounts cannot be modified.' });
  }

  if (req.user.role_name === 'support' && !isCompanyAuthorized(req.user, emp.company_id)) {
    return res.status(403).json({ error: 'Access denied: Target account belongs to a company outside your assigned scope.' });
  }

  const transaction = db.transaction(() => {
    // 1. Activate employee record
    if (emp.id) {
      db.prepare("UPDATE employees SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(emp.id);
    }
    // 2. Activate user login account
    db.prepare("UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(emp.user_id);

    // 3. Log Audit
    logAudit({
      companyId: emp.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Support Account Enablement Hub',
      action: 'SUSPENDED_ACCOUNT_ENABLED',
      targetEntity: 'employees',
      targetId: emp.id || emp.user_id,
      oldValues: { employee_status: emp.status, user_status: emp.user_status },
      newValues: { status: 'active' },
      reason: `Suspended account restored and enabled by Support Team (${req.user.username})`
    });
  });

  transaction();

  // 4. Sync with Firebase (Realtime DB and Firestore)
  try {
    const { syncEmployee, realtimeDb, firestoreDb } = require('../services/firebase');
    if (syncEmployee && emp.id) {
      const freshEmp = db.prepare('SELECT * FROM employees WHERE id = ?').get(emp.id);
      if (freshEmp) syncEmployee(freshEmp).catch(() => {});
    }
    if (realtimeDb) {
      realtimeDb.ref(`users/${emp.user_id}/status`).set('active').catch(() => {});
      if (emp.id) realtimeDb.ref(`employees/${emp.id}/status`).set('active').catch(() => {});
    }
    if (firestoreDb) {
      firestoreDb.collection('users').doc(String(emp.user_id)).set({ status: 'active' }, { merge: true }).catch(() => {});
      if (emp.id) firestoreDb.collection('employees').doc(String(emp.id)).set({ status: 'active' }, { merge: true }).catch(() => {});
    }
  } catch (e) {
    console.warn('Firebase sync note on enable account:', e.message);
  }

  res.json({
    success: true,
    message: `Account for "${emp.full_name || emp.username}" has been successfully enabled and restored to Active.`,
    account: {
      employee_id: emp.id,
      user_id: emp.user_id,
      status: 'active'
    }
  });
});

// Permanent Delete Ticket History via Support endpoint (Level 4 Support or Super Admin)
router.delete('/tickets/:id', verifyAuth, requireSupportLevel(4), (req, res) => {
  const reqId = parseInt(req.params.id, 10);

  const ticket = db.prepare('SELECT * FROM service_requests WHERE id = ?').get(reqId);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM service_request_messages WHERE request_id = ?').run(reqId);
    db.prepare('DELETE FROM service_requests WHERE id = ?').run(reqId);
    try { db.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(reqId); } catch (e) {}
    try { db.prepare('DELETE FROM support_tickets WHERE id = ?').run(reqId); } catch (e) {}

    logAudit({
      companyId: ticket.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Support L4 Operations Hub',
      action: 'TICKET_PERMANENTLY_DELETED',
      targetEntity: 'service_requests',
      targetId: reqId,
      oldValues: { title: ticket.title, request_type: ticket.request_type },
      reason: `Permanent deletion of ticket #${reqId} and history by Level 4 Support`
    });
  });

  transaction();

  try {
    const { deleteFromFirebase, realtimeDb } = require('../services/firebase');
    if (deleteFromFirebase) {
      deleteFromFirebase('service_requests', reqId).catch(() => {});
      deleteFromFirebase('support_tickets', reqId).catch(() => {});
    }
    if (realtimeDb) {
      realtimeDb.ref(`service_requests/${reqId}`).remove().catch(() => {});
      realtimeDb.ref(`service_request_messages/${reqId}`).remove().catch(() => {});
      realtimeDb.ref(`support_tickets/${reqId}`).remove().catch(() => {});
      realtimeDb.ref(`ticket_messages/${reqId}`).remove().catch(() => {});
    }
  } catch (e) {}

  res.json({
    success: true,
    message: `Ticket #${reqId} and its complete history have been permanently deleted from the database and all user accounts.`
  });
});

module.exports = router;

