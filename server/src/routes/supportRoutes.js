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

