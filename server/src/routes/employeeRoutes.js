const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, getTenantCompanyId } = require('../middleware/rbac');
const {
  generateEmployeeTemplate,
  validateEmployeeImport,
  commitEmployeeImport,
  diffEmployeeUpdate,
  commitEmployeeDiffUpdate
} = require('../services/excelService');
const { logAudit } = require('../services/audit');

const upload = multer({ storage: multer.memoryStorage() });

// List employees with multi-tenant filtering, pagination & search
router.get('/', verifyAuth, (req, res) => {
  let companyId = getTenantCompanyId(req);
  const {
    role,
    department,
    designation,
    manager_id,
    reports_to_admin,
    mapping_status,
    status,
    city,
    company_id,
    search,
    limit = 10,
    offset = 0
  } = req.query;

  // If super_admin or support and company_id is provided in query, filter by that company
  if ((req.user.role_name === 'super_admin' || req.user.role_name === 'support') && company_id && company_id !== 'all') {
    companyId = parseInt(company_id, 10);
  }

  let baseQuery = `
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN companies c ON e.company_id = c.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id
    LEFT JOIN geofences g ON e.geofence_id = g.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE e.is_deleted = 0
      AND r.name NOT IN ('super_admin', 'company_admin')
  `;
  const params = [];

  // Multi-tenant check
  if (companyId) {
    baseQuery += ' AND e.company_id = ?';
    params.push(companyId);
  }

  // If role is Manager, strictly only show assigned subordinates (employees only)!
  // Manager's own personal login credentials and account creation details must NOT be shown!
  if (req.user.role_name === 'manager') {
    baseQuery += ` AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))
                   AND r.name = 'employee' AND e.user_id != ? AND e.id != ?`;
    params.push(req.user.employee_id, req.user.employee_id, req.user.id, req.user.employee_id || 0);
  } else if (role && role !== 'all') {
    baseQuery += ' AND r.name = ?';
    params.push(role);
  }

  if (department) {
    baseQuery += ' AND e.department = ?';
    params.push(department);
  }

  if (designation) {
    baseQuery += ' AND e.designation = ?';
    params.push(designation);
  }

  if (city && city !== 'all') {
    baseQuery += ' AND LOWER(TRIM(e.city)) = LOWER(TRIM(?))';
    params.push(city);
  }

  // Manager filter
  if (manager_id && manager_id !== 'all') {
    if (manager_id === 'none' || manager_id === 'unassigned') {
      baseQuery += ' AND (e.manager_id IS NULL OR e.manager_id = 0)';
    } else {
      baseQuery += ' AND e.manager_id = ?';
      params.push(parseInt(manager_id, 10));
    }
  }

  // Reports to Admin filter
  if (reports_to_admin !== undefined && reports_to_admin !== null && reports_to_admin !== 'all') {
    if (reports_to_admin === '1' || reports_to_admin === 'true' || reports_to_admin === 1) {
      baseQuery += ' AND e.reports_to_admin = 1';
    } else if (reports_to_admin === '0' || reports_to_admin === 'false' || reports_to_admin === 0) {
      baseQuery += ' AND (e.reports_to_admin = 0 OR e.reports_to_admin IS NULL)';
    }
  }

  // Mapping status filter (mapped vs unmapped)
  if (mapping_status && mapping_status !== 'all') {
    if (mapping_status === 'mapped') {
      baseQuery += ` AND (
        (e.manager_id IS NOT NULL AND e.manager_id != 0)
        OR e.reports_to_admin = 1
        OR e.id IN (SELECT employee_id FROM employee_mappings)
      )`;
    } else if (mapping_status === 'unmapped' || mapping_status === 'not_mapped') {
      baseQuery += ` AND (
        (e.manager_id IS NULL OR e.manager_id = 0)
        AND (e.reports_to_admin = 0 OR e.reports_to_admin IS NULL)
        AND e.id NOT IN (SELECT employee_id FROM employee_mappings)
      )`;
    }
  }

  if (status && status !== 'all') {
    if (status === 'suspended') {
      baseQuery += " AND e.status IN ('suspended', 'disabled', 'banned')";
    } else {
      baseQuery += ' AND e.status = ?';
      params.push(status);
    }
  }

  if (search) {
    baseQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR u.username LIKE ? OR e.email LIKE ? OR e.mobile LIKE ? OR e.city LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
  const total = db.prepare(countQuery).get(...params).total;

  const dataQuery = `
    SELECT e.*, u.username, u.status as user_status, r.name as role_name,
           c.name as company_name, c.code as company_code,
           s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end,
           w.name as weekly_off_name,
           g.location_name as geofence_name, g.radius as geofence_radius,
           m.full_name as manager_name, m.employee_id as manager_code,
           COALESCE(e.reports_to_admin, 0) as reports_to_admin
    ${baseQuery}
    ORDER BY e.id DESC
    LIMIT ? OFFSET ?
  `;

  const employees = db.prepare(dataQuery).all(...params, parseInt(limit, 10), parseInt(offset, 10));

  // Distinct cities for filter dropdown
  const citiesQuery = `SELECT DISTINCT city FROM employees WHERE city IS NOT NULL AND city != '' AND is_deleted = 0 ${companyId ? 'AND company_id = ?' : ''} ORDER BY city ASC`;
  const cities = db.prepare(citiesQuery).all(...(companyId ? [companyId] : [])).map(r => r.city);

  // Managers list for dropdowns
  const managersQuery = `
    SELECT e.id, e.full_name, e.employee_id, e.department, e.designation, e.city
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'manager' AND e.is_deleted = 0 ${companyId ? 'AND e.company_id = ?' : ''}
    ORDER BY e.full_name ASC
  `;
  const managersList = db.prepare(managersQuery).all(...(companyId ? [companyId] : []));

  // Companies list for Super Admin dropdown
  const companiesList = (req.user.role_name === 'super_admin' || req.user.role_name === 'support')
    ? db.prepare("SELECT id, name, code FROM companies WHERE is_deleted = 0 ORDER BY name ASC").all()
    : [];

  res.json({
    employees,
    total,
    cities,
    companies: companiesList,
    managers: managersList,
    hrs: []
  });
});

// List all employee mappings (Company Admin, HR, Manager)
router.get('/mappings', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);

  let query = `
    SELECT em.id, em.company_id, em.manager_id as supervisor_id, em.employee_id,
           COALESCE(em.mapping_type, 'manager') as mapping_type, em.created_at,
           s.full_name as supervisor_name, s.employee_id as supervisor_code, s.department as supervisor_department,
           sr.name as supervisor_role,
           e.full_name as employee_name, e.employee_id as employee_code, e.department, e.designation
    FROM employee_mappings em
    JOIN employees s ON em.manager_id = s.id
    JOIN users su ON s.user_id = su.id
    JOIN roles sr ON su.role_id = sr.id
    JOIN employees e ON em.employee_id = e.id
    WHERE em.company_id = ? AND e.is_deleted = 0 AND s.is_deleted = 0
  `;
  const params = [companyId];

  if (req.user.role_name === 'manager') {
    query += ' AND em.manager_id = ?';
    params.push(req.user.employee_id);
  }

  query += ' ORDER BY s.full_name ASC, e.full_name ASC';

  const mappings = db.prepare(query).all(...params);
  res.json({ mappings });
});

