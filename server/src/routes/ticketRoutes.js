const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { getTenantCompanyId } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');
const { unbindUserDevice } = require('../services/deviceBinding');

// Helper to auto-archive resolved/old tickets based on company retention setting (default 1 day)
function autoArchiveExpiredRequests(companyId) {
  try {
    const settings = db.prepare('SELECT auto_archive_days FROM company_settings WHERE company_id = ?').get(companyId);
    const days = settings && settings.auto_archive_days !== undefined ? settings.auto_archive_days : 1;

    // Archive resolved/closed requests older than configured days
    db.prepare(`
      UPDATE service_requests
      SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
      WHERE company_id = ? 
        AND is_archived = 0
        AND status IN ('resolved', 'closed')
        AND datetime(updated_at, '+' || ? || ' days') <= datetime('now')
    `).run(companyId, days);
  } catch (err) {
    console.error('Error auto-archiving service requests:', err.message);
  }
}

// Auto-migration: ensure assigned_role and assigned_to columns exist
try {
  const tableInfo = db.prepare('PRAGMA table_info(service_requests)').all();
  const colNames = tableInfo.map(c => c.name);
  if (!colNames.includes('assigned_role')) {
    db.exec("ALTER TABLE service_requests ADD COLUMN assigned_role TEXT DEFAULT 'manager'");
  }
  if (!colNames.includes('assigned_to')) {
    db.exec("ALTER TABLE service_requests ADD COLUMN assigned_to INTEGER");
  }
} catch (e) {
  console.warn('Migration note for service_requests:', e.message);
}

// Create Service Request / Ticket (Employee)
router.post('/service-request', verifyAuth, (req, res) => {
  const {
    request_type, title, description,
    punch_date, suggested_punch_in, suggested_punch_out
  } = req.body;

  if (!request_type || !title) {
    return res.status(400).json({ error: 'Request type and title are required.' });
  }

  const employeeId = req.user.role_name === 'employee' ? req.user.employee_id : req.body.employee_id;
  const companyId = req.user.company_id || req.body.company_id;

  if (!employeeId || !companyId) {
    return res.status(400).json({ error: 'Employee and company identification required.' });
  }

  // User Rule: All employee helpdesk complaints/issues are routed DIRECTLY to the Support Team.
  // Do NOT assign to Manager or Company Admin.
  const assignedRole = 'support';
  const assignedTo = null;
  const emp = db.prepare('SELECT full_name, manager_id FROM employees WHERE id = ?').get(employeeId);

  const result = db.prepare(`
    INSERT INTO service_requests (
      company_id, employee_id, request_type, title, description,
      punch_date, suggested_punch_in, suggested_punch_out, status,
      assigned_role, assigned_to
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    companyId, employeeId, request_type, title.trim(), description || null,
    punch_date || null, suggested_punch_in || null, suggested_punch_out || null,
    assignedRole, assignedTo
  );

  const reqId = result.lastInsertRowid;

  // Insert initial creation message into ticket conversation thread
  try {
    db.prepare(`
      INSERT INTO service_request_messages (request_id, user_id, sender_name, sender_role, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(reqId, req.user.id, emp?.full_name || req.user.username, req.user.role_name, `Ticket created: "${title.trim()}". Directly routed to Technical Support Team for resolution.`);
  } catch (e) {}

  // Send notification directly to Technical Support Team and Super Admins
  try {
    const supportUsers = db.prepare(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name IN ('support', 'super_admin')
    `).all();
    for (const su of supportUsers) {
      db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type, link)
        VALUES (?, ?, 'New Support Ticket', ?, 'ticket', '/support')
      `).run(su.id, companyId, `${emp?.full_name || 'Employee'} submitted support ticket #${reqId}: "${title.trim()}" (${request_type})`);
    }
  } catch (e) {}

  res.status(201).json({ success: true, requestId: reqId, assigned_role: assignedRole, message: 'Service ticket submitted directly to Technical Support Team.' });
});

