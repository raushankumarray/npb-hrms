const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, getTenantCompanyId } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');

// List Holidays
router.get('/', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { year } = req.query;

  let query = 'SELECT * FROM holidays WHERE company_id = ?';
  const params = [companyId];

  if (year) {
    query += ' AND holiday_date LIKE ?';
    params.push(`${year}-%`);
  }

  query += ' ORDER BY holiday_date ASC';
  const holidays = db.prepare(query).all(...params);

  res.json({ holidays });
});

// Add Holiday
router.post('/', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { name, holiday_date, date, is_optional, applies_to } = req.body;
  const finalDate = holiday_date || date;

  if (!name || !finalDate) {
    return res.status(400).json({ error: 'Holiday Name and Date (YYYY-MM-DD) are required.' });
  }

  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO holidays (company_id, name, holiday_date, is_optional, applies_to)
      VALUES (?, ?, ?, ?, ?)
    `).run(companyId, name.trim(), finalDate, is_optional ? 1 : 0, applies_to || 'all');

    // Auto mark attendance as 'Holiday' for all active employees if mandatory
    if (!is_optional && applies_to !== 'selected') {
      const employees = db.prepare("SELECT id FROM employees WHERE company_id = ? AND is_deleted = 0 AND status = 'active'").all(companyId);
      const upsertAtt = db.prepare(`
        INSERT INTO attendance_records (company_id, employee_id, date, status, remarks)
        VALUES (?, ?, ?, 'Holiday', ?)
        ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
          status = 'Holiday',
          remarks = excluded.remarks
      `);

      employees.forEach(e => {
        upsertAtt.run(companyId, e.id, finalDate, `Public Holiday: ${name.trim()}`);
      });
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Holiday Management',
      action: 'HOLIDAY_ADDED',
      targetEntity: 'holidays',
      targetId: result.lastInsertRowid,
      newValues: { name, holiday_date, is_optional },
      reason: 'Added official company holiday'
    });

    return result.lastInsertRowid;
  });

  const holidayId = transaction();

  // Send notification to employees
  try {
    const allUsers = db.prepare('SELECT user_id FROM employees WHERE company_id = ? AND is_deleted = 0').all(companyId);
    const notifStmt = db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, is_read)
      VALUES (?, ?, ?, ?, 'system', 0)
    `);
    const title = is_optional ? `Optional Holiday: ${name.trim()}` : `Public Holiday Declared: ${name.trim()}`;
    const msg = is_optional
      ? `Optional/Restricted Holiday "${name.trim()}" on ${holiday_date} has been added.`
      : `Official Public Holiday "${name.trim()}" on ${holiday_date} has been declared.`;
    allUsers.forEach(u => notifStmt.run(u.user_id, companyId, title, msg));
  } catch (e) {}

  res.status(201).json({ success: true, holidayId, message: 'Holiday added and calendar updated successfully.' });
});

// Edit Holiday
router.put('/:id', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const holidayId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);
  const { name, holiday_date, date, is_optional, applies_to } = req.body;
  const finalDate = holiday_date || date;

  const existing = db.prepare('SELECT * FROM holidays WHERE id = ? AND company_id = ?').get(holidayId, companyId);
  if (!existing) {
    return res.status(404).json({ error: 'Holiday not found.' });
  }

  db.prepare(`
    UPDATE holidays SET
      name = ?,
      holiday_date = ?,
      is_optional = ?,
      applies_to = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).run(
    name ? name.trim() : existing.name,
    finalDate || existing.holiday_date,
    is_optional !== undefined ? (is_optional ? 1 : 0) : existing.is_optional,
    applies_to || existing.applies_to,
    holidayId,
    companyId
  );

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Holiday Management',
    action: 'HOLIDAY_UPDATED',
    targetEntity: 'holidays',
    targetId: holidayId,
    newValues: { name, holiday_date, is_optional },
    reason: `Updated holiday "${name || existing.name}"`
  });

  res.json({ success: true, message: `Holiday "${name || existing.name}" updated successfully.` });
});

// Delete Holiday
router.delete('/:id', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const holidayId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);

  db.prepare('DELETE FROM holidays WHERE id = ? AND company_id = ?').run(holidayId, companyId);
  res.json({ success: true, message: 'Holiday removed successfully.' });
});

module.exports = router;