// Manager Dashboard Stats: Strictly Assigned Members, Pending Leaves, Pending Corrections, Daily Attendance (Present, Absent, Leave)
router.get('/manager-dashboard-stats', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const managerEmpId = req.user.employee_id;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. Total Assigned Team Members (excluding deleted, admins, and manager self)
    let assignedQuery = `
      SELECT e.id FROM employees e
      JOIN users u ON e.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      WHERE e.company_id = ? AND e.is_deleted = 0 AND r.name = 'employee'
    `;
    const assignedParams = [companyId];
    if (req.user.role_name === 'manager') {
      assignedQuery += ` AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?)) AND e.user_id != ? AND e.id != ?`;
      assignedParams.push(managerEmpId, managerEmpId, req.user.id, managerEmpId || 0);
    }
    const teamMembers = db.prepare(assignedQuery).all(...assignedParams);
    const teamMemberIds = teamMembers.map(m => m.id);
    const assignedCount = teamMemberIds.length;

    if (assignedCount === 0) {
      return res.json({
        assigned_members: 0,
        pending_leaves: 0,
        pending_corrections: 0,
        today_attendance: {
          date: today,
          present: 0,
          absent: 0,
          leave: 0
        }
      });
    }

    const placeholders = teamMemberIds.map(() => '?').join(',');

    // 2. Pending Leave Approvals count
    const pendingLeaves = db.prepare(`
      SELECT COUNT(*) as count FROM leave_requests
      WHERE employee_id IN (${placeholders}) AND status = 'pending'
    `).get(...teamMemberIds).count;

    // 3. Pending Attendance Corrections count
    const pendingCorrections = db.prepare(`
      SELECT COUNT(*) as count FROM attendance_correction_requests
      WHERE employee_id IN (${placeholders}) AND status = 'pending'
    `).get(...teamMemberIds).count;

    // 4. Daily Attendance: Present, Leave, Absent for today
    // 4a. Team members on approved leave today
    const leavesToday = db.prepare(`
      SELECT DISTINCT employee_id FROM leave_requests
      WHERE employee_id IN (${placeholders})
        AND status = 'approved'
        AND ? BETWEEN start_date AND end_date
    `).all(...teamMemberIds, today);
    const leaveEmpIdSet = new Set(leavesToday.map(l => l.employee_id));
    const leaveCount = leaveEmpIdSet.size;

    // 4b. Team members present today (status IN ('present', 'half_day') OR punch_in IS NOT NULL)
    const presentToday = db.prepare(`
      SELECT DISTINCT employee_id FROM attendance_records
      WHERE employee_id IN (${placeholders})
        AND date = ?
        AND (status IN ('present', 'half_day') OR punch_in_time IS NOT NULL)
    `).all(...teamMemberIds, today);
    const presentEmpIdSet = new Set(presentToday.map(p => p.employee_id));
    const presentCount = presentEmpIdSet.size;

    // 4c. Absent: assigned members who are not present and not on leave today
    const absentCount = Math.max(0, assignedCount - presentCount - leaveCount);

    res.json({
      assigned_members: assignedCount,
      pending_leaves: pendingLeaves,
      pending_corrections: pendingCorrections,
      today_attendance: {
        date: today,
        present: presentCount,
        absent: absentCount,
        leave: leaveCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch manager stats: ' + err.message });
  }
});

// Get single employee details
router.get('/:id', verifyAuth, (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);

  let query = `
    SELECT e.*, u.username, u.status as user_status, r.name as role_name,
           s.name as shift_name, s.start_time as shift_start, s.end_time as shift_end,
           w.name as weekly_off_name,
           g.location_name as geofence_name,
           m.full_name as manager_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id
    LEFT JOIN geofences g ON e.geofence_id = g.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE e.id = ? AND e.is_deleted = 0
  `;
  const params = [empId];

  if (companyId) {
    query += ' AND e.company_id = ?';
    params.push(companyId);
  }

  const employee = db.prepare(query).get(...params);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Get leave balances
  const balances = db.prepare(`
    SELECT lb.*, lt.name as leave_type_name
    FROM leave_balances lb
    JOIN leave_types lt ON lb.leave_type_id = lt.id
    WHERE lb.employee_id = ? AND lb.year = ?
  `).all(empId, new Date().getFullYear());

  res.json({ employee, leaveBalances: balances });
});

