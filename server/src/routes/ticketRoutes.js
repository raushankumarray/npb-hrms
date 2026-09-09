const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { getTenantCompanyId } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');

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

  const result = db.prepare(`
    INSERT INTO service_requests (
      company_id, employee_id, request_type, title, description,
      punch_date, suggested_punch_in, suggested_punch_out, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    companyId, employeeId, request_type, title.trim(), description || null,
    punch_date || null, suggested_punch_in || null, suggested_punch_out || null
  );

  const reqId = result.lastInsertRowid;

  // Send notification to HR / Manager
  const emp = db.prepare('SELECT full_name, manager_id FROM employees WHERE id = ?').get(employeeId);
  if (emp && emp.manager_id) {
    const mgr = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
    if (mgr) {
      db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type, link)
        VALUES (?, ?, 'New Service Ticket', ?, 'ticket', '/service-requests')
      `).run(mgr.user_id, companyId, `${emp.full_name} submitted ticket: "${title.trim()}" (${request_type})`);
    }
  }

  res.status(201).json({ success: true, requestId: reqId, message: 'Service ticket submitted successfully.' });
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
           u.username as resolver_name
    FROM service_requests sr
    JOIN employees e ON sr.employee_id = e.id
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

  // Employee sees own tickets
  if (req.user.role_name === 'employee') {
    query += ' AND sr.employee_id = ?';
    params.push(req.user.employee_id);
  } else if (req.user.role_name === 'manager') {
    query += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
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

    logAudit({
      companyId: current.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Service Request Management',
      action: 'SERVICE_REQUEST_RESOLVED',
      targetEntity: 'service_requests',
      targetId: reqId,
      newValues: { status, resolution_notes },
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
