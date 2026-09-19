const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { logAudit } = require('./audit');

/**
 * Generates an Employee Import template workbook buffer.
 */
/**
 * Generates an Employee/Personnel Import template workbook buffer.
 * Mandatory fields (4): Full Name *, Username *, Password *, Role *
 * Optional fields: Employee ID, Department, Designation, Mobile, Email, City, Shift, Reports To, Account Status
 */
function generateEmployeeTemplate() {
  const sampleData = [
    {
      'Full Name *': 'Rohit Sharma',
      'Username *': 'rohit_sharma',
      'Password *': 'User@12345',
      'Role *': 'Employee',
      'Employee ID': 'EMP201',
      'Department': 'Engineering',
      'Designation': 'Software Engineer',
      'Mobile': '9876501234',
      'Email': 'rohit@company.com',
      'City': 'Mumbai',
      'Shift': 'General Morning Shift',
      'Reports To': 'Admin',
      'Account Status': 'active'
    },
    {
      'Full Name *': 'Ananya Roy',
      'Username *': 'ananya_roy',
      'Password *': 'User@12345',
      'Role *': 'Manager',
      'Employee ID': 'MGR101',
      'Department': 'Operations',
      'Designation': 'Operations Lead',
      'Mobile': '9876505678',
      'Email': 'ananya@company.com',
      'City': 'Delhi',
      'Shift': 'General Morning Shift',
      'Reports To': 'Admin',
      'Account Status': 'active'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // Full Name *
    { wch: 18 }, // Username *
    { wch: 15 }, // Password *
    { wch: 15 }, // Role *
    { wch: 15 }, // Employee ID (Optional)
    { wch: 18 }, // Department (Optional)
    { wch: 22 }, // Designation (Optional)
    { wch: 15 }, // Mobile (Optional)
    { wch: 25 }, // Email (Optional)
    { wch: 16 }, // City (Optional)
    { wch: 22 }, // Shift (Optional)
    { wch: 18 }, // Reports To (Optional)
    { wch: 15 }  // Account Status (Optional)
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Personnel Template');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Validates and previews uploaded personnel Excel file.
 * Only 4 fields are mandatory: Full Name, Username, Password, Role (Employee/Manager).
 * All other fields are optional.
 */
function validateEmployeeImport(buffer, companyId, user = null) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const summary = {
    totalRows: rows.length,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    newEmployees: 0,
    existingEmployees: 0
  };

  const validRecords = [];
  const errors = [];
  const seenEmployeeIds = new Set();
  const seenUsernames = new Set();

  // Pre-fetch existing employee codes and usernames in this company
  const existingEmpRows = db.prepare(`
    SELECT e.id, e.employee_id, e.user_id, u.username, r.name as role_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE e.company_id = ? AND e.is_deleted = 0
  `).all(companyId);

  const existingEmpByCode = new Map();
  const existingEmpByUsername = new Map();
  existingEmpRows.forEach(e => {
    if (e.employee_id) existingEmpByCode.set(e.employee_id.toUpperCase(), e);
    if (e.username) existingEmpByUsername.set(e.username.toUpperCase(), e);
  });

  const existingUsers = new Set(db.prepare('SELECT username FROM users WHERE is_deleted = 0').all().map(u => u.username.toUpperCase()));

  const shifts = db.prepare('SELECT id, name FROM shifts WHERE company_id = ?').all(companyId);
  const shiftMap = new Map(shifts.map(s => [s.name.toLowerCase(), s.id]));
  const defaultShift = shifts[0]?.id || null;

  const defaultWeeklyOff = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(companyId);
  const weeklyOffId = defaultWeeklyOff?.id || null;

  // Active managers in company for "Reports To" lookup
  const managers = db.prepare(`
    SELECT e.id, e.employee_id, u.username, e.full_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.company_id = ? AND r.name = 'manager' AND e.is_deleted = 0
  `).all(companyId);
  const managerMap = new Map();
  managers.forEach(m => {
    if (m.username) managerMap.set(m.username.toLowerCase(), m.id);
    if (m.employee_id) managerMap.set(m.employee_id.toLowerCase(), m.id);
    if (m.full_name) managerMap.set(m.full_name.toLowerCase(), m.id);
  });

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const rowErrors = [];

    // ONLY 4 MANDATORY FIELDS:
    const fullName = String(row['Full Name *'] || row['Full Name'] || row['Name *'] || row['Name'] || '').trim();
    const username = String(row['Username *'] || row['Username'] || '').trim();
    const password = String(row['Password *'] || row['Password'] || 'User@12345').trim();
    const rawRole = String(row['Role *'] || row['Role'] || row['Type *'] || row['Type'] || row['Position *'] || row['Position'] || 'Employee').trim();
    const role = rawRole.toLowerCase().includes('manag') ? 'manager' : 'employee';

    // OPTIONAL FIELDS:
    const rawEmpId = String(row['Employee ID'] || row['Employee ID *'] || row['Emp ID'] || '').trim();
    const department = String(row['Department'] || (role === 'manager' ? 'Management' : 'Operations')).trim();
    const designation = String(row['Designation'] || (role === 'manager' ? 'Team Manager' : 'Associate')).trim();
    const mobile = String(row['Mobile'] || row['Phone'] || '').trim();
    const email = String(row['Email'] || '').trim();
    const city = String(row['City'] || row['Location'] || '').trim();
    const shiftName = String(row['Shift'] || '').trim().toLowerCase();
    const reportsToRaw = String(row['Reports To'] || row['Reporting Manager'] || '').trim().toLowerCase();
    const statusRaw = String(row['Account Status'] || row['Status'] || 'active').trim().toLowerCase();
    const status = (statusRaw === 'disabled' || statusRaw === 'suspended' || statusRaw === 'inactive') ? 'disabled' : 'active';

    if (!fullName) {
      rowErrors.push('Full Name is required.');
    }

    if (!username) {
      rowErrors.push('Username is required.');
    } else if (seenUsernames.has(username.toUpperCase())) {
      rowErrors.push(`Duplicate Username "${username}" in file.`);
    }

    if (!password) {
      rowErrors.push('Password is required.');
    }

    // Check Employee ID duplicates in file only if provided
    if (rawEmpId) {
      if (seenEmployeeIds.has(rawEmpId.toUpperCase())) {
        rowErrors.push(`Duplicate Employee ID "${rawEmpId}" in file.`);
        summary.duplicateRows++;
      }
    }

    // Check if employee exists by Employee ID or by Username
    let existingRecord = null;
    if (rawEmpId && existingEmpByCode.has(rawEmpId.toUpperCase())) {
      existingRecord = existingEmpByCode.get(rawEmpId.toUpperCase());
    } else if (username && existingEmpByUsername.has(username.toUpperCase())) {
      existingRecord = existingEmpByUsername.get(username.toUpperCase());
    }

    const isExisting = !!existingRecord;

    // Manager role restriction: managers can only add team members, cannot edit existing records
    if (isExisting && user && user.role_name === 'manager') {
      rowErrors.push(`Managers can only add new personnel via Excel. Record "${username}" already exists.`);
    }

    // If new employee, check if username already belongs to another user
    if (!isExisting && existingUsers.has(username.toUpperCase())) {
      rowErrors.push(`Username "${username}" already exists in the system.`);
    }

    if (rowErrors.length > 0) {
      summary.invalidRows++;
      errors.push({ row: rowNum, employeeId: rawEmpId || username, errors: rowErrors });
    } else {
      if (rawEmpId) seenEmployeeIds.add(rawEmpId.toUpperCase());
      seenUsernames.add(username.toUpperCase());
      summary.validRows++;

      if (isExisting) {
        summary.existingEmployees++;
      } else {
        summary.newEmployees++;
      }

      const shiftId = shiftMap.get(shiftName) || defaultShift;

      // Determine reporting manager
      let targetManagerId = null;
      let reportsToAdmin = role === 'manager' ? 1 : 0;
      if (reportsToRaw && reportsToRaw !== 'admin' && reportsToRaw !== 'company admin') {
        targetManagerId = managerMap.get(reportsToRaw) || null;
      }
      if (!targetManagerId && reportsToRaw.includes('admin')) {
        reportsToAdmin = 1;
      }

      validRecords.push({
        rowNum,
        empId: rawEmpId, // Optional; kept as provided or null
        fullName,
        username,
        password,
        role,
        department,
        designation,
        mobile,
        email,
        city,
        shiftId,
        weeklyOffId,
        reportsToAdmin,
        managerId: targetManagerId,
        status,
        isExisting,
        existingId: isExisting ? existingRecord.id : null,
        existingUserId: isExisting ? existingRecord.user_id : null
      });
    }
  });

  return { summary, validRecords, errors };
}