// Add Employee manually (Company Admin, Manager, Super Admin)
router.post('/', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  if (!companyId) {
    return res.status(400).json({ error: 'Target company must be specified.' });
  }

  const {
    employee_id, full_name, username, password, email, mobile,
    department, designation, city, manager_id, hr_id, shift_id, weekly_off_id,
    geofence_id, geofence_mode, role, reports_to_admin
  } = req.body;

  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'Full Name, Username, and Password are required.' });
  }

  // Optional Employee ID: If left blank, do NOT auto-generate. Keep blank/null so user can update in future.
  const finalEmpId = (employee_id && employee_id.trim()) ? employee_id.trim() : null;

  // Check unique employee_id in company ONLY if an ID is provided
  if (finalEmpId) {
    const existingEmp = db.prepare('SELECT id FROM employees WHERE company_id = ? AND employee_id = ?').get(companyId, finalEmpId);
    if (existingEmp) {
      return res.status(400).json({ error: `Employee ID "${finalEmpId}" already exists in this company.` });
    }
  }

  // Check unique username globally
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existingUser) {
    return res.status(400).json({ error: `Username "${username}" already taken.` });
  }

  // Security: Company Administrator and Super Admin accounts can NEVER be created via employee endpoints!
  if (role === 'company_admin' || role === 'super_admin') {
    return res.status(403).json({ error: 'Company Administrator accounts cannot be created here. They are created and managed exclusively in Super Admin panel.' });
  }

  const isManagerCreator = req.user.role_name === 'manager';
  // Managers can ONLY create 'employee' accounts (never HR or Manager)
  const finalRole = isManagerCreator ? 'employee' : (role || 'employee');
  const roleTarget = db.prepare('SELECT id FROM roles WHERE name = ?').get(finalRole);
  const passHash = bcrypt.hashSync(password, 10);
  const currentYear = new Date().getFullYear();

  // Multi-level reporting resolution
  const finalReportsToAdmin = reports_to_admin ? 1 : 0;

  // If created by manager, manager_id strictly auto-maps to that manager's employee_id
  let finalManagerId = null;
  if (isManagerCreator) {
    finalManagerId = req.user.employee_id;
  } else if (finalRole === 'employee') {
    finalManagerId = manager_id || null;
  }

  const finalHrId = null;

  // Geofencing: for Manager, geofencing is not required
  let finalGeofenceMode = 'company';
  if (finalRole === 'manager') {
    finalGeofenceMode = geofence_id ? 'custom' : 'none';
  } else {
    finalGeofenceMode = geofence_mode || (geofence_id ? 'custom' : 'company');
  }

  // Weekly off: default to active company master default if not explicitly provided
  let finalWeeklyOffId = weekly_off_id || null;
  if (!finalWeeklyOffId && companyId) {
    const defaultW = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(companyId);
    if (defaultW) finalWeeklyOffId = defaultW.id;
  }

  const transaction = db.transaction(() => {
    // 1. Create User
    const userRes = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(username.trim(), passHash, email, roleTarget.id, companyId);

    // 2. Create Employee
    const empRes = db.prepare(`
      INSERT INTO employees (
        company_id, user_id, employee_id, full_name, mobile, email,
        department, designation, city, manager_id, hr_id, shift_id, weekly_off_id,
        geofence_id, geofence_mode, reports_to_admin, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      companyId, userRes.lastInsertRowid, finalEmpId, full_name.trim(), mobile, email,
      department, designation, city || '', finalManagerId, finalHrId, shift_id || null, finalWeeklyOffId,
      geofence_id || null, finalGeofenceMode, finalReportsToAdmin
    );

    const empDbId = empRes.lastInsertRowid;

    // 3. Sync employee_mappings
    if (finalManagerId) {
      db.prepare(`
        INSERT OR REPLACE INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
        VALUES (?, ?, ?, 'manager', ?)
      `).run(companyId, finalManagerId, empDbId, req.user.id);
    }

    // 4. Initialize leave balances (strictly Casual Leave = 12, Earned Leave = 0 [earned 1.25/mo])
    const leaveTypes = db.prepare("SELECT id, name FROM leave_types WHERE company_id = ? AND name NOT LIKE '%Paid Leave%'").all(companyId);
    const insertLeaveBal = db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
      VALUES (?, ?, ?, ?, 0, 0, ?)
    `);

    leaveTypes.forEach(lt => {
      let quota = 12.0;
      if (lt.name.includes('Earned') || lt.name === 'EL') {
        quota = 0; // EL is accrued month-wise (1.25/mo) or manually added
      }
      insertLeaveBal.run(empDbId, lt.id, currentYear, quota, quota);
    });

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Management',
      action: 'EMPLOYEE_CREATED',
      targetEntity: 'employees',
      targetId: empDbId,
      newValues: { employee_id: finalEmpId, full_name, username, department, designation, geofence_id, shift_id, reports_to_admin: finalReportsToAdmin },
      reason: 'Created personnel with unified onboarding form'
    });

    return empDbId;
  });

  const createdId = transaction();
  res.status(201).json({ success: true, employeeId: createdId, employeeCode: finalEmpId, message: 'Personnel added successfully.' });
});

