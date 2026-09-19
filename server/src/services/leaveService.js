const db = require('../db');

/**
 * Ensures default leave types exist for a company:
 * - Casual Leave (CL): 12.0 days/year, monthly_accrual_rate = 1.0
 * - Earned Leave (EL): 15.0 days/year, monthly_accrual_rate = 1.25, carry forward enabled
 */
function ensureCompanyLeaveTypes(companyId) {
  if (!companyId) return { clType: null, elType: null };

  // 1. Clean up legacy Paid Leave if any
  try {
    db.prepare("DELETE FROM leave_types WHERE company_id = ? AND name LIKE '%Paid Leave%'").run(companyId);
  } catch (e) {}

  // 2. Ensure Casual Leave (CL) exists
  let clType = db.prepare(`
    SELECT * FROM leave_types
    WHERE company_id = ? AND (name LIKE '%Casual%' OR name = 'CL' OR UPPER(name) LIKE '%(CL)%')
  `).get(companyId);

  if (!clType) {
    const res = db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Casual Leave (CL)', 12.0, 1.0, 0, 0.0)
    `).run(companyId);
    clType = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(res.lastInsertRowid);
  }

  // 3. Ensure Earned Leave (EL) exists
  let elType = db.prepare(`
    SELECT * FROM leave_types
    WHERE company_id = ? AND (name LIKE '%Earned%' OR name = 'EL' OR UPPER(name) LIKE '%(EL)%')
  `).get(companyId);

  if (!elType) {
    const res = db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Earned Leave (EL)', 15.0, 1.25, 1, 30.0)
    `).run(companyId);
    elType = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(res.lastInsertRowid);
  }

  // Sync to Firebase
  try {
    const { syncLeaveType } = require('./firebase');
    if (syncLeaveType) {
      if (clType) syncLeaveType(clType).catch(() => {});
      if (elType) syncLeaveType(elType).catch(() => {});
    }
  } catch (e) {}

  return { clType, elType };
}

/**
 * Auto-credit both CL and EL leaves for an employee/manager upon creation or onboarding.
 * - CL: Full yearly quota (default 12.0 days) credited as opening balance
 * - EL: Monthly rate (default 1.25 days) auto-credited upon creation
 * - Transactions recorded in leave_transactions
 * - Balances synchronized to Firebase
 */
