const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, getTenantCompanyId } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');

// List Leave Types for Company (Strictly Casual Leave [12/yr] and Earned Leave [1.25/mo])
router.get('/types', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  if (!companyId) return res.json({ leaveTypes: [] });

  // Clean up any residual Paid Leave
  db.prepare("DELETE FROM leave_types WHERE company_id = ? AND name LIKE '%Paid Leave%'").run(companyId);

  // Ensure CL and EL exist
  let cl = db.prepare("SELECT * FROM leave_types WHERE company_id = ? AND (name LIKE '%Casual%' OR name = 'CL')").get(companyId);
  if (!cl) {
    db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Casual Leave (CL)', 12.0, 1.0, 0, 0.0)
    `).run(companyId);
  }

  let el = db.prepare("SELECT * FROM leave_types WHERE company_id = ? AND (name LIKE '%Earned%' OR name = 'EL')").get(companyId);
  if (!el) {
    db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Earned Leave (EL)', 15.0, 1.25, 1, 30.0)
    `).run(companyId);
  }

  const types = db.prepare(`
    SELECT * FROM leave_types 
    WHERE company_id = ? AND name NOT LIKE '%Paid Leave%'
    ORDER BY id ASC
  `).all(companyId);

  res.json({ leaveTypes: types });
});