// Update Employee (Company Admin, Manager, Super Admin, Support L2+)
router.put('/:id', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin', 'support']), (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);

  const {
    employee_id, full_name, username, mobile, email, department, designation, city,
    role, manager_id, hr_id, shift_id, weekly_off_id, geofence_id, geofence_mode,
    reports_to_admin, status, password
  } = req.body;

  const currentEmp = db.prepare(`
    SELECT e.*, r.name as role_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.id = ?
  `).get(empId);
  if (!currentEmp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Security: Company Administrator and Super Admin accounts cannot be modified via employee endpoints
  if (currentEmp.role_name === 'company_admin' || currentEmp.role_name === 'super_admin') {
    return res.status(403).json({ error: 'Company Administrator accounts cannot be modified here. Manage them in Super Admin panel.' });
  }

  // Security: Managers can only modify subordinate employees, never managers or themselves!
  if (req.user.role_name === 'manager') {
    if (currentEmp.role_name !== 'employee' || currentEmp.user_id === req.user.id || currentEmp.id === req.user.employee_id) {
      return res.status(403).json({ error: 'Managers can only modify subordinate employee accounts.' });
    }
  }

  // Username update permission check:
  // Employee username can ONLY be changed in Company Admin panel (and Super Admin).
  // Managers CANNOT change employee usernames.
  const currentUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(currentEmp.user_id);
  const cleanUsername = (username !== undefined && username !== null) ? String(username).trim() : undefined;
  if (cleanUsername && currentUser && cleanUsername !== currentUser.username) {
    if (req.user.role_name === 'manager') {
      return res.status(403).json({ error: 'Managers cannot change employee usernames. Only Company Administrator can update usernames.' });
    }
    // Check uniqueness across all users
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, currentEmp.user_id);
    if (existingUser) {
      return res.status(400).json({ error: `Username "${cleanUsername}" is already taken.` });
    }
  }

  // If employee_id changed, check uniqueness
  const finalEmpId = employee_id !== undefined ? (employee_id && employee_id.trim() ? employee_id.trim() : null) : currentEmp.employee_id;
  if (finalEmpId && finalEmpId !== currentEmp.employee_id) {
    const existingCode = db.prepare('SELECT id FROM employees WHERE company_id = ? AND employee_id = ? AND id != ?').get(currentEmp.company_id, finalEmpId, empId);
    if (existingCode) {
      return res.status(400).json({ error: `Employee ID "${finalEmpId}" already taken.` });
    }
  }

  let effectiveRole = role || (db.prepare('SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?').get(currentEmp.user_id)?.name || 'employee');
  if (req.user.role_name === 'manager') {
    effectiveRole = 'employee';
  }
  const finalReportsToAdmin = reports_to_admin !== undefined ? (reports_to_admin ? 1 : 0) : currentEmp.reports_to_admin;
  const finalManagerId = effectiveRole === 'employee' ? (manager_id !== undefined ? (manager_id || null) : currentEmp.manager_id) : null;
  const finalHrId = null;
  
  // Geofencing: for Manager, geofencing is not required
  let finalGeofenceMode = currentEmp.geofence_mode;
  if (effectiveRole === 'manager') {
    finalGeofenceMode = geofence_id ? 'custom' : 'none';
  } else {
    finalGeofenceMode = geofence_mode || (geofence_id ? 'custom' : currentEmp.geofence_mode);
  }

  const transaction = db.transaction(() => {
    // If username updated by Company Admin / Super Admin
    if (cleanUsername && currentUser && cleanUsername !== currentUser.username && (req.user.role_name === 'company_admin' || req.user.role_name === 'super_admin')) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(cleanUsername, currentEmp.user_id);
    }

    // If password provided, update user password
    if (password) {
      const passHash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passHash, currentEmp.user_id);
    }

    // If status provided, update user status
    if (status) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status === 'suspended' ? 'disabled' : status, currentEmp.user_id);
    }

    // If role provided and caller is admin, update user role
    if (role && (req.user.role_name === 'company_admin' || req.user.role_name === 'super_admin')) {
      const targetRole = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
      if (targetRole) {
        db.prepare('UPDATE users SET role_id = ? WHERE id = ?').run(targetRole.id, currentEmp.user_id);
      }
    }

    db.prepare(`
      UPDATE employees SET
        employee_id = ?,
        full_name = COALESCE(?, full_name),
        mobile = COALESCE(?, mobile),
        email = COALESCE(?, email),
        department = COALESCE(?, department),
        designation = COALESCE(?, designation),
        city = COALESCE(?, city),
        manager_id = ?,
        hr_id = ?,
        shift_id = ?,
        weekly_off_id = ?,
        geofence_id = ?,
        geofence_mode = COALESCE(?, geofence_mode),
        reports_to_admin = ?,
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      finalEmpId,
      full_name, mobile, email, department, designation,
      city !== undefined ? city : null,
      finalManagerId,
      finalHrId,
      shift_id !== undefined ? (shift_id || null) : currentEmp.shift_id,
      weekly_off_id !== undefined ? (weekly_off_id || null) : currentEmp.weekly_off_id,
      geofence_id !== undefined ? (geofence_id || null) : currentEmp.geofence_id,
      finalGeofenceMode,
      finalReportsToAdmin,
      status !== undefined ? ((status === 'suspended' || status === 'disabled') ? 'disabled' : status) : null,
      empId
    );

    // Sync employee_mappings
    if (manager_id !== undefined || role !== undefined) {
      db.prepare('DELETE FROM employee_mappings WHERE employee_id = ? AND mapping_type = ?').run(empId, 'manager');
      if (finalManagerId) {
        db.prepare(`
          INSERT OR REPLACE INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
          VALUES (?, ?, ?, 'manager', ?)
        `).run(currentEmp.company_id, finalManagerId, empId, req.user.id);
      }
    }

    logAudit({
      companyId: currentEmp.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Management',
      action: 'EMPLOYEE_UPDATED',
      targetEntity: 'employees',
      targetId: empId,
      oldValues: { full_name: currentEmp.full_name, status: currentEmp.status, geofence_id: currentEmp.geofence_id, reports_to_admin: currentEmp.reports_to_admin },
      newValues: { full_name, department, designation, city, status, geofence_id, shift_id, role, reports_to_admin: finalReportsToAdmin },
      reason: 'Manual personnel update'
    });
  });

  transaction();
  res.json({ success: true, message: 'Personnel updated successfully.' });
});

// Toggle / Update Employee Account Status (active / suspended)
router.post('/:id/toggle-status', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin', 'support']), (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const { status } = req.body;

  const emp = db.prepare(`
    SELECT e.*, u.id as user_id, r.name as role_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.id = ?
  `).get(empId);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Security: Company Administrator and Super Admin accounts cannot be suspended/activated here
  if (emp.role_name === 'company_admin' || emp.role_name === 'super_admin') {
    return res.status(403).json({ error: 'Company Administrator accounts cannot be modified here. Manage them in Super Admin panel.' });
  }

  // Security: Managers can only toggle subordinate employee accounts
  if (req.user.role_name === 'manager') {
    if (emp.role_name !== 'employee' || emp.user_id === req.user.id || emp.id === req.user.employee_id) {
      return res.status(403).json({ error: 'Managers can only modify subordinate employee accounts.' });
    }
  }

  const targetStatus = status || (emp.status === 'active' ? 'suspended' : 'active');
  const dbStatus = (targetStatus === 'suspended' || targetStatus === 'disabled') ? 'disabled' : 'active';
  const userStatus = dbStatus;

  db.transaction(() => {
    db.prepare('UPDATE employees SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(dbStatus, empId);
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userStatus, emp.user_id);

    logAudit({
      companyId: emp.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Management',
      action: targetStatus === 'active' ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_SUSPENDED',
      targetEntity: 'employees',
      targetId: empId,
      newValues: { status: targetStatus },
      reason: `Account status set to ${targetStatus}`
    });
  })();

  res.json({ success: true, status: targetStatus, message: `Account for "${emp.full_name}" is now ${targetStatus}.` });
});

// Dedicated Direct Change Password for Employee
router.post('/:id/change-password', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin', 'support']), (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const { new_password, password } = req.body;
  const targetPassword = new_password || password;

  if (!targetPassword || targetPassword.trim().length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
  }

  const emp = db.prepare(`
    SELECT e.*, u.id as user_id, r.name as role_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.id = ?
  `).get(empId);
  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Security: Company Administrator and Super Admin passwords cannot be changed here
  if (emp.role_name === 'company_admin' || emp.role_name === 'super_admin') {
    return res.status(403).json({ error: 'Company Administrator passwords cannot be changed here. Reset them in Super Admin panel.' });
  }

  // Security: Managers can only change passwords for subordinate employee accounts
  if (req.user.role_name === 'manager') {
    if (emp.role_name !== 'employee' || emp.user_id === req.user.id || emp.id === req.user.employee_id) {
      return res.status(403).json({ error: 'Managers can only change passwords for subordinate employee accounts.' });
    }
  }

  const passHash = bcrypt.hashSync(targetPassword.trim(), 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passHash, emp.user_id);

  logAudit({
    companyId: emp.company_id,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Employee Management',
    action: 'EMPLOYEE_PASSWORD_CHANGED',
    targetEntity: 'users',
    targetId: emp.user_id,
    reason: `Password updated for employee ${emp.employee_id} (${emp.full_name})`
  });

  res.json({ success: true, message: `Password for "${emp.full_name}" updated successfully.` });
});

// Permanent Delete Employee (Cannot be backed up / permanently deleted from database)
router.delete('/:id', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const empId = parseInt(req.params.id, 10);
  const emp = db.prepare(`
    SELECT e.*, r.name as role_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.id = ?
  `).get(empId);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Security: Company Administrator and Super Admin accounts cannot be deleted as employees
  if (emp.role_name === 'company_admin' || emp.role_name === 'super_admin') {
    return res.status(403).json({ error: 'Company Administrator accounts cannot be deleted as employees. Manage companies in Super Admin panel.' });
  }

  // Security: Managers can only delete subordinate employees, never managers or themselves!
  if (req.user.role_name === 'manager') {
    if (emp.role_name !== 'employee' || emp.user_id === req.user.id || emp.id === req.user.employee_id) {
      return res.status(403).json({ error: 'Managers can only delete subordinate employee accounts.' });
    }
  }

  const transaction = db.transaction(() => {
    // 1. Attendance & Tracking
    try { db.prepare('DELETE FROM attendance_edit_logs WHERE attendance_record_id IN (SELECT id FROM attendance_records WHERE employee_id = ?)').run(empId); } catch(e) {}
    try { db.prepare('DELETE FROM attendance_corrections WHERE employee_id = ?').run(empId); } catch(e) {}
    db.prepare('DELETE FROM attendance_records WHERE employee_id = ?').run(empId);
    try { db.prepare('DELETE FROM location_tracking_logs WHERE employee_id = ?').run(empId); } catch(e) {}

    // 2. Leaves
    try { db.prepare('DELETE FROM leave_transactions WHERE employee_id = ?').run(empId); } catch(e) {}
    db.prepare('DELETE FROM leave_requests WHERE employee_id = ?').run(empId);
    db.prepare('DELETE FROM leave_balances WHERE employee_id = ?').run(empId);

    // 3. Service Requests / Tickets
    try { db.prepare('DELETE FROM service_request_messages WHERE ticket_id IN (SELECT id FROM service_requests WHERE employee_id = ?)').run(empId); } catch(e) {}
    db.prepare('DELETE FROM service_requests WHERE employee_id = ?').run(empId);

    // 4. Employee Mappings & Shift assignments
    db.prepare('DELETE FROM employee_mappings WHERE employee_id = ? OR manager_id = ?').run(empId, empId);
    try { db.prepare('DELETE FROM employee_profiles WHERE employee_id = ?').run(empId); } catch(e) {}
    try { db.prepare('DELETE FROM geofence_assignments WHERE employee_id = ?').run(empId); } catch(e) {}
    try { db.prepare('DELETE FROM shift_assignments WHERE employee_id = ?').run(empId); } catch(e) {}

    // 5. Devices & Notifications
    if (emp.user_id) {
      try { db.prepare('DELETE FROM employee_devices WHERE user_id = ?').run(emp.user_id); } catch(e) {}
      try { db.prepare('DELETE FROM device_binding_logs WHERE user_id = ?').run(emp.user_id); } catch(e) {}
      try { db.prepare('DELETE FROM notifications WHERE user_id = ?').run(emp.user_id); } catch(e) {}
      db.prepare('DELETE FROM users WHERE id = ?').run(emp.user_id);
    }

    // 6. Delete Employee Record
    db.prepare('DELETE FROM employees WHERE id = ?').run(empId);

    logAudit({
      companyId: emp.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Management',
      action: 'EMPLOYEE_PERMANENTLY_DELETED',
      targetEntity: 'employees',
      targetId: empId,
      oldValues: { full_name: emp.full_name, employee_id: emp.employee_id },
      reason: 'Employee and all associated records permanently removed from database'
    });
  });

  transaction();
  res.json({ success: true, message: `Employee "${emp.full_name}" has been permanently deleted from the database.` });
});

// One-Time Bulk Employee Mapping (Company Admin, Manager, Super Admin)
router.post('/bulk-mapping', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_ids, manager_id, reports_to_admin } = req.body;

  if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
    return res.status(400).json({ error: 'employee_ids must be a non-empty array of employee IDs.' });
  }

  const parsedManagerId = (manager_id === 'unchanged' || manager_id === undefined)
    ? 'unchanged'
    : (manager_id === null || manager_id === '' || manager_id === 'none' || manager_id === 0) ? null : parseInt(manager_id, 10);

  const parsedAdminReport = (reports_to_admin === 'unchanged' || reports_to_admin === undefined)
    ? 'unchanged'
    : (reports_to_admin === 1 || reports_to_admin === true || reports_to_admin === '1') ? 1 : 0;

  const transaction = db.transaction(() => {
    for (const rawId of employee_ids) {
      const eId = parseInt(rawId, 10);
      const emp = db.prepare(`
        SELECT e.id, e.company_id, r.name as role_name
        FROM employees e
        JOIN users u ON e.user_id = u.id
        JOIN roles r ON u.role_id = r.id
        WHERE e.id = ? AND e.is_deleted = 0
      `).get(eId);

      if (!emp) continue;

      // Update Manager Mapping if not unchanged
      if (parsedManagerId !== 'unchanged') {
        if (parsedManagerId === null) {
          db.prepare('UPDATE employees SET manager_id = NULL WHERE id = ?').run(eId);
          db.prepare("DELETE FROM employee_mappings WHERE employee_id = ? AND mapping_type = 'manager'").run(eId);
        } else if (parsedManagerId !== eId) {
          db.prepare('UPDATE employees SET manager_id = ? WHERE id = ?').run(parsedManagerId, eId);
          db.prepare("DELETE FROM employee_mappings WHERE employee_id = ? AND mapping_type = 'manager'").run(eId);
          db.prepare(`
            INSERT OR REPLACE INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
            VALUES (?, ?, ?, 'manager', ?)
          `).run(companyId || emp.company_id, parsedManagerId, eId, req.user.id);
        }
      }

      // Update Admin Direct Report if not unchanged
      if (parsedAdminReport !== 'unchanged') {
        db.prepare('UPDATE employees SET reports_to_admin = ? WHERE id = ?').run(parsedAdminReport, eId);
      }
    }

    logAudit({
      companyId: companyId || req.user.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Mapping',
      action: 'BULK_EMPLOYEE_MAPPING_UPDATED',
      targetEntity: 'employee_mappings',
      newValues: {
        employee_count: employee_ids.length,
        manager_id: parsedManagerId,
        reports_to_admin: parsedAdminReport
      },
      reason: `Bulk mapped ${employee_ids.length} employees`
    });
  });

  transaction();
  res.json({
    success: true,
    message: `Successfully updated reporting mappings for ${employee_ids.length} staff members.`
  });
});

// Employee Mapping: Assign to Manager
router.post('/mapping', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { supervisor_id, manager_id, role_type = 'manager', employee_ids } = req.body;
  const targetSupervisorId = supervisor_id || manager_id;

  if (!targetSupervisorId || !Array.isArray(employee_ids)) {
    return res.status(400).json({ error: 'supervisor_id and employee_ids array are required.' });
  }

  const deleteExisting = db.prepare('DELETE FROM employee_mappings WHERE manager_id = ? AND mapping_type = ?');
  const insertMapping = db.prepare(`
    INSERT INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateEmpManager = db.prepare('UPDATE employees SET manager_id = ? WHERE id = ?');

  const transaction = db.transaction(() => {
    for (const eId of employee_ids) {
      db.prepare('DELETE FROM employee_mappings WHERE employee_id = ? AND mapping_type = ?').run(eId, role_type);
      insertMapping.run(companyId, targetSupervisorId, eId, role_type, req.user.id);
      updateEmpManager.run(targetSupervisorId, eId);
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Mapping',
      action: 'EMPLOYEE_MAPPING_UPDATED',
      targetEntity: 'employee_mappings',
      newValues: { supervisor_id: targetSupervisorId, role_type, employee_ids },
      reason: `Assigned ${employee_ids.length} employees to ${role_type}`
    });
  });

  transaction();
  res.json({ success: true, message: `${employee_ids.length} employees mapped successfully.` });
});