// List Service Requests with automatic 1-day archival filter
router.get('/service-requests', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);

  // Trigger automatic archival of older resolved requests
  if (companyId) {
    autoArchiveExpiredRequests(companyId);
  }

  const { view = 'active', type, status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT sr.*, e.employee_id as employee_code, e.full_name as employee_name, e.department,
           c.name as company_name, c.code as company_code,
           u.username as resolver_name,
           COALESCE(usr.username, e.full_name, 'Employee') as created_by_username
    FROM service_requests sr
    JOIN employees e ON sr.employee_id = e.id
    LEFT JOIN users usr ON e.user_id = usr.id
    LEFT JOIN companies c ON sr.company_id = c.id
    LEFT JOIN users u ON sr.resolved_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (companyId) {
    query += ' AND sr.company_id = ?';
    params.push(companyId);
  }

  // If view is 'active', hide archived records (auto-archived after 1 day)
  if (view === 'active') {
    query += ' AND sr.is_archived = 0';
  } else if (view === 'archived') {
    query += ' AND sr.is_archived = 1';
  }

  // If scope is explicitly 'own' or for specific employee
  if (req.query.scope === 'own') {
    query += ' AND sr.employee_id = ?';
    params.push(req.user.employee_id);
  } else if (req.user.role_name === 'manager' || req.query.scope === 'team' || req.query.scope === 'reporting') {
    if (req.user.role_name === 'manager') {
      query += ` AND (
        e.manager_id = ? 
        OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?)
        OR (sr.assigned_role = 'manager' AND (sr.assigned_to = ? OR sr.assigned_to IS NULL))
      )`;
      params.push(req.user.employee_id, req.user.employee_id, req.user.id);
    }
  } else if (req.user.role_name === 'support') {
    if (req.query.scope === 'support' || !req.query.scope) {
      query += " AND (sr.assigned_role = 'support' OR sr.assigned_role IS NULL)";
    }
  }

  if (req.query.assigned_role) {
    query += ' AND sr.assigned_role = ?';
    params.push(req.query.assigned_role);
  }

  if (type) {
    query += ' AND sr.request_type = ?';
    params.push(type);
  }

  if (status && status !== 'all') {
    query += ' AND sr.status = ?';
    params.push(status);
  }

  query += ' ORDER BY sr.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const requests = db.prepare(query).all(...params);
  res.json({ requests });
});

