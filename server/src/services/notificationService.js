const db = require('../db');
const { syncNotification } = require('./firebase');

// Active SSE client connections: userId -> Set of express res objects
const sseClients = new Map();

/**
 * Register an active SSE response stream for a user
 */
function addSseClient(userId, res) {
  const uid = Number(userId);
  if (!sseClients.has(uid)) {
    sseClients.set(uid, new Set());
  }
  sseClients.get(uid).add(res);
}

/**
 * Unregister an SSE response stream
 */
function removeSseClient(userId, res) {
  const uid = Number(userId);
  if (sseClients.has(uid)) {
    sseClients.get(uid).delete(res);
    if (sseClients.get(uid).size === 0) {
      sseClients.delete(uid);
    }
  }
}

/**
 * Push notification event directly to user's open browser tabs via SSE
 */
function broadcastSse(userId, notification) {
  const uid = Number(userId);
  const clients = sseClients.get(uid);
  if (clients && clients.size > 0) {
    const payload = `data: ${JSON.stringify(notification)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch (err) {
        clients.delete(res);
      }
    }
  }
}

/**
 * Create a notification in SQLite, sync to Firebase (Firestore & RTDB),
 * and push instantly via SSE to active browser/phone tabs.
 */
function createNotification({ userId, companyId = null, title, message, type = 'info', link = null }) {
  if (!userId) return null;
  const uid = Number(userId);

  try {
    const stmt = db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(uid, companyId, title, message, type, link);
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);

    if (row) {
      // 1. Instant push via Server-Sent Events to open browser tabs / phone
      broadcastSse(uid, row);

      // 2. Real-time dual sync to Firebase
      try {
        if (syncNotification) {
          syncNotification(row).catch(() => {});
        }
      } catch (e) {}

      return row;
    }
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
  return null;
}

/**
 * Send notification to multiple users
 */
function notifyUsers(userIds, notificationData) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(userIds.map(id => Number(id)).filter(id => !isNaN(id) && id > 0)));
  const results = [];
  for (const uid of uniqueIds) {
    const notif = createNotification({ ...notificationData, userId: uid });
    if (notif) results.push(notif);
  }
  return results;
}

/**
 * Notify all Company Admins of a specific company
 */
function notifyCompanyAdmins(companyId, notificationData) {
  if (!companyId) return [];
  try {
    const admins = db.prepare(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.company_id = ? 
        AND r.name IN ('company_admin', 'admin')
        AND u.is_deleted = 0 AND u.status = 'active'
    `).all(companyId);
    return notifyUsers(admins.map(a => a.id), { ...notificationData, companyId });
  } catch (err) {
    console.error('Error in notifyCompanyAdmins:', err.message);
    return [];
  }
}

/**
 * Notify Super Admins
 */
function notifySuperAdmins(notificationData) {
  try {
    const superAdmins = db.prepare(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name = 'super_admin'
        AND u.is_deleted = 0 AND u.status = 'active'
    `).all();
    return notifyUsers(superAdmins.map(sa => sa.id), notificationData);
  } catch (err) {
    console.error('Error in notifySuperAdmins:', err.message);
    return [];
  }
}

/**
 * Notify Support Desk & Super Admins
 */
function notifySupportTeam(notificationData) {
  try {
    const supportUsers = db.prepare(`
      SELECT u.id FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE r.name IN ('support', 'super_admin')
        AND u.is_deleted = 0 AND u.status = 'active'
    `).all();
    return notifyUsers(supportUsers.map(su => su.id), notificationData);
  } catch (err) {
    console.error('Error in notifySupportTeam:', err.message);
    return [];
  }
}

/**
 * Notify reporting manager of an employee
 */
function notifyEmployeeManager(employeeId, notificationData) {
  if (!employeeId) return [];
  try {
    // Check direct manager_id in employees table
    const emp = db.prepare('SELECT manager_id, company_id FROM employees WHERE id = ?').get(employeeId);
    if (!emp) return [];

    let managerUserId = null;
    if (emp.manager_id) {
      const mgrEmp = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
      if (mgrEmp) managerUserId = mgrEmp.user_id;
    }

    // Check employee_mappings table if direct not found
    if (!managerUserId) {
      const mapping = db.prepare('SELECT manager_id FROM employee_mappings WHERE employee_id = ?').get(employeeId);
      if (mapping && mapping.manager_id) {
        const mgrEmp = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(mapping.manager_id);
        if (mgrEmp) managerUserId = mgrEmp.user_id;
      }
    }

    if (managerUserId) {
      return notifyUsers([managerUserId], { ...notificationData, companyId: emp.company_id });
    }
  } catch (err) {
    console.error('Error in notifyEmployeeManager:', err.message);
  }
  return [];
}

module.exports = {
  addSseClient,
  removeSseClient,
  broadcastSse,
  createNotification,
  notifyUsers,
  notifyCompanyAdmins,
  notifySuperAdmins,
  notifySupportTeam,
  notifyEmployeeManager
};