// Remove Employee Mapping
router.delete('/mapping/:id', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const mappingId = parseInt(req.params.id, 10);
  const mapping = db.prepare('SELECT * FROM employee_mappings WHERE id = ?').get(mappingId);

  if (!mapping) {
    return res.status(404).json({ error: 'Mapping not found.' });
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM employee_mappings WHERE id = ?').run(mappingId);
    db.prepare('UPDATE employees SET manager_id = NULL WHERE id = ? AND manager_id = ?').run(mapping.employee_id, mapping.manager_id);

    logAudit({
      companyId: mapping.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Employee Mapping',
      action: 'EMPLOYEE_MAPPING_REMOVED',
      targetEntity: 'employee_mappings',
      targetId: mappingId,
      reason: 'Unmapped employee'
    });
  });

  transaction();
  res.json({ success: true, message: 'Employee mapping removed successfully.' });
});

// Download Employee Import Template
router.get('/excel/template', verifyAuth, (req, res) => {
  const buffer = generateEmployeeTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.xlsx"');
  res.send(buffer);
});

// Validate Employee Import (Excel)
router.post('/excel/import-validate', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an Excel (.xlsx) file.' });
  }

  const companyId = getTenantCompanyId(req);
  try {
    const result = validateEmployeeImport(req.file.buffer, companyId, req.user);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

// Commit Employee Import (Excel)
router.post('/excel/import-commit', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const { validRecords } = req.body;
  if (!Array.isArray(validRecords) || validRecords.length === 0) {
    return res.status(400).json({ error: 'No valid records provided for commit.' });
  }

  const companyId = getTenantCompanyId(req);
  try {
    const result = commitEmployeeImport(validRecords, companyId, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to commit import: ' + err.message });
  }
});

// Diff Preview for Employee Update (Excel) - Strictly Company Admin and Super Admin
router.post('/excel/diff-preview', verifyAuth, requireRole(['company_admin', 'super_admin']), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an Excel (.xlsx) file.' });
  }

  const companyId = getTenantCompanyId(req);
  try {
    const diffResult = diffEmployeeUpdate(req.file.buffer, companyId);
    res.json(diffResult);
  } catch (err) {
    res.status(400).json({ error: 'Failed to calculate diff: ' + err.message });
  }
});

// Commit Employee Diff Update (Excel) - Strictly Company Admin and Super Admin
router.post('/excel/diff-commit', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const { diffs } = req.body;
  if (!Array.isArray(diffs) || diffs.length === 0) {
    return res.status(400).json({ error: 'No diff items provided for update.' });
  }

  const companyId = getTenantCompanyId(req);
  try {
    const result = commitEmployeeDiffUpdate(diffs, companyId, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to commit diff updates: ' + err.message });
  }
});

module.exports = router;