function autoCreditEmployeeLeaves(employeeId, companyId = null, createdByUserId = null) {
  if (!employeeId) return { success: false, error: 'Employee ID required' };

  if (!companyId) {
    const emp = db.prepare('SELECT company_id FROM employees WHERE id = ?').get(employeeId);
    if (emp) companyId = emp.company_id;
  }
  if (!companyId) return { success: false, error: 'Company ID could not be determined' };

  const { clType, elType } = ensureCompanyLeaveTypes(companyId);
  const currentYear = new Date().getFullYear();

  const insertBalance = db.prepare(`
    INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
      opening_balance = CASE WHEN excluded.opening_balance > 0 THEN excluded.opening_balance ELSE opening_balance END,
      accrued = CASE WHEN excluded.accrued > 0 THEN excluded.accrued ELSE accrued END,
      balance = (CASE WHEN excluded.opening_balance > 0 THEN excluded.opening_balance ELSE opening_balance END) +
                (CASE WHEN excluded.accrued > 0 THEN excluded.accrued ELSE accrued END) - used,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertTransaction = db.prepare(`
    INSERT INTO leave_transactions (
      employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let clBalRow = null;
  let elBalRow = null;

  const transaction = db.transaction(() => {
    // 1. Casual Leave (CL) Credit
    if (clType) {
      const quota = Number(clType.default_yearly_quota || 12.0);
      const existingCl = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(employeeId, clType.id, currentYear);

      if (!existingCl) {
        insertBalance.run(employeeId, clType.id, currentYear, quota, 0, 0, quota);
        insertTransaction.run(
          employeeId, clType.id, 'opening', quota, quota,
          'Auto-credited upon account creation (Casual Leave)', createdByUserId || null
        );
      } else if (existingCl.opening_balance === 0 && existingCl.balance === 0 && existingCl.used === 0) {
        db.prepare(`
          UPDATE leave_balances SET opening_balance = ?, balance = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(quota, quota, existingCl.id);
        insertTransaction.run(
          employeeId, clType.id, 'opening', quota, quota,
          'Auto-credited upon account creation (Casual Leave)', createdByUserId || null
        );
      }

      clBalRow = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(employeeId, clType.id, currentYear);
    }

    // 2. Earned Leave (EL) Credit
    if (elType) {
      const elRate = Number(elType.monthly_accrual_rate || 1.25);
      const existingEl = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(employeeId, elType.id, currentYear);

      if (!existingEl) {
        insertBalance.run(employeeId, elType.id, currentYear, 0, elRate, 0, elRate);
        insertTransaction.run(
          employeeId, elType.id, 'accrual', elRate, elRate,
          'Auto-credited upon account creation (Earned Leave)', createdByUserId || null
        );
      } else if (existingEl.accrued === 0 && existingEl.balance === 0 && existingEl.used === 0) {
        db.prepare(`
          UPDATE leave_balances SET accrued = ?, balance = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(elRate, elRate, existingEl.id);
        insertTransaction.run(
          employeeId, elType.id, 'accrual', elRate, elRate,
          'Auto-credited upon account creation (Earned Leave)', createdByUserId || null
        );
      }

      elBalRow = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(employeeId, elType.id, currentYear);
    }
  });

  transaction();

  // Dual-write / sync to Firebase
  try {
    const { syncLeaveBalance } = require('./firebase');
    if (syncLeaveBalance) {
      if (clBalRow) syncLeaveBalance(clBalRow).catch(() => {});
      if (elBalRow) syncLeaveBalance(elBalRow).catch(() => {});
    }
  } catch (e) {}

  return {
    success: true,
    clBalance: clBalRow,
    elBalance: elBalRow
  };
}

/**
 * Accrues Monthly Earned Leave (EL) for all active employees across companies.
 * Typically 1.25 days per month (or configured rate).
 * Idempotent: Checks leave_accrual_logs and leave_transactions so employees are never double-credited.
 */
function accrueMonthlyEarnedLeave(targetYear = null, targetMonth = null, appliedByUserId = null) {
  const now = new Date();
  const year = targetYear ? parseInt(targetYear, 10) : now.getFullYear();
  const month = targetMonth ? parseInt(targetMonth, 10) : (now.getMonth() + 1);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[month - 1] || (`Month ${month}`);
  const monthTag = `${monthName} ${year}`;

  const companies = db.prepare(`
    SELECT id, name FROM companies
    WHERE status = 'active'
  `).all();

  let totalEmployeesAccrued = 0;
  const syncedBalances = [];

  const updateBalance = db.prepare(`
    UPDATE leave_balances SET
      accrued = accrued + ?,
      balance = balance + ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const insertBalance = db.prepare(`
    INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
    VALUES (?, ?, ?, 0, ?, 0, ?)
  `);

  const insertTransaction = db.prepare(`
    INSERT INTO leave_transactions (
      employee_id, leave_type_id, transaction_type, amount, balance_after, reason, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAccrualLog = db.prepare(`
    INSERT OR REPLACE INTO leave_accrual_logs (
      company_id, leave_type_id, month, year, rate, total_employees, applied_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const comp of companies) {
    const { elType } = ensureCompanyLeaveTypes(comp.id);
    if (!elType) continue;

    const rate = Number(elType.monthly_accrual_rate || 1.25);

    // Active employees in this company
    const activeEmployees = db.prepare(`
      SELECT id, full_name FROM employees
      WHERE company_id = ? AND status = 'active' AND is_deleted = 0
    `).all(comp.id);

    if (activeEmployees.length === 0) continue;

    let companyAccruedCount = 0;

    const compTx = db.transaction(() => {
      for (const emp of activeEmployees) {
        // Check if employee already received EL accrual for this month and year
        const alreadyAccrued = db.prepare(`
          SELECT id FROM leave_transactions
          WHERE employee_id = ? AND leave_type_id = ? AND transaction_type = 'accrual'
            AND (reason LIKE ? OR reason LIKE ?)
        `).get(emp.id, elType.id, `%${monthTag}%`, `%${year}-${String(month).padStart(2, '0')}%`);

        if (alreadyAccrued) continue;

        let bal = db.prepare(`
          SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
        `).get(emp.id, elType.id, year);

        let newBalance = rate;

        if (bal) {
          updateBalance.run(rate, rate, bal.id);
          newBalance = Number(bal.balance || 0) + rate;
        } else {
          insertBalance.run(emp.id, elType.id, year, rate, rate);
          newBalance = rate;
        }

        insertTransaction.run(
          emp.id, elType.id, 'accrual', rate, newBalance,
          `Monthly Earned Leave Accrual (${monthTag})`, appliedByUserId || null
        );

        companyAccruedCount++;
        totalEmployeesAccrued++;

        // Fetch refreshed balance row for Firebase sync
        const refreshedBal = db.prepare(`
          SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
        `).get(emp.id, elType.id, year);
        if (refreshedBal) syncedBalances.push(refreshedBal);
      }

      insertAccrualLog.run(comp.id, elType.id, month, year, rate, companyAccruedCount, appliedByUserId || null);
    });

    try {
      compTx();
    } catch (err) {
      console.warn(`Error during monthly EL accrual for company ${comp.id}:`, err.message);
    }
  }

  // Dual-write / sync updated balances to Firebase in background
  try {
    const { syncLeaveBalance } = require('./firebase');
    if (syncLeaveBalance && syncedBalances.length > 0) {
      for (const b of syncedBalances) {
        syncLeaveBalance(b).catch(() => {});
      }
    }
  } catch (e) {}

  return {
    success: true,
    year,
    month,
    monthName,
    totalEmployeesAccrued
  };
}

/**
 * Checks if the current month has already been accrued. If not, runs accrual.
 */
let lastCheckMonthYear = '';
function checkAndRunMonthlyAccrual() {
  try {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (lastCheckMonthYear === currentKey) return;

    // Check if any company still needs current month accrual
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const companiesNeedingAccrual = db.prepare(`
      SELECT c.id FROM companies c
      WHERE c.status = 'active'
        AND c.id NOT IN (
          SELECT company_id FROM leave_accrual_logs
          WHERE year = ? AND month = ?
        )
    `).all(year, month);

    if (companiesNeedingAccrual.length > 0) {
      console.log(`[LeaveService] Running monthly EL accrual for ${currentKey} across ${companiesNeedingAccrual.length} company(ies)...`);
      const res = accrueMonthlyEarnedLeave(year, month);
      console.log(`[LeaveService] Monthly EL accrual completed. Employees credited: ${res.totalEmployeesAccrued}`);
    }

    lastCheckMonthYear = currentKey;
  } catch (err) {
    console.warn('[LeaveService] checkAndRunMonthlyAccrual notice:', err.message);
  }
}

module.exports = {
  ensureCompanyLeaveTypes,
  autoCreditEmployeeLeaves,
  accrueMonthlyEarnedLeave,
  checkAndRunMonthlyAccrual
};