/**
 * Commits employee/personnel import to database inside an ACID transaction.
 * Dynamically assigns role (employee or manager), supports optional fields, and dual-syncs to Firebase.
 */
function commitEmployeeImport(validRecords, companyId, adminUser) {
  const roleEmployee = db.prepare("SELECT id FROM roles WHERE name = 'employee'").get();
  const roleManager = db.prepare("SELECT id FROM roles WHERE name = 'manager'").get();
  const currentYear = new Date().getFullYear();

  const leaveTypes = db.prepare('SELECT id, name FROM leave_types WHERE company_id = ?').all(companyId);

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, email, role_id, company_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateUser = db.prepare(`
    UPDATE users SET email = COALESCE(?, email), status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const insertEmp = db.prepare(`
    INSERT INTO employees (
      company_id, user_id, employee_id, full_name, mobile, email, department, designation,
      city, shift_id, weekly_off_id, manager_id, reports_to_admin, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateEmp = db.prepare(`
    UPDATE employees SET
      full_name = ?, mobile = ?, email = ?, department = ?, designation = ?,
      city = COALESCE(?, city), shift_id = COALESCE(?, shift_id), status = ?,
      manager_id = COALESCE(?, manager_id), reports_to_admin = COALESCE(?, reports_to_admin),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const insertLeaveBal = db.prepare(`
    INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
    VALUES (?, ?, ?, ?, 0, 0, ?)
  `);

  const insertMapping = db.prepare(`
    INSERT OR REPLACE INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
    VALUES (?, ?, ?, 'manager', ?)
  `);

  const isManager = adminUser.role_name === 'manager';
  const managerEmpId = isManager ? adminUser.employee_id : null;

  let createdCount = 0;
  let updatedCount = 0;
  const createdOrUpdatedEmpIds = [];

  const transaction = db.transaction(() => {
    validRecords.forEach((r, idx) => {
      if (r.isExisting) {
        if (!isManager) {
          updateEmp.run(
            r.fullName, r.mobile, r.email, r.department, r.designation,
            r.city || null, r.shiftId, r.status,
            r.managerId || null, r.reportsToAdmin,
            r.existingId
          );
          if (r.existingUserId) {
            updateUser.run(r.email || null, r.status, r.existingUserId);
          }
          createdOrUpdatedEmpIds.push(r.existingId);
          updatedCount++;
        }
      } else {
        const passHash = bcrypt.hashSync(r.password, 10);
        const roleId = r.role === 'manager' ? (roleManager?.id || 4) : (roleEmployee?.id || 5);
        const userRes = insertUser.run(r.username, passHash, r.email, roleId, companyId, r.status);
        
        // Final employee ID: optional; keep provided or null
        const finalEmpCode = r.empId || null;
        const finalManagerId = isManager ? managerEmpId : (r.managerId || null);
        const finalReportsToAdmin = r.role === 'manager' ? 1 : (r.reportsToAdmin || 0);

        const empRes = insertEmp.run(
          companyId, userRes.lastInsertRowid, finalEmpCode, r.fullName, r.mobile, r.email,
          r.department, r.designation, r.city || '', r.shiftId, r.weeklyOffId,
          finalManagerId, finalReportsToAdmin, r.status
        );

        const empDbId = empRes.lastInsertRowid;
        createdOrUpdatedEmpIds.push(empDbId);

        // If imported by manager or assigned to manager, auto-map
        if (finalManagerId) {
          insertMapping.run(companyId, finalManagerId, empDbId, adminUser.id);
        }

        // Seed initial leave balances (strictly CL and EL)
        const { autoCreditEmployeeLeaves } = require('./leaveService');
        autoCreditEmployeeLeaves(empDbId, companyId, adminUser.id);

        createdCount++;
      }
    });

    logAudit({
      companyId,
      userId: adminUser.id,
      userName: adminUser.username,
      role: adminUser.role_name,
      panel: 'HR/Admin Excel Import',
      action: 'EXCEL_EMPLOYEE_IMPORT',
      targetEntity: 'employees',
      newValues: { created: createdCount, updated: updatedCount, total: validRecords.length },
      reason: 'Batch personnel import via Excel'
    });
  });

  transaction();

  // Async sync to Firebase without blocking
  try {
    const { syncEmployee, syncUser, syncEmployeeMapping, syncLeaveBalance } = require('./firebase');
    createdOrUpdatedEmpIds.forEach(empId => {
      const empRecord = db.prepare('SELECT e.*, u.username, c.name as company_name FROM employees e JOIN users u ON e.user_id = u.id JOIN companies c ON e.company_id = c.id WHERE e.id = ?').get(empId);
      if (empRecord) {
        syncEmployee(empRecord).catch(() => {});
        const userRecord = db.prepare('SELECT u.*, r.name as role_name, c.name as company_name FROM users u JOIN roles r ON u.role_id = r.id JOIN companies c ON u.company_id = c.id WHERE u.id = ?').get(empRecord.user_id);
        if (userRecord) syncUser(userRecord).catch(() => {});
        if (empRecord.manager_id) {
          const mapRecord = db.prepare('SELECT * FROM employee_mappings WHERE manager_id = ? AND employee_id = ?').get(empRecord.manager_id, empId);
          if (mapRecord) syncEmployeeMapping(mapRecord).catch(() => {});
        }
        const balRecords = db.prepare('SELECT * FROM leave_balances WHERE employee_id = ?').all(empId);
        balRecords.forEach(lb => syncLeaveBalance(lb).catch(() => {}));
      }
    });
  } catch (e) {
    console.warn('Firebase sync notice during Excel import:', e.message);
  }

  return { success: true, createdCount, updatedCount };
}

/**
 * Calculates differences between existing employee records and the uploaded Excel file for preview.
 */
function diffEmployeeUpdate(buffer, companyId) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const existingList = db.prepare(`
    SELECT e.*, u.username, s.name as shift_name
    FROM employees e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    WHERE e.company_id = ? AND e.is_deleted = 0
  `).all(companyId);

  const empMap = new Map(existingList.map(e => [e.employee_id.toUpperCase(), e]));

  const diffs = [];
  let changedCount = 0;
  let unchangedCount = 0;
  const notFound = [];

  rows.forEach((row, idx) => {
    const empId = String(row['Employee ID'] || row['Employee ID *'] || row['Emp ID'] || '').trim();
    if (!empId) return;

    const existing = empMap.get(empId.toUpperCase());
    if (!existing) {
      notFound.push({ row: idx + 2, employeeId: empId, reason: 'Employee ID not found in current company.' });
      return;
    }

    const fieldChanges = [];
    const checkFields = [
      { key: 'Full Name', aliases: ['Full Name *', 'Full Name', 'Name *', 'Name'], current: existing.full_name, field: 'full_name' },
      { key: 'Department', aliases: ['Department'], current: existing.department, field: 'department' },
      { key: 'Designation', aliases: ['Designation'], current: existing.designation, field: 'designation' },
      { key: 'Mobile', aliases: ['Mobile', 'Phone'], current: existing.mobile, field: 'mobile' },
      { key: 'Email', aliases: ['Email'], current: existing.email, field: 'email' },
      { key: 'City', aliases: ['City', 'Location'], current: existing.city, field: 'city' },
      { key: 'Account Status', aliases: ['Account Status', 'Status'], current: existing.status, field: 'status' }
    ];

    checkFields.forEach(f => {
      let rawVal = '';
      for (const a of f.aliases) {
        if (row[a] !== undefined && row[a] !== '') {
          rawVal = String(row[a]).trim();
          break;
        }
      }
      if (rawVal && rawVal !== (existing[f.field] || '')) {
        fieldChanges.push({
          field: f.key,
          dbField: f.field,
          oldValue: existing[f.field] || '(Empty)',
          newValue: rawVal
        });
      }
    });

    if (fieldChanges.length > 0) {
      changedCount++;
      diffs.push({
        id: existing.id,
        employeeId: existing.employee_id,
        fullName: existing.full_name,
        changes: fieldChanges
      });
    } else {
      unchangedCount++;
    }
  });

  return {
    totalRows: rows.length,
    changedCount,
    unchangedCount,
    notFound,
    diffs
  };
}

/**
 * Commits approved diff updates into database.
 */
function commitEmployeeDiffUpdate(diffs, companyId, adminUser) {
  const updateStmt = db.prepare(`
    UPDATE employees SET
      full_name = COALESCE(?, full_name),
      department = COALESCE(?, department),
      designation = COALESCE(?, designation),
      mobile = COALESCE(?, mobile),
      email = COALESCE(?, email),
      city = COALESCE(?, city),
      status = COALESCE(?, status),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `);

  let updated = 0;
  const transaction = db.transaction(() => {
    for (const d of diffs) {
      const changeMap = {};
      d.changes.forEach(c => {
        changeMap[c.dbField] = c.newValue;
      });

      updateStmt.run(
        changeMap.full_name || null,
        changeMap.department || null,
        changeMap.designation || null,
        changeMap.mobile || null,
        changeMap.email || null,
        changeMap.city || null,
        changeMap.status || null,
        d.id,
        companyId
      );

      // Audit every employee update
      logAudit({
        companyId,
        userId: adminUser.id,
        userName: adminUser.username,
        role: adminUser.role_name,
        panel: 'HR/Admin Excel Update',
        action: 'EXCEL_EMPLOYEE_UPDATE',
        targetEntity: 'employees',
        targetId: d.employeeId,
        oldValues: d.changes.map(c => ({ [c.field]: c.oldValue })),
        newValues: d.changes.map(c => ({ [c.field]: c.newValue })),
        reason: 'Master Data Excel Diff Update'
      });

      updated++;
    }
  });

  transaction();
  return { success: true, updated };
}

/**
 * Attendance Excel Template & Update
 */
function generateAttendanceTemplate(companyId) {
  const employees = db.prepare(`
    SELECT employee_id, full_name, department FROM employees
    WHERE company_id = ? AND is_deleted = 0 AND status = 'active'
    LIMIT 10
  `).all(companyId);

  const sampleRows = employees.map(e => ({
    'Employee ID': e.employee_id,
    'Employee Name': e.full_name,
    'Date': new Date().toISOString().split('T')[0],
    'Punch In': '09:00:00',
    'Punch Out': '18:00:00',
    'Latitude': '28.4950',
    'Longitude': '77.0890',
    'Location Name': 'Cyber City Office',
    'Attendance Status': 'Present',
    'Remarks': 'Batch attendance sync'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows.length ? sampleRows : [{
    'Employee ID': 'EMP001',
    'Employee Name': 'Sample Name',
    'Date': '2026-09-07',
    'Punch In': '09:00:00',
    'Punch Out': '18:00:00',
    'Latitude': '28.4950',
    'Longitude': '77.0890',
    'Location Name': 'Office',
    'Attendance Status': 'Present',
    'Remarks': ''
  }]);

  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Update Template');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function validateAttendanceImport(buffer, companyId) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const empMap = new Map(
    db.prepare('SELECT id, employee_id, full_name, shift_id FROM employees WHERE company_id = ?').all(companyId)
      .map(e => [e.employee_id.toUpperCase(), e])
  );

  const validRows = [];
  const errors = [];

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const empId = String(r['Employee ID'] || '').trim().toUpperCase();
    const date = String(r['Date'] || '').trim();
    const punchIn = String(r['Punch In'] || '').trim();
    const punchOut = String(r['Punch Out'] || '').trim();
    const status = String(r['Attendance Status'] || 'Present').trim();
    const remarks = String(r['Remarks'] || 'Excel sync').trim();
    const lat = parseFloat(r['Latitude'] || '0');
    const lng = parseFloat(r['Longitude'] || '0');
    const locName = String(r['Location Name'] || 'Office').trim();

    const rowErrors = [];
    if (!empId) rowErrors.push('Employee ID missing.');
    else if (!empMap.has(empId)) rowErrors.push(`Employee ID "${empId}" does not belong to this company.`);

    if (!date || isNaN(Date.parse(date))) rowErrors.push('Invalid Date format. Use YYYY-MM-DD.');

    const allowedStatuses = ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekly Off', 'Missing Punch In', 'Missing Punch Out'];
    if (!allowedStatuses.includes(status)) {
      rowErrors.push(`Invalid status "${status}". Allowed: ${allowedStatuses.join(', ')}`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, employeeId: empId, errors: rowErrors });
    } else {
      const emp = empMap.get(empId);
      validRows.push({
        rowNum,
        employeeDbId: emp.id,
        employeeCode: empId,
        fullName: emp.full_name,
        shiftId: emp.shift_id,
        date,
        punchIn,
        punchOut,
        lat,
        lng,
        locName,
        status,
        remarks
      });
    }
  });

  return {
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: errors.length,
    validRows,
    errors
  };
}

function commitAttendanceImport(validRows, companyId, adminUser) {
  const upsertStmt = db.prepare(`
    INSERT INTO attendance_records (
      company_id, employee_id, date, punch_in_time, punch_out_time,
      punch_in_lat, punch_in_lng, punch_in_location,
      punch_out_lat, punch_out_lng, punch_out_location,
      total_hours, status, shift_id, remarks, is_edited
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
    ) ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
      punch_in_time = excluded.punch_in_time,
      punch_out_time = excluded.punch_out_time,
      punch_in_lat = excluded.punch_in_lat,
      punch_in_lng = excluded.punch_in_lng,
      punch_in_location = excluded.punch_in_location,
      punch_out_lat = excluded.punch_out_lat,
      punch_out_lng = excluded.punch_out_lng,
      punch_out_location = excluded.punch_out_location,
      total_hours = excluded.total_hours,
      status = excluded.status,
      remarks = excluded.remarks,
      is_edited = 1,
      updated_at = CURRENT_TIMESTAMP
  `);

  let count = 0;
  const transaction = db.transaction(() => {
    for (const r of validRows) {
      let hours = 8.0;
      if (r.punchIn && r.punchOut) {
        const [h1, m1] = r.punchIn.split(':').map(Number);
        const [h2, m2] = r.punchOut.split(':').map(Number);
        const diffMinutes = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
        if (diffMinutes > 0) hours = Math.round((diffMinutes / 60) * 100) / 100;
      }

      upsertStmt.run(
        companyId, r.employeeDbId, r.date, r.punchIn || null, r.punchOut || null,
        r.lat || null, r.lng || null, r.locName || null,
        r.lat || null, r.lng || null, r.locName || null,
        hours, r.status, r.shiftId, r.remarks
      );

      count++;
    }

    logAudit({
      companyId,
      userId: adminUser.id,
      userName: adminUser.username,
      role: adminUser.role_name,
      panel: 'Attendance Excel Upload',
      action: 'EXCEL_ATTENDANCE_UPDATE',
      targetEntity: 'attendance_records',
      newValues: { updatedRecords: count },
      reason: 'Batch Attendance Excel Import'
    });
  });

  transaction();
  return { success: true, count };
}

module.exports = {
  generateEmployeeTemplate,
  validateEmployeeImport,
  commitEmployeeImport,
  diffEmployeeUpdate,
  commitEmployeeDiffUpdate,
  generateAttendanceTemplate,
  validateAttendanceImport,
  commitAttendanceImport
};