// Assign Service Request (Manager to Admin/Support, or Admin to Support/Manager)
router.put('/service-requests/:id/assign', verifyAuth, (req, res) => {
  const reqId = parseInt(req.params.id, 10);
  const { target_role, target_user_id, notes } = req.body; // 'admin' | 'support' | 'manager'

  if (!['admin', 'support', 'manager'].includes(target_role)) {
    return res.status(400).json({ error: 'Target role must be admin, support, or manager.' });
  }

  const ticket = db.prepare(`
    SELECT sr.*, e.full_name as employee_name, e.user_id as emp_user_id
    FROM service_requests sr
    JOIN employees e ON sr.employee_id = e.id
    WHERE sr.id = ?
  `).get(reqId);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  // Authorization check
  if (req.user.role_name !== 'super_admin' && req.user.role_name !== 'support') {
    if (ticket.company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
  }

  const senderName = getSenderDisplayName(req.user);
  const targetLabel = target_role === 'admin' ? 'Company Admin' : target_role === 'support' ? 'Support Panel' : 'Reporting Manager';

  const transaction = db.transaction(() => {
    // 1. Update assignment in service_requests
    db.prepare(`
      UPDATE service_requests SET
        assigned_role = ?,
        assigned_to = ?,
        status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(target_role, target_user_id || null, reqId);

    // 2. Insert system transfer chat message
    const sysMsg = `Ticket assigned to ${targetLabel} by ${senderName}${notes ? ' (Note: ' + notes + ')' : ''}.`;
    db.prepare(`
      INSERT INTO service_request_messages (request_id, user_id, sender_name, sender_role, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(reqId, req.user.id, 'System', 'system', sysMsg);

    // 3. Notifications
    try {
      if (target_role === 'admin') {
        const adminUser = db.prepare('SELECT id FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = "company_admin") LIMIT 1').get(ticket.company_id);
        if (adminUser) {
          db.prepare(`
            INSERT INTO notifications (user_id, company_id, title, message, type, link)
            VALUES (?, ?, 'Ticket Assigned to Admin', ?, 'ticket', '/service-requests')
          `).run(adminUser.id, ticket.company_id, `Ticket #${reqId} was escalated/assigned to Admin by ${senderName}.`);
        }
      } else if (target_role === 'support') {
        const supUsers = db.prepare('SELECT user_id FROM support_users').all();
        supUsers.forEach(su => {
          db.prepare(`
            INSERT INTO notifications (user_id, company_id, title, message, type, link)
            VALUES (?, ?, 'New Support Ticket Assigned', ?, 'ticket', '/support-tickets')
          `).run(su.user_id, ticket.company_id, `Ticket #${reqId} from company was assigned to Support.`);
        });
      }
    } catch (e) {}

    logAudit({
      companyId: ticket.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Service Request Assignment',
      action: 'SERVICE_REQUEST_ASSIGNED',
      targetEntity: 'service_requests',
      targetId: reqId,
      newValues: { assigned_role: target_role, assigned_to: target_user_id },
      reason: `Assigned to ${target_role} by ${senderName}`
    });
  });

  transaction();

  res.json({
    success: true,
    message: `Ticket #${reqId} successfully assigned to ${targetLabel}.`,
    assigned_role: target_role
  });
});

// Resolve / Close Service Request (Manager, HR, Admin, Support)
router.put('/service-requests/:id/resolve', verifyAuth, (req, res) => {
  const reqId = parseInt(req.params.id, 10);
  const { status, resolution_notes } = req.body; // 'resolved' or 'closed'

  if (!['resolved', 'closed', 'in_progress'].includes(status)) {
    return res.status(400).json({ error: 'Status must be in_progress, resolved, or closed.' });
  }

  const current = db.prepare(`
    SELECT sr.*, e.user_id, e.full_name
    FROM service_requests sr
    JOIN employees e ON sr.employee_id = e.id
    WHERE sr.id = ?
  `).get(reqId);

  if (!current) {
    return res.status(404).json({ error: 'Request not found.' });
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE service_requests SET
        status = ?,
        resolved_by = ?,
        resolution_notes = COALESCE(?, resolution_notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user.id, resolution_notes, reqId);

    // If resolving a missing punch request, optionally correct attendance
    if (status === 'resolved' && current.request_type === 'missing_punch' && current.punch_date) {
      if (current.suggested_punch_in || current.suggested_punch_out) {
        db.prepare(`
          INSERT INTO attendance_records (
            company_id, employee_id, date, punch_in_time, punch_out_time, status, remarks, is_edited
          ) VALUES (?, ?, ?, ?, ?, 'Present', ?, 1)
          ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
            punch_in_time = COALESCE(excluded.punch_in_time, punch_in_time),
            punch_out_time = COALESCE(excluded.punch_out_time, punch_out_time),
            status = 'Present',
            remarks = excluded.remarks,
            is_edited = 1,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          current.company_id, current.employee_id, current.punch_date,
          current.suggested_punch_in || null, current.suggested_punch_out || null,
          `Approved Missing Punch Ticket #${reqId}`
        );
      }
    }

    // Notify employee
    db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, link)
      VALUES (?, ?, ?, ?, 'ticket', '/service-requests')
    `).run(
      current.user_id,
      current.company_id,
      `Service Ticket #${reqId} ${status.toUpperCase()}`,
      `Your ticket "${current.title}" has been marked as ${status}.${resolution_notes ? ' Notes: ' + resolution_notes : ''}`
    );

    // If resolving a device deregistration / device_change request or unbind_device flag is provided, deregister device lock
    let unbindMessage = null;
    if ((status === 'resolved' || status === 'closed') && (current.request_type === 'device_change' || req.body.unbind_device)) {
      if (current.user_id) {
        try {
          const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
          const unbindResult = unbindUserDevice({
            userId: current.user_id,
            authorizedUserId: req.user.id,
            authorizerName: req.user.username,
            authorizerRole: req.user.role_name,
            reason: resolution_notes || 'Device deregistration request resolved by Support Team',
            ipAddress
          });
          if (unbindResult && unbindResult.message) {
            unbindMessage = unbindResult.message;
          }
        } catch (e) {
          console.error('Failed to unbind device on ticket resolution:', e.message);
        }
      }
    }

    // Insert resolution chat message
    try {
      db.prepare(`
        INSERT INTO service_request_messages (request_id, user_id, sender_name, sender_role, message)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        reqId,
        req.user.id,
        req.user.username,
        req.user.role_name,
        `Ticket marked as ${status}.${resolution_notes ? ' Notes: ' + resolution_notes : ''}${unbindMessage ? ' [' + unbindMessage + ']' : ''}`
      );
    } catch(e) {}

    logAudit({
      companyId: current.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Service Request Management',
      action: 'SERVICE_REQUEST_RESOLVED',
      targetEntity: 'service_requests',
      targetId: reqId,
      newValues: { status, resolution_notes, device_deregistered: Boolean(unbindMessage) },
      reason: `Ticket resolved by ${req.user.username}`
    });
  });

  transaction();
  res.json({ success: true, message: `Ticket marked as ${status}.` });
});

// Ensure service_request_messages table exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_request_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sr_messages_req ON service_request_messages(request_id, created_at);
  `);
} catch (e) {
  console.warn('Note on table creation:', e.message);
}

// Helper to get friendly sender display name
function getSenderDisplayName(user) {
  if (user.role_name === 'super_admin') return 'Super Administrator';
  if (user.role_name === 'support') {
    const s = db.prepare('SELECT full_name, permission_level FROM support_users WHERE user_id = ?').get(user.id);
    return s ? `${s.full_name} (Support L${s.permission_level})` : `Support (${user.username})`;
  }
  const emp = db.prepare('SELECT full_name, designation FROM employees WHERE user_id = ?').get(user.id);
  if (emp) return emp.full_name;
  return user.username;
}

// Get Ticket Chat Thread (All Messages for Ticket ID)
router.get('/service-requests/:id/messages', verifyAuth, (req, res) => {
  const reqId = parseInt(req.params.id, 10);

  const ticket = db.prepare(`
    SELECT sr.*, e.employee_id as employee_code, e.full_name as employee_name, e.department, e.designation,
           c.name as company_name, c.code as company_code,
           u.username as resolver_name
    FROM service_requests sr
    JOIN employees e ON sr.employee_id = e.id
    LEFT JOIN companies c ON sr.company_id = c.id
    LEFT JOIN users u ON sr.resolved_by = u.id
    WHERE sr.id = ?
  `).get(reqId);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  // Authorization check
  const role = req.user.role_name;
  if (role !== 'super_admin' && role !== 'support') {
    if (ticket.company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'Access denied to tickets of other companies.' });
    }
    if (role === 'employee' && req.user.employee_id !== ticket.employee_id) {
      return res.status(403).json({ error: 'Access denied to other employee tickets.' });
    }
  }

  const messages = db.prepare(`
    SELECT id, request_id, user_id, sender_name, sender_role, message, created_at
    FROM service_request_messages
    WHERE request_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(reqId);

  res.json({ ticket, messages });
});

// Post Reply Message to Ticket Chat (Chat format resolution)
router.post('/service-requests/:id/messages', verifyAuth, (req, res) => {
  const reqId = parseInt(req.params.id, 10);
  const { message, status } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const ticket = db.prepare(`
    SELECT sr.*, e.user_id as emp_user_id, e.full_name as employee_name
    FROM service_requests sr
    JOIN employees e ON sr.employee_id = e.id
    WHERE sr.id = ?
  `).get(reqId);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  // Authorization check
  const role = req.user.role_name;
  if (role !== 'super_admin' && role !== 'support') {
    if (ticket.company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (role === 'employee' && req.user.employee_id !== ticket.employee_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
  }

  // Resolved / Closed check: Employees cannot reply to or reopen resolved/closed tickets
  if (role === 'employee' && (ticket.status === 'closed' || ticket.status === 'resolved')) {
    return res.status(403).json({
      error: 'This ticket has been marked as resolved or closed and cannot be reopened. Please create a new ticket if you require further assistance.'
    });
  }

  const senderName = getSenderDisplayName(req.user);

  const transaction = db.transaction(() => {
    // 1. Insert message
    const msgRes = db.prepare(`
      INSERT INTO service_request_messages (request_id, user_id, sender_name, sender_role, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(reqId, req.user.id, senderName, role, message.trim());

    let finalStatus = ticket.status;

    // 2. If status change requested
    if (status && ['pending', 'in_progress', 'resolved', 'closed'].includes(status)) {
      finalStatus = status;
      db.prepare(`
        UPDATE service_requests SET
          status = ?,
          resolved_by = CASE WHEN ? IN ('resolved', 'closed') THEN ? ELSE resolved_by END,
          resolution_notes = CASE WHEN ? IN ('resolved', 'closed') THEN ? ELSE resolution_notes END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, status, req.user.id, status, message.trim(), reqId);

      // Attendance adjustment on resolve
      if (status === 'resolved' && ticket.request_type === 'missing_punch' && ticket.punch_date) {
        if (ticket.suggested_punch_in || ticket.suggested_punch_out) {
          db.prepare(`
            INSERT INTO attendance_records (
              company_id, employee_id, date, punch_in_time, punch_out_time, status, remarks, is_edited
            ) VALUES (?, ?, ?, ?, ?, 'Present', ?, 1)
            ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
              punch_in_time = COALESCE(excluded.punch_in_time, punch_in_time),
              punch_out_time = COALESCE(excluded.punch_out_time, punch_out_time),
              status = 'Present',
              remarks = excluded.remarks,
              is_edited = 1,
              updated_at = CURRENT_TIMESTAMP
          `).run(
            ticket.company_id, ticket.employee_id, ticket.punch_date,
            ticket.suggested_punch_in || null, ticket.suggested_punch_out || null,
            `Approved via Chat on Ticket #${reqId}`
          );
        }
      }
    } else if (ticket.status === 'pending' && (role === 'support' || role === 'manager' || role === 'company_admin')) {
      // Automatically switch from pending to in_progress when support/admin replies
      finalStatus = 'in_progress';
      db.prepare("UPDATE service_requests SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(reqId);
    }

    // 3. Notification dispatch
    if (role === 'employee') {
      try {
        db.prepare(`
          INSERT INTO notifications (user_id, company_id, title, message, type, link)
          VALUES (
            (SELECT id FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin') LIMIT 1),
            ?, 'New Reply on Ticket #' || ?, ?, 'ticket', '/service-requests'
          )
        `).run(ticket.company_id, ticket.company_id, reqId, `${senderName} replied: "${message.trim().slice(0, 50)}..."`);
      } catch (e) {}
    } else {
      try {
        db.prepare(`
          INSERT INTO notifications (user_id, company_id, title, message, type, link)
          VALUES (?, ?, 'Update on Ticket #' || ?, ?, 'ticket', '/service-requests')
        `).run(ticket.emp_user_id, ticket.company_id, reqId, `${senderName} replied: "${message.trim().slice(0, 50)}..."`);
      } catch (e) {}
    }

    logAudit({
      companyId: ticket.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role,
      panel: 'Service Request Chat',
      action: 'SERVICE_REQUEST_CHAT_REPLY',
      targetEntity: 'service_requests',
      targetId: reqId,
      newValues: { message: message.trim(), status: finalStatus },
      reason: `Message sent on ticket #${reqId}`
    });

    return {
      messageId: msgRes.lastInsertRowid,
      finalStatus
    };
  });

  const outcome = transaction();
  res.status(201).json({
    success: true,
    messageId: outcome.messageId,
    message: 'Reply sent successfully.',
    chatMessage: {
      id: outcome.messageId,
      request_id: reqId,
      user_id: req.user.id,
      sender_name: senderName,
      sender_role: role,
      message: message.trim(),
      created_at: new Date().toISOString()
    },
    status: outcome.finalStatus
  });
});

module.exports = router;
