const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, getTenantCompanyId } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');

// List Shifts, Employee Assignments & Weekly Offs for Company
router.get('/', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);

  const shifts = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM employees e WHERE e.shift_id = s.id AND e.is_deleted = 0 AND e.status = 'active') as assigned_employees_count
    FROM shifts s
    WHERE s.company_id = ?
    ORDER BY s.id ASC
  `).all(companyId);

  const rotationalShifts = db.prepare('SELECT * FROM rotational_shifts WHERE company_id = ? ORDER BY id ASC').all(companyId);

  const weeklyOffs = db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM employees e WHERE e.weekly_off_id = w.id AND e.is_deleted = 0 AND e.status = 'active') as assigned_employees_count
    FROM weekly_off_settings w
    WHERE w.company_id = ?
    ORDER BY w.is_default DESC, w.id ASC
  `).all(companyId);

  const employees = db.prepare(`
    SELECT e.id, e.user_id, e.employee_id, e.full_name, e.department, e.designation, e.city, e.reports_to_admin,
           r.name as role_name,
           e.manager_id, m.full_name as manager_name,
           e.hr_id, h.full_name as hr_name,
           e.shift_id, s.name as current_shift_name, s.name as shift_name, s.start_time as shift_start_time, s.end_time as shift_end_time, s.grace_time_mins as shift_grace_mins,
           sa.effective_from as shift_effective_date, sa.effective_from,
           e.weekly_off_id, w.name as weekly_off_name, w.off_days_json as weekly_off_days, w.is_default as weekly_off_is_default
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN employees m ON e.manager_id = m.id
    LEFT JOIN employees h ON e.hr_id = h.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    LEFT JOIN weekly_off_settings w ON w.id = COALESCE(e.weekly_off_id, (SELECT id FROM weekly_off_settings WHERE company_id = e.company_id AND is_default = 1))
    LEFT JOIN (
      SELECT employee_id, shift_id, effective_from
      FROM shift_assignments
      WHERE id IN (SELECT MAX(id) FROM shift_assignments GROUP BY employee_id)
    ) sa ON e.id = sa.employee_id
    WHERE e.company_id = ? AND e.is_deleted = 0 AND e.status = 'active'
    ORDER BY e.full_name ASC
  `).all(companyId);

  res.json({ shifts, rotationalShifts, weeklyOffs, employees });
});

// Create Shift
router.post('/', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { name, start_time, end_time, grace_time_mins, working_hours, break_time_mins, is_rotational } = req.body;

  if (!name || !start_time || !end_time) {
    return res.status(400).json({ error: 'Shift Name, Start Time, and End Time are required.' });
  }

  const result = db.prepare(`
    INSERT INTO shifts (company_id, name, start_time, end_time, grace_time_mins, working_hours, break_time_mins, is_rotational, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    companyId, name.trim(), start_time, end_time,
    grace_time_mins !== undefined ? parseInt(grace_time_mins, 10) : 15,
    working_hours ? parseFloat(working_hours) : 8.0,
    break_time_mins !== undefined ? parseInt(break_time_mins, 10) : 60,
    is_rotational ? 1 : 0
  );

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Shift Management',
    action: 'SHIFT_CREATED',
    targetEntity: 'shifts',
    targetId: result.lastInsertRowid,
    newValues: { name, start_time, end_time, grace_time_mins },
    reason: 'Created new company shift schedule'
  });

  res.status(201).json({ success: true, shiftId: result.lastInsertRowid, message: `Shift "${name}" created successfully.` });
});

// Edit Shift
router.put('/:id', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const shiftId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);
  const { name, start_time, end_time, grace_time_mins, working_hours, break_time_mins, is_rotational, status } = req.body;

  const existing = db.prepare('SELECT * FROM shifts WHERE id = ? AND company_id = ?').get(shiftId, companyId);
  if (!existing) {
    return res.status(404).json({ error: 'Shift schedule not found.' });
  }

  db.prepare(`
    UPDATE shifts SET
      name = ?,
      start_time = ?,
      end_time = ?,
      grace_time_mins = ?,
      working_hours = ?,
      break_time_mins = ?,
      is_rotational = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).run(
    name ? name.trim() : existing.name,
    start_time || existing.start_time,
    end_time || existing.end_time,
    grace_time_mins !== undefined ? parseInt(grace_time_mins, 10) : existing.grace_time_mins,
    working_hours !== undefined ? parseFloat(working_hours) : existing.working_hours,
    break_time_mins !== undefined ? parseInt(break_time_mins, 10) : existing.break_time_mins,
    is_rotational !== undefined ? (is_rotational ? 1 : 0) : existing.is_rotational,
    status || existing.status,
    shiftId,
    companyId
  );

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Shift Management',
    action: 'SHIFT_UPDATED',
    targetEntity: 'shifts',
    targetId: shiftId,
    newValues: { name, start_time, end_time, grace_time_mins },
    reason: `Updated shift "${name || existing.name}" timings and grace period`
  });

  res.json({ success: true, message: `Shift "${name || existing.name}" updated successfully.` });
});

