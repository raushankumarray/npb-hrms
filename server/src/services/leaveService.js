const db = require('../db');

// One-time startup migration: Ensure Casual Leave (CL) never has monthly auto-accrual
try {
  db.prepare(`
    UPDATE leave_types
    SET monthly_accrual_rate = 0.0
    WHERE name LIKE '%Casual%' OR name = 'CL' OR UPPER(name) LIKE '%(CL)%'
  `).run();
} catch (e) {}

/**
 * Ensures default leave types exist for a company:
 * - Casual Leave (CL): 12.0 days/year, monthly_accrual_rate = 0.0 (NO monthly auto-credit)
 * - Earned Leave (EL): 15.0 days/year, monthly_accrual_rate = 1.25, carry forward enabled (ONLY EL auto-credits monthly)
 */
function ensureCompanyLeaveTypes(companyId) {
  if (!companyId) return { clType: null, elType: null };

  // 1. Clean up legacy Paid Leave if any
  try {
    db.prepare("DELETE FROM leave_types WHERE company_id = ? AND name LIKE '%Paid Leave%'").run(companyId);
  } catch (e) {}

  // 2. Ensure Casual Leave (CL) exists (strictly monthly_accrual_rate = 0.0)
  let clType = db.prepare(`
    SELECT * FROM leave_types
    WHERE company_id = ? AND (name LIKE '%Casual%' OR name = 'CL' OR UPPER(name) LIKE '%(CL)%')
  `).get(companyId);

  if (!clType) {
    const res = db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, 'Casual Leave (CL)', 12.0, 0.0, 0, 0.0)
    `).run(companyId);
    clType = db.prepare('SELECT * FROM leave_types WHERE id = ?').get(res.lastInsertRowid);
  } else if (Number(clType.monthly_accrual_rate || 0) !== 0.0) {
    db.prepare('UPDATE leave_types SET monthly_accrual_rate = 0.0 WHERE id = ?').run(clType.id);
    clType.monthly_accrual_rate = 0.0;
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
 * Initializes leave balance records for an employee/manager upon creation or onboarding.
 * Strictly initializes with 0.0 balance: NO auto-crediting of 12 CL or 1.25 EL.
 * Leaves can ONLY be credited via the manual leave crediting feature.
 */
function autoCreditEmployeeLeaves(employeeId, companyId = null, createdByUserId = null) {
  if (!employeeId) return { success: false, error: 'Employee ID required' };

  if (!companyId) {
    const emp = db.prepare('SELECT company_id FROM employees WHERE id = ?').get(employeeId);
    if (emp) companyId = emp.company_id;
  }
  if (!companyId) return { success: false, error: 'Company ID could not be determined' };

  const { clType, elType } = ensureCompanyLeaveTypes(companyId);
  const fyInfo = getFinancialYearInfo();
  const currentYear = fyInfo.startYear;

  const insertZeroBalance = db.prepare(`
    INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
    VALUES (?, ?, ?, 0.0, 0.0, 0.0, 0.0)
    ON CONFLICT(employee_id, leave_type_id, year) DO NOTHING
  `);

  let clBalRow = null;
  let elBalRow = null;

  const transaction = db.transaction(() => {
    // 1. Casual Leave (CL) - Initialize at 0 if not present
    if (clType) {
      insertZeroBalance.run(employeeId, clType.id, currentYear);
      clBalRow = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(employeeId, clType.id, currentYear);
    }

    // 2. Earned Leave (EL) - Initialize at 0 if not present
    if (elType) {
      insertZeroBalance.run(employeeId, elType.id, currentYear);
      elBalRow = db.prepare(`
        SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?
      `).get(employeeId, elType.id, currentYear);
    }
  });

  transaction();

  // Dual-write / sync initialized 0-balance to Firebase if needed
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
 * Helper: Computes total Casual Leave (CL) credited to an employee in a given financial year.
 * Rule: Maximum 12.0 CL per financial year (1 Apr - 31 Mar).
 * Correctly accounts for deductions and resets so employees whose balances were reset can be re-credited cleanly.
 */
function getEmployeeCreditedCLInYear(employeeId, leaveTypeId, year = null) {
  const fyInfo = getFinancialYearInfo();
  const targetYear = year ? parseInt(year, 10) : fyInfo.startYear;

  const balRow = db.prepare(`
    SELECT balance, used, opening_balance, accrued
    FROM leave_balances
    WHERE employee_id = ? AND leave_type_id = ? AND year = ?
  `).get(employeeId, leaveTypeId, targetYear);

  if (!balRow) return 0;
  // Current active allowance held or used by the employee
  const activeBal = Number(balRow.balance || 0) + Number(balRow.used || 0);
  return Math.max(0, activeBal);
}

/**
 * Helper: Computes total Earned Leave (EL) credited to an employee for a specific month and year.
 * Rule: Maximum 1.25 EL per month.
 * If employee's balance was reset to 0 or deducted, allows re-crediting up to the 1.25 monthly cap without error.
 */
function getEmployeeCreditedELInMonth(employeeId, leaveTypeId, year = null, month = null) {
  const now = new Date();
  const targetYear = year ? parseInt(year, 10) : now.getFullYear();
  const targetMonth = month ? parseInt(month, 10) : (now.getMonth() + 1);

  const balRow = db.prepare(`
    SELECT balance, used, accrued
    FROM leave_balances
    WHERE employee_id = ? AND leave_type_id = ? AND year = ?
  `).get(employeeId, leaveTypeId, targetYear);

  const activeBal = balRow ? (Number(balRow.balance || 0) + Number(balRow.used || 0)) : 0;
  if (activeBal <= 0) return 0;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[targetMonth - 1] || (`Month ${targetMonth}`);
  const padMonth = String(targetMonth).padStart(2, '0');

  // Sum net transactions for this month (credits minus deductions)
  const txSum = db.prepare(`
    SELECT COALESCE(SUM(amount), 0.0) as total
    FROM leave_transactions
    WHERE employee_id = ? AND leave_type_id = ?
      AND (
        (period_month = ? AND period_year = ?)
        OR reason LIKE ?
        OR reason LIKE ?
      )
  `).get(
    employeeId, leaveTypeId,
    targetMonth, targetYear,
    `%${monthName} ${targetYear}%`,
    `%${targetYear}-${padMonth}%`
  );

  const netMonthTx = Math.max(0, Number(txSum?.total || 0));
  return Math.min(netMonthTx, activeBal);
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
 * Helper: Computes Indian Financial Year (1 April to 31 March) info.
 * E.g., Date in Sep 2026 -> Start Year: 2026, End Year: 2027, FY 2026-27 (1 Apr 2026 - 31 Mar 2027)
 */
function getFinancialYearInfo(targetDate = new Date(), targetYear = null) {
  let startYear;
  if (targetYear) {
    startYear = parseInt(targetYear, 10);
  } else {
    const d = new Date(targetDate);
    const y = d.getFullYear();
    const m = d.getMonth() + 1; // 1-12
    startYear = m >= 4 ? y : y - 1;
  }
  const endYear = startYear + 1;
  return {
    startYear,
    endYear,
    fyCode: `FY ${startYear}-${String(endYear).slice(-2)}`,
    fyLabel: `1 Apr ${startYear} - 31 Mar ${endYear}`,
    fyStartDate: `${startYear}-04-01`,
    fyEndDate: `${endYear}-03-31`,
    currentYear: startYear
  };
}

/**
 * Helper: Computes employee active period from Joining Date to 31 March of the Financial Year.
 * - Joined on or before 1 April: 12 months, max 12.0 CL.
 * - Joined mid-year (e.g. July): Remaining months to 31 March (e.g. 9 months, max 9.0 CL).
 * - Statutory pro-rata: 1.0 day CL per active month to 31 March.
 */
function calculateEmployeeFYTenure(joinDateStr, fyStartYear, fyEndYear) {
  const fyStart = new Date(`${fyStartYear}-04-01T00:00:00`);
  const fyEnd = new Date(`${fyEndYear}-03-31T23:59:59`);

  if (!joinDateStr) {
    return { activeMonths: 12, maxCL: 12.0, isMidYear: false, joinDateFormatted: 'N/A' };
  }

  const joinDate = new Date(joinDateStr);
  const joinDateFormatted = !isNaN(joinDate.getTime()) ? joinDate.toISOString().split('T')[0] : 'N/A';

  if (isNaN(joinDate.getTime()) || joinDate <= fyStart) {
    return { activeMonths: 12, maxCL: 12.0, isMidYear: false, joinDateFormatted };
  } else if (joinDate > fyEnd) {
    return { activeMonths: 0, maxCL: 0.0, isMidYear: true, joinDateFormatted };
  } else {
    const joinYear = joinDate.getFullYear();
    const joinMonth = joinDate.getMonth() + 1; // 1-12
    let activeMonths = 0;
    if (joinYear === fyStartYear) {
      activeMonths = (12 - joinMonth + 1) + 3;
    } else {
      activeMonths = (3 - joinMonth + 1);
    }
    activeMonths = Math.max(1, Math.min(12, activeMonths));
    const maxCL = Math.round((activeMonths / 12) * 12.0 * 10) / 10;
    return { activeMonths, maxCL, isMidYear: true, joinDateFormatted };
  }
}

module.exports = {
  ensureCompanyLeaveTypes,
  autoCreditEmployeeLeaves,
  getEmployeeCreditedCLInYear,
  getEmployeeCreditedELInMonth,
  getFinancialYearInfo,
  calculateEmployeeFYTenure,
  accrueMonthlyEarnedLeave
};