// Master Apply Leave Policy (Company Admin, Super Admin)
// Configures Casual Leave (12/yr) and Earned Leave (1.25/mo) and batch applies to all employees
router.post('/master-apply', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { cl_yearly_quota = 12.0, el_monthly_rate = 1.25 } = req.body;
  const clQuota = parseFloat(cl_yearly_quota) || 12.0;
  const elRate = parseFloat(el_monthly_rate) || 1.25;
  const currentYear = new Date().getFullYear();

  // Clean up Paid Leave
  db.prepare("DELETE FROM leave_types WHERE company_id = ? AND name LIKE '%Paid Leave%'").run(companyId);

  const transaction = db.transaction(() => {
    // 1. Update/Insert Casual Leave (CL)
    db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Casual Leave (CL)', ?, 1.0, 0, 0.0)
      ON CONFLICT(company_id, name) DO UPDATE SET
        default_yearly_quota = excluded.default_yearly_quota,
        monthly_accrual_rate = 1.0
    `).run(companyId, clQuota);

    const clType = db.prepare("SELECT id FROM leave_types WHERE company_id = ? AND (name LIKE '%Casual%' OR name = 'CL')").get(companyId);

    // 2. Update/Insert Earned Leave (EL)
    db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Earned Leave (EL)', ?, ?, 1, 30.0)
      ON CONFLICT(company_id, name) DO UPDATE SET
        default_yearly_quota = excluded.default_yearly_quota,
        monthly_accrual_rate = excluded.monthly_accrual_rate
    `).run(companyId, elRate * 12, elRate);

    const elType = db.prepare("SELECT id FROM leave_types WHERE company_id = ? AND (name LIKE '%Earned%' OR name = 'EL')").get(companyId);

    // 3. Batch apply to all active employees in the company
    const employees = db.prepare(`
      SELECT id, full_name FROM employees
      WHERE company_id = ? AND status = 'active' AND is_deleted = 0
    `).all(companyId);

    const upsertClBalance = db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
      VALUES (?, ?, ?, ?, 0, 0, ?)
      ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        balance = excluded.opening_balance - used,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertTx = db.prepare(`
      INSERT INTO leave_transactions (
        employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
      ) VALUES (?, ?, 'opening', ?, ?, 'Master Policy Apply: Annual Quota', ?)
    `);

    const ensureElBalance = db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
      VALUES (?, ?, ?, 0, 0, 0, 0)
      ON CONFLICT(employee_id, leave_type_id, year) DO NOTHING
    `);

    for (const emp of employees) {
      if (clType) {
        upsertClBalance.run(emp.id, clType.id, currentYear, clQuota, clQuota);
        insertTx.run(emp.id, clType.id, clQuota, clQuota, req.user.id);
      }
      if (elType) {
        ensureElBalance.run(emp.id, elType.id, currentYear);
      }
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Leave Master Management',
      action: 'MASTER_LEAVE_POLICY_APPLIED',
      targetEntity: 'leave_types',
      newValues: { clQuota, elRate, totalEmployeesAffected: employees.length },
      reason: `Master leave policy applied: CL = ${clQuota} days/yr, EL = ${elRate} days/mo across ${employees.length} employees.`
    });

    return employees.length;
  });

  const affectedCount = transaction();

  res.json({
    success: true,
    message: `Master policy applied: CL set to ${clQuota} days/year, EL set to ${elRate} days/month for ${affectedCount} employee(s).`,
    clQuota,
    elRate,
    affectedCount
  });
});

// Leave Summary for Company Dashboard
router.get('/summary', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  if (!companyId) return res.json({ summary: {} });

  const currentYear = new Date().getFullYear();

  // 1. CL stats
  const clStats = db.prepare(`
    SELECT 
      COALESCE(SUM(lb.balance), 0) as total_balance,
      COALESCE(SUM(lb.used), 0) as total_used,
      COALESCE(SUM(lb.opening_balance), 0) as total_quota
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    JOIN employees e ON lb.employee_id = e.id
    WHERE lt.company_id = ? AND lb.year = ? 
      AND (lt.name LIKE '%Casual%' OR lt.name = 'CL')
      AND e.status = 'active' AND e.is_deleted = 0
  `).get(companyId, currentYear) || { total_balance: 0, total_used: 0, total_quota: 0 };

  // 2. EL stats
  const elStats = db.prepare(`
    SELECT 
      COALESCE(SUM(lb.balance), 0) as total_balance,
      COALESCE(SUM(lb.accrued), 0) as total_accrued,
      COALESCE(SUM(lb.used), 0) as total_used
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    JOIN employees e ON lb.employee_id = e.id
    WHERE lt.company_id = ? AND lb.year = ? 
      AND (lt.name LIKE '%Earned%' OR lt.name = 'EL')
      AND e.status = 'active' AND e.is_deleted = 0
  `).get(companyId, currentYear) || { total_balance: 0, total_accrued: 0, total_used: 0 };

  // 3. Pending leave requests count
  const pendingRequests = db.prepare(`
    SELECT COUNT(*) as count FROM leave_requests
    WHERE company_id = ? AND status = 'pending'
  `).get(companyId)?.count || 0;

  // 4. Total active employees
  const totalEmployees = db.prepare(`
    SELECT COUNT(*) as count FROM employees
    WHERE company_id = ? AND status = 'active' AND is_deleted = 0
  `).get(companyId)?.count || 0;

  res.json({
    summary: {
      cl: {
        total_balance: Math.round(clStats.total_balance * 100) / 100,
        total_used: Math.round(clStats.total_used * 100) / 100,
        total_quota: Math.round(clStats.total_quota * 100) / 100
      },
      el: {
        total_balance: Math.round(elStats.total_balance * 100) / 100,
        total_accrued: Math.round(elStats.total_accrued * 100) / 100,
        total_used: Math.round(elStats.total_used * 100) / 100
      },
      pending_requests: pendingRequests,
      total_employees: totalEmployees,
      current_year: currentYear
    }
  });
});

// Configure / Add Leave Type (Company Admin, Super Admin)
router.post('/types', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward } = req.body;

  if (!name || default_yearly_quota === undefined) {
    return res.status(400).json({ error: 'Leave type name and default quota are required.' });
  }

  const result = db.prepare(`
    INSERT INTO leave_types (
      company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(company_id, name) DO UPDATE SET
      default_yearly_quota = excluded.default_yearly_quota,
      monthly_accrual_rate = excluded.monthly_accrual_rate,
      is_carry_forward = excluded.is_carry_forward,
      max_carry_forward = excluded.max_carry_forward
  `).run(
    companyId, name.trim(), parseFloat(default_yearly_quota),
    monthly_accrual_rate ? parseFloat(monthly_accrual_rate) : 1.0,
    is_carry_forward ? 1 : 0,
    max_carry_forward ? parseFloat(max_carry_forward) : 0
  );

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Leave Management',
    action: 'LEAVE_TYPE_CONFIGURED',
    targetEntity: 'leave_types',
    targetId: result.lastInsertRowid,
    newValues: { name, default_yearly_quota, monthly_accrual_rate },
    reason: 'Configured leave type settings'
  });

  res.json({ success: true, message: 'Leave type configured successfully.' });
});

// Get Leave Balances for an Employee (or logged in employee)
router.get('/balances', verifyAuth, (req, res) => {
  let empId = req.query.employee_id;
  if (req.user.role_name === 'employee') {
    empId = req.user.employee_id;
  }

  if (!empId) {
    return res.status(400).json({ error: 'employee_id is required.' });
  }

  const currentYear = new Date().getFullYear();

  // Clean up Paid Leave
  db.prepare(`
    DELETE FROM leave_balances WHERE employee_id = ? AND leave_type_id IN (
      SELECT id FROM leave_types WHERE name LIKE '%Paid Leave%'
    )
  `).run(empId);

  const balances = db.prepare(`
    SELECT lb.*, lt.name as leave_type_name, lt.default_yearly_quota, lt.monthly_accrual_rate, lt.is_carry_forward
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    WHERE lb.employee_id = ? AND lb.year = ? AND lt.name NOT LIKE '%Paid Leave%'
    ORDER BY lt.id ASC
  `).all(empId, currentYear);

  // Fetch month-wise Earned Leave accrual history for employee
  const accrualLogs = db.prepare(`
    SELECT lt.*, ltype.name as leave_type_name
    FROM leave_transactions lt
    JOIN leave_types ltype ON lt.leave_type_id = ltype.id
    WHERE lt.employee_id = ? AND lt.transaction_type = 'accrual'
    ORDER BY lt.created_at DESC
    LIMIT 24
  `).all(empId);

  res.json({ balances, accrualHistory: accrualLogs });
});

// Submit Leave Request (Employee)
router.post('/requests', verifyAuth, (req, res) => {
  const employeeId = req.user.role_name === 'employee' ? req.user.employee_id : req.body.employee_id;
  const companyId = req.user.company_id || req.body.company_id;
  const { leave_type_id, start_date, end_date, total_days, reason } = req.body;

  let days = parseFloat(total_days);
  if (!days || isNaN(days) || days <= 0) {
    const s = new Date(start_date);
    const e = new Date(end_date);
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    days = diff > 0 ? diff : 1;
  }

  if (!leave_type_id || !start_date || !end_date || !reason) {
    return res.status(400).json({ error: 'All fields (leave type, start date, end date, reason) are required.' });
  }

  // Check current balance
  const currentYear = new Date().getFullYear();
  const balanceRow = db.prepare(`
    SELECT balance FROM leave_balances 
    WHERE employee_id = ? AND leave_type_id = ? AND year = ?
  `).get(employeeId, leave_type_id, currentYear);

  const availableBalance = balanceRow ? balanceRow.balance : 0;
  if (availableBalance < days) {
    return res.status(400).json({
      error: `Insufficient leave balance. You requested ${days} days, but only have ${availableBalance} days available.`
    });
  }

  const result = db.prepare(`
    INSERT INTO leave_requests (
      company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(companyId, employeeId, leave_type_id, start_date, end_date, days, reason.trim());

  // Notify Manager / Admin approvers
  const emp = db.prepare('SELECT full_name, manager_id, reports_to_admin FROM employees WHERE id = ?').get(employeeId);
  const notifyUserIds = new Set();

  if (emp) {
    if (emp.manager_id) {
      const mgrUser = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
      if (mgrUser && mgrUser.user_id) notifyUserIds.add(mgrUser.user_id);
    }

    try {
      const mappings = db.prepare('SELECT manager_id FROM employee_mappings WHERE employee_id = ?').all(employeeId);
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
      `).all(companyId);
      for (const a of admins) {
        notifyUserIds.add(a.id);
      }
    }
  }

  for (const uid of notifyUserIds) {
    db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, link)
      VALUES (?, ?, 'New Leave Request', ?, 'leave', '/leave-approvals')
    `).run(
      uid, companyId,
      `${emp ? emp.full_name : 'Employee'} submitted a leave request for ${total_days} days (${start_date} to ${end_date}).`
    );
  }

  res.status(201).json({ success: true, requestId: result.lastInsertRowid, message: 'Leave request submitted successfully.' });
});

// List Leave Requests (with role filtering: Manager sees assigned employees, HR/Admin sees all in company, Employee sees own)
router.get('/requests', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT lr.*, lt.name as leave_type_name,
           e.employee_id as employee_code, e.full_name as employee_name, e.department,
           m.full_name as manager_name
    FROM leave_requests lr
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    JOIN employees e ON lr.employee_id = e.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE lr.company_id = ?
  `;
  const params = [companyId];

  if (req.user.role_name === 'employee') {
    query += ' AND lr.employee_id = ?';
    params.push(req.user.employee_id);
  } else if (req.user.role_name === 'manager') {
    query += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
  }

  if (status && status !== 'all') {
    query += ' AND lr.status = ?';
    params.push(status);
  }

  query += ' ORDER BY lr.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const requests = db.prepare(query).all(...params);
  res.json({ requests });
});

// Approve or Reject Leave Request (Manager, Company Admin, Super Admin)
router.put('/requests/:id', verifyAuth, requireRole(['manager', 'company_admin', 'super_admin']), (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { status, rejection_reason } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "approved" or "rejected".' });
  }

  const request = db.prepare(`
    SELECT lr.*, e.user_id, e.full_name, lt.name as leave_type_name
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.id = ?
  `).get(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Leave request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request has already been ${request.status}.` });
  }

  const currentYear = new Date().getFullYear();

  const transaction = db.transaction(() => {
    // Update request status
    db.prepare(`
      UPDATE leave_requests SET
        status = ?,
        approved_by = ?,
        rejection_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user.id, rejection_reason || null, requestId);

    if (status === 'approved') {
      // Deduct balance and record transaction
      const balance = db.prepare(`
        SELECT * FROM leave_balances 
        WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(request.employee_id, request.leave_type_id, currentYear);

      const newUsed = (balance ? balance.used : 0) + request.total_days;
      const newBalance = (balance ? balance.balance : 0) - request.total_days;

      db.prepare(`
        UPDATE leave_balances SET
          used = ?,
          balance = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).run(newUsed, newBalance, request.employee_id, request.leave_type_id, currentYear);

      db.prepare(`
        INSERT INTO leave_transactions (
          employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
        ) VALUES (?, ?, 'deduction', ?, ?, ?, ?)
      `).run(
        request.employee_id, request.leave_type_id, request.total_days, newBalance,
        `Approved Leave Request #${requestId} (${request.start_date} to ${request.end_date})`, req.user.id
      );

      // Auto-record attendance records as 'Leave' for the date range
      const start = new Date(request.start_date);
      const end = new Date(request.end_date);
      const upsertAtt = db.prepare(`
        INSERT INTO attendance_records (
          company_id, employee_id, date, status, remarks
        ) VALUES (?, ?, ?, 'Leave', ?)
        ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
          status = 'Leave',
          remarks = excluded.remarks,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        upsertAtt.run(request.company_id, request.employee_id, dateStr, `Approved Leave: ${request.leave_type_name}`);
      }
    }

    // Send notification to employee
    db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, link)
      VALUES (?, ?, ?, ?, 'leave', '/leave-history')
    `).run(
      request.user_id,
      request.company_id,
      `Leave Request ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      `Your request for ${request.total_days} days (${request.start_date} to ${request.end_date}) was ${status}.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`
    );

    logAudit({
      companyId: request.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Leave Approvals',
      action: status === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      targetEntity: 'leave_requests',
      targetId: requestId,
      newValues: { status, rejection_reason },
      reason: `Leave request ${status} by ${req.user.username}`
    });
  });

  transaction();
  res.json({ success: true, message: `Leave request ${status} successfully.` });
});

// Run Monthly Accrual for Earned Leave (Company Admin, Super Admin)
router.post('/accrual/monthly', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const now = new Date();
  const month = parseInt(req.body.month || (now.getMonth() + 1), 10);
  const year = parseInt(req.body.year || now.getFullYear(), 10);
  const { leave_type_id, force = false } = req.body;

  let leaveType;
  if (leave_type_id) {
    leaveType = db.prepare('SELECT * FROM leave_types WHERE id = ? AND company_id = ?').get(leave_type_id, companyId);
  } else {
    leaveType = db.prepare("SELECT * FROM leave_types WHERE company_id = ? AND name LIKE '%Earned%'").get(companyId)
      || db.prepare('SELECT * FROM leave_types WHERE company_id = ? LIMIT 1').get(companyId);
  }

  if (!leaveType) {
    return res.status(404).json({ error: 'No suitable Earned Leave type found for this company.' });
  }

  const rate = leaveType.monthly_accrual_rate || 1.25;

  // Check if already applied this month
  const alreadyRan = db.prepare(`
    SELECT * FROM leave_accrual_logs
    WHERE company_id = ? AND leave_type_id = ? AND month = ? AND year = ?
  `).get(companyId, leaveType.id, month, year);

  if (alreadyRan && !force) {
    return res.status(400).json({
      error: `Monthly accrual for ${month}/${year} has already been applied on ${alreadyRan.created_at}. Pass force: true to re-apply.`
    });
  }

  const employees = db.prepare(`
    SELECT id, full_name, user_id FROM employees
    WHERE company_id = ? AND status = 'active' AND is_deleted = 0
  `).all(companyId);

  if (employees.length === 0) {
    return res.status(400).json({ error: 'No active employees found in this company.' });
  }

  const transaction = db.transaction(() => {
    const upsertBalance = db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
      VALUES (?, ?, ?, 0, ?, 0, ?)
      ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
        accrued = accrued + excluded.accrued,
        balance = balance + excluded.accrued,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertTx = db.prepare(`
      INSERT INTO leave_transactions (
        employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
      ) VALUES (?, ?, 'accrual', ?, (SELECT balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?), ?, ?)
    `);

    for (const emp of employees) {
      upsertBalance.run(emp.id, leaveType.id, year, rate, rate);
      insertTx.run(emp.id, leaveType.id, rate, emp.id, leaveType.id, year, `Monthly Accrual ${month}/${year} (+${rate} days)`, req.user.id);
    }

    db.prepare(`
      INSERT INTO leave_accrual_logs (company_id, leave_type_id, month, year, rate, total_employees, applied_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, leave_type_id, month, year) DO UPDATE SET
        rate = excluded.rate,
        total_employees = excluded.total_employees,
        applied_by = excluded.applied_by,
        created_at = CURRENT_TIMESTAMP
    `).run(companyId, leaveType.id, month, year, rate, employees.length, req.user.id);

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Leave Management',
      action: 'MONTHLY_LEAVE_ACCRUAL_APPLIED',
      targetEntity: 'leave_balances',
      newValues: { month, year, rate, totalEmployees: employees.length, leaveType: leaveType.name },
      reason: `Automated monthly accrual executed by ${req.user.username}`
    });
  });

  transaction();

  res.json({
    success: true,
    message: `Accrual applied: credited +${rate} days of "${leaveType.name}" to ${employees.length} employees for ${month}/${year}.`,
    rate,
    totalEmployees: employees.length,
    month,
    year
  });
});

// Manual Leave Credit (Company Admin, Super Admin)
router.post('/manual-credit', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_id, leave_type_id, days, reason, apply_to_all, cadence = 'month' } = req.body;
  const numDays = parseFloat(days);

  if (isNaN(numDays) || numDays <= 0) {
    return res.status(400).json({ error: 'Valid number of days greater than 0 is required.' });
  }

  if (!leave_type_id) {
    return res.status(400).json({ error: 'Leave type selection is required.' });
  }

  const leaveType = db.prepare('SELECT * FROM leave_types WHERE id = ? AND company_id = ?').get(leave_type_id, companyId);
  if (!leaveType) {
    return res.status(404).json({ error: 'Selected leave type not found.' });
  }

  const isEarnedLeave = leaveType.code === 'EL' || leaveType.name.toLowerCase().includes('earned');

  // Strict statutory rule: EL earned month-wise cannot exceed 1.25 days per month
  if (isEarnedLeave && cadence === 'month' && numDays > 1.25) {
    return res.status(400).json({ error: 'Earned Leave (EL) cannot exceed the statutory limit of 1.25 days per month.' });
  }

  const currentYear = new Date().getFullYear();
  let targetEmployees = [];

  if (apply_to_all) {
    targetEmployees = db.prepare('SELECT id, full_name FROM employees WHERE company_id = ? AND status = \'active\' AND is_deleted = 0').all(companyId);
  } else {
    if (!employee_id) {
      return res.status(400).json({ error: 'Please select an employee or check "Apply to all employees".' });
    }
    const single = db.prepare('SELECT id, full_name FROM employees WHERE id = ? AND company_id = ?').get(employee_id, companyId);
    if (!single) return res.status(404).json({ error: 'Employee not found.' });
    targetEmployees = [single];
  }

  const transaction = db.transaction(() => {
    const upsertBalance = db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
      VALUES (?, ?, ?, 0, ?, 0, ?)
      ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
        accrued = accrued + excluded.accrued,
        balance = balance + excluded.accrued,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertTx = db.prepare(`
      INSERT INTO leave_transactions (
        employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
      ) VALUES (?, ?, 'adjustment', ?, (SELECT balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?), ?, ?)
    `);

    const auditReason = reason || `Manual ${cadence}-wise credit (${numDays} days of ${leaveType.name})`;

    for (const emp of targetEmployees) {
      upsertBalance.run(emp.id, leaveType.id, currentYear, numDays, numDays);
      insertTx.run(emp.id, leaveType.id, numDays, emp.id, leaveType.id, currentYear, auditReason, req.user.id);
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Leave Management',
      action: 'MANUAL_LEAVE_CREDITED',
      targetEntity: 'leave_balances',
      newValues: { days: numDays, cadence, targetCount: targetEmployees.length, reason: auditReason },
      reason: `Manual ${cadence}-wise leave credited by ${req.user.username}`
    });
  });

  transaction();

  res.json({
    success: true,
    message: `Successfully credited +${numDays} days (${cadence}-wise) of "${leaveType.name}" to ${targetEmployees.length} employee(s).`,
    affectedCount: targetEmployees.length
  });
});

// Delete or Deduct Leave (Master Reset or Manual Deduct)
// Role: Company Admin, Super Admin
router.post('/delete-or-deduct', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_id, leave_type_id, action_type, days, reason, apply_to_all, target_type } = req.body;
  const isApplyToAll = Boolean(apply_to_all || target_type === 'all');

  if (!leave_type_id) {
    return res.status(400).json({ error: 'Leave type selection is required.' });
  }

  const leaveType = db.prepare('SELECT * FROM leave_types WHERE id = ? AND company_id = ?').get(leave_type_id, companyId);
  if (!leaveType) {
    return res.status(404).json({ error: 'Selected leave type not found.' });
  }

  if (!['reset_zero', 'deduct_days'].includes(action_type)) {
    return res.status(400).json({ error: 'Action must be "reset_zero" or "deduct_days".' });
  }

  const numDays = action_type === 'deduct_days' ? parseFloat(days) : 0;
  if (action_type === 'deduct_days' && (isNaN(numDays) || numDays <= 0)) {
    return res.status(400).json({ error: 'Valid number of days greater than 0 is required to deduct.' });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A mandatory reason is required for leave deletion / deduction audit.' });
  }

  const currentYear = new Date().getFullYear();
  let targetEmployees = [];

  if (isApplyToAll) {
    targetEmployees = db.prepare('SELECT id, full_name FROM employees WHERE company_id = ? AND status = \'active\' AND is_deleted = 0').all(companyId);
  } else {
    if (!employee_id) {
      return res.status(400).json({ error: 'Please select an employee or select "Apply to all employees".' });
    }
    const single = db.prepare('SELECT id, full_name FROM employees WHERE id = ? AND company_id = ?').get(employee_id, companyId);
    if (!single) return res.status(404).json({ error: 'Employee not found.' });
    targetEmployees = [single];
  }

  const transaction = db.transaction(() => {
    for (const emp of targetEmployees) {
      const existingBal = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(emp.id, leaveType.id, currentYear);

      let newBalance = 0;
      let amountDeducted = 0;

      if (action_type === 'reset_zero') {
        amountDeducted = existingBal ? existingBal.balance : 0;
        newBalance = 0;
        db.prepare(`
          INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
          VALUES (?, ?, ?, 0, 0, 0, 0)
          ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
            balance = 0,
            accrued = 0,
            opening_balance = 0,
            updated_at = CURRENT_TIMESTAMP
        `).run(emp.id, leaveType.id, currentYear);
      } else {
        // deduct_days
        const currentBal = existingBal ? existingBal.balance : 0;
        amountDeducted = Math.min(currentBal, numDays);
        newBalance = Math.max(0, currentBal - numDays);

        db.prepare(`
          INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
          VALUES (?, ?, ?, 0, 0, 0, 0)
          ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
            balance = MAX(0, balance - ?),
            updated_at = CURRENT_TIMESTAMP
        `).run(emp.id, leaveType.id, currentYear, numDays);
      }

      // Log into leave_transactions
      db.prepare(`
        INSERT INTO leave_transactions (
          employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
        ) VALUES (?, ?, 'deduction', ?, ?, ?, ?)
      `).run(emp.id, leaveType.id, -amountDeducted, newBalance, reason, req.user.id);
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Leave Management',
      action: action_type === 'reset_zero' ? 'MASTER_LEAVE_RESET' : 'MANUAL_LEAVE_DEDUCTED',
      targetEntity: 'leave_balances',
      newValues: { action_type, days: numDays, targetCount: targetEmployees.length, reason },
      reason: `Leave ${action_type === 'reset_zero' ? 'reset to 0' : 'deducted by ' + numDays + ' days'} by ${req.user.username}: ${reason}`
    });
  });

  transaction();

  res.json({
    success: true,
    message: action_type === 'reset_zero'
      ? `Successfully reset "${leaveType.name}" balance to 0 for ${targetEmployees.length} employee(s).`
      : `Successfully deducted ${numDays} days of "${leaveType.name}" for ${targetEmployees.length} employee(s).`,
    affectedCount: targetEmployees.length
  });
});

// Accrual History
router.get('/accrual/history', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const logs = db.prepare(`
    SELECT lal.*, lt.name as leave_type_name, u.username as applied_by_name
    FROM leave_accrual_logs lal
    JOIN leave_types lt ON lal.leave_type_id = lt.id
    LEFT JOIN users u ON lal.applied_by = u.id
    WHERE lal.company_id = ?
    ORDER BY lal.year DESC, lal.month DESC
  `).all(companyId);

  res.json({ logs });
});

module.exports = router;