// Delete Shift
router.delete('/:id', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const shiftId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);

  const existing = db.prepare('SELECT * FROM shifts WHERE id = ? AND company_id = ?').get(shiftId, companyId);
  if (!existing) {
    return res.status(404).json({ error: 'Shift schedule not found.' });
  }

  const transaction = db.transaction(() => {
    // Unassign this shift from any employees
    db.prepare('UPDATE employees SET shift_id = NULL WHERE shift_id = ? AND company_id = ?').run(shiftId, companyId);
    db.prepare('DELETE FROM shift_assignments WHERE shift_id = ?').run(shiftId);
    db.prepare('DELETE FROM shifts WHERE id = ? AND company_id = ?').run(shiftId, companyId);

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Shift Management',
      action: 'SHIFT_DELETED',
      targetEntity: 'shifts',
      targetId: shiftId,
      newValues: null,
      reason: `Deleted shift "${existing.name}"`
    });
  });

  transaction();
  res.json({ success: true, message: `Shift "${existing.name}" deleted successfully.` });
});

// Master & Manual Shift Assignment (One time multiple employee assignment with effective date & notifications)
router.post('/assign', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_ids, shift_id, effective_date } = req.body;

  if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
    return res.status(400).json({ error: 'Please select at least one employee to assign shift.' });
  }

  const effectiveDate = effective_date || new Date().toISOString().split('T')[0];

  let targetShift = null;
  if (shift_id) {
    targetShift = db.prepare('SELECT * FROM shifts WHERE id = ? AND company_id = ?').get(shift_id, companyId);
    if (!targetShift) {
      return res.status(404).json({ error: 'Target shift not found.' });
    }
  }

  const transaction = db.transaction(() => {
    const updateEmpStmt = db.prepare(`
      UPDATE employees
      SET shift_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `);

    const insertShiftAssignStmt = db.prepare(`
      INSERT INTO shift_assignments (employee_id, shift_id, effective_from, is_active)
      VALUES (?, ?, ?, 1)
    `);

    const insertNotification = db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, is_read)
      VALUES (?, ?, ?, ?, 'system', 0)
    `);

    let affectedCount = 0;

    for (const empId of employee_ids) {
      const emp = db.prepare('SELECT id, user_id, full_name FROM employees WHERE id = ? AND company_id = ?').get(empId, companyId);
      if (emp) {
        updateEmpStmt.run(shift_id || null, emp.id, companyId);

        if (targetShift) {
          insertShiftAssignStmt.run(emp.id, targetShift.id, effectiveDate);

          // Send notification to employee
          insertNotification.run(
            emp.user_id,
            companyId,
            `Shift Assignment Updated: ${targetShift.name}`,
            `Your work shift has been updated to "${targetShift.name}" (${targetShift.start_time} - ${targetShift.end_time}, Grace: ${targetShift.grace_time_mins} mins). Effective Date: ${effectiveDate}.`
          );
        } else {
          // Unassigned notification
          insertNotification.run(
            emp.user_id,
            companyId,
            'Shift Assignment Updated: Default',
            `Your assigned shift has been reset to Company Default. Effective Date: ${effectiveDate}.`
          );
        }

        affectedCount++;
      }
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Shift Assignment Hub',
      action: 'SHIFT_ASSIGNED',
      targetEntity: 'shift_assignments',
      targetId: shift_id || 0,
      newValues: {
        shift_name: targetShift ? targetShift.name : 'None / Default',
        effective_date: effectiveDate,
        assigned_employees_count: affectedCount
      },
      reason: `Assigned shift to ${affectedCount} employee(s) effective from ${effectiveDate}`
    });

    return affectedCount;
  });

  const count = transaction();

  res.json({
    success: true,
    count,
    message: targetShift
      ? `Shift "${targetShift.name}" assigned successfully to ${count} employee(s) (Effective: ${effectiveDate}). Notifications sent.`
      : `Shift cleared for ${count} employee(s) (Effective: ${effectiveDate}).`
  });
});

// Configure Weekly Off Settings (Master or Custom per Employee with notifications)
router.post('/employee-weekly-off', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_ids, off_days, is_master, name } = req.body;
  const isMaster = is_master !== undefined ? is_master : req.body.master_apply;
  const targetEmpIds = Array.isArray(employee_ids) && employee_ids.length > 0
    ? employee_ids
    : (req.body.employee_id ? [req.body.employee_id] : []);

  if (!Array.isArray(off_days) || off_days.length === 0) {
    return res.status(400).json({ error: 'Weekly off days array (e.g. ["Sunday"] or ["Tuesday"]) is required.' });
  }

  const transaction = db.transaction(() => {
    let weeklyOffId;

    if (isMaster) {
      // 1. Identify previous master default
      const prevDefault = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(companyId);

      // 2. Demote existing default to non-default
      db.prepare('UPDATE weekly_off_settings SET is_default = 0 WHERE company_id = ? AND is_default = 1').run(companyId);

      // 3. Insert new Master default
      const resW = db.prepare(`
        INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
        VALUES (?, ?, ?, 1)
      `).run(companyId, name || `Master Weekly Off (${off_days.join(', ')})`, JSON.stringify(off_days));
      weeklyOffId = resW.lastInsertRowid;

      // 4. Auto apply ONLY to employees who are on NULL or were on the previous master default
      // (Employees with custom individual off days are NEVER overwritten!)
      if (prevDefault) {
        db.prepare(`
          UPDATE employees
          SET weekly_off_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ? AND (weekly_off_id IS NULL OR weekly_off_id = ?)
        `).run(weeklyOffId, companyId, prevDefault.id);
      } else {
        db.prepare(`
          UPDATE employees
          SET weekly_off_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ? AND weekly_off_id IS NULL
        `).run(weeklyOffId, companyId);
      }

      // Notify all company employees
      const allUsers = db.prepare('SELECT user_id FROM employees WHERE company_id = ? AND is_deleted = 0').all(companyId);
      const notifStmt = db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type, is_read)
        VALUES (?, ?, 'Master Weekly Off Updated', ?, 'system', 0)
      `);
      allUsers.forEach(u => {
        notifStmt.run(u.user_id, companyId, `Company Master weekly off days have been updated to: ${off_days.join(', ')}.`);
      });

      logAudit({
        companyId,
        userId: req.user.id,
        userName: req.user.username,
        role: req.user.role_name,
        panel: 'Weekly Off Settings',
        action: 'MASTER_WEEKLY_OFF_UPDATED',
        targetEntity: 'weekly_off_settings',
        targetId: weeklyOffId,
        newValues: { off_days, is_master: true },
        reason: 'Configured company-wide master weekly off'
      });

      return { weeklyOffId, count: allUsers.length, mode: 'master' };
    } else {
      // Custom / Manual Employee Weekly Off (Updates ONLY selected staff)
      if (targetEmpIds.length === 0) {
        throw new Error('Please select at least one employee for custom weekly off.');
      }

      // Check if matching custom weekly off setting already exists (is_default = 0)
      let existingW = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? AND off_days_json = ? AND is_default = 0').get(companyId, JSON.stringify(off_days));
      if (existingW) {
        weeklyOffId = existingW.id;
      } else {
        const resW = db.prepare(`
          INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
          VALUES (?, ?, ?, 0)
        `).run(companyId, name || `Custom Weekly Off (${off_days.join(', ')})`, JSON.stringify(off_days));
        weeklyOffId = resW.lastInsertRowid;
      }

      const updateEmp = db.prepare('UPDATE employees SET weekly_off_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND company_id = ?');
      const insertNotif = db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type, is_read)
        VALUES (?, ?, 'Weekly Off Schedule Updated', ?, 'system', 0)
      `);

      let updatedCount = 0;
      for (const empId of targetEmpIds) {
        const emp = db.prepare('SELECT id, user_id FROM employees WHERE id = ? AND company_id = ?').get(empId, companyId);
        if (emp) {
          updateEmp.run(weeklyOffId, emp.id, companyId);
          insertNotif.run(
            emp.user_id,
            companyId,
            `Your weekly off days have been customized to: ${off_days.join(', ')} (Effective immediately).`
          );
          updatedCount++;
        }
      }

      logAudit({
        companyId,
        userId: req.user.id,
        userName: req.user.username,
        role: req.user.role_name,
        panel: 'Weekly Off Settings',
        action: 'EMPLOYEE_WEEKLY_OFF_UPDATED',
        targetEntity: 'weekly_off_settings',
        targetId: weeklyOffId,
        newValues: { off_days, employee_ids_count: updatedCount },
        reason: `Assigned custom weekly off to ${updatedCount} employee(s)`
      });

      return { weeklyOffId, count: updatedCount, mode: 'custom' };
    }
  });

  const result = transaction();

  res.json({
    success: true,
    weeklyOffId: result.weeklyOffId,
    count: result.count,
    message: result.mode === 'master'
      ? `Master weekly off updated to [${off_days.join(', ')}] and applied company-wide.`
      : `Weekly off [${off_days.join(', ')}] assigned to ${result.count} employee(s). Notifications sent.`
  });
});

// Legacy single weekly off route (kept for backwards compatibility)
router.post('/weekly-off', verifyAuth, requireRole(['company_admin', 'hr', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { name, off_days, is_default } = req.body;

  if (!Array.isArray(off_days) || off_days.length === 0) {
    return res.status(400).json({ error: 'Weekly off days array (e.g. ["Sunday"]) is required.' });
  }

  const transaction = db.transaction(() => {
    if (is_default) {
      db.prepare('UPDATE weekly_off_settings SET is_default = 0 WHERE company_id = ?').run(companyId);
    }

    const resW = db.prepare(`
      INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
      VALUES (?, ?, ?, ?)
    `).run(companyId, name || 'Custom Weekly Off', JSON.stringify(off_days), is_default ? 1 : 0);

    return resW.lastInsertRowid;
  });

  const id = transaction();
  res.json({ success: true, weeklyOffId: id, message: 'Weekly off configured successfully.' });
});

module.exports = router;

