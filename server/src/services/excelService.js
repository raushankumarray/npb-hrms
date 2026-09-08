const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { logAudit } = require('./audit');

/**
 * Generates an Employee Import template workbook buffer.
 */
function generateEmployeeTemplate() {
  const sampleData = [
    {
      'Employee ID': 'EMP201',
      'Full Name': 'Rohit Sharma',
      'Username': 'rohit_sharma',
      'Password': 'User@12345',
      'Department': 'Engineering',
      'Designation': 'Software Engineer',
      'Mobile': '9876501234',
      'Email': 'rohit@company.com',
      'City': 'Mumbai',
      'Shift': 'General Morning Shift',
      'Account Status': 'active'
    },
    {
      'Employee ID': 'EMP202',
      'Full Name': 'Ananya Roy',
      'Username': 'ananya_roy',
      'Password': 'User@12345',
      'Department': 'Operations',
      'Designation': 'Operations Lead',
      'Mobile': '9876505678',
      'Email': 'ananya@company.com',
      'City': 'Delhi',
      'Shift': 'General Morning Shift',
      'Account Status': 'active'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Employee ID
    { wch: 20 }, // Full Name
    { wch: 18 }, // Username
    { wch: 15 }, // Password
    { wch: 18 }, // Department
    { wch: 22 }, // Designation
    { wch: 15 }, // Mobile
    { wch: 25 }, // Email
    { wch: 16 }, // City
    { wch: 22 }, // Shift
    { wch: 15 }  // Account Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Employees Template');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Validates and previews uploaded employee Excel file.
 */
function validateEmployeeImport(buffer, companyId) {
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

  // Pre-fetch existing employee codes and usernames in company and globally
  const existingEmployees = db.prepare('SELECT id, employee_id, full_name, user_id FROM employees WHERE company_id = ?').all(companyId);
  const existingEmpMap = new Map(existingEmployees.map(e => [e.employee_id.toUpperCase(), e]));
  const existingUsers = new Set(db.prepare('SELECT UPPER(username) as u FROM users').all().map(u => u.u));

  // Pre-fetch active shifts for company
  const shifts = db.prepare('SELECT id, name FROM shifts WHERE company_id = ?').all(companyId);
  const shiftMap = new Map(shifts.map(s => [s.name.toLowerCase().trim(), s.id]));
  const defaultShift = shifts[0] ? shifts[0].id : null;

  // Pre-fetch default weekly off
  const defaultWOff = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(companyId);
  const weeklyOffId = defaultWOff ? defaultWOff.id : null;

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const rowErrors = [];

    const empId = String(row['Employee ID'] || '').trim();
    const fullName = String(row['Full Name'] || '').trim();
    const username = String(row['Username'] || '').trim();
    const password = String(row['Password'] || 'User@12345').trim();
    const department = String(row['Department'] || 'General').trim();
    const designation = String(row['Designation'] || 'Staff').trim();
    const mobile = String(row['Mobile'] || '').trim();
    const email = String(row['Email'] || '').trim();
    const city = String(row['City'] || '').trim();
    const shiftName = String(row['Shift'] || '').trim().toLowerCase();
    const status = (String(row['Account Status'] || 'active').toLowerCase() === 'disabled') ? 'disabled' : 'active';

    if (!empId) {
      rowErrors.push('Employee ID is required.');
    } else if (seenEmployeeIds.has(empId.toUpperCase())) {
      rowErrors.push(`Duplicate Employee ID "${empId}" in file.`);
      summary.duplicateRows++;
    }

    if (!fullName) {
      rowErrors.push('Full Name is required.');
    }

    if (!username) {
      rowErrors.push('Username is required.');
    } else if (seenUsernames.has(username.toUpperCase())) {
      rowErrors.push(`Duplicate Username "${username}" in file.`);
    }

    const isExisting = existingEmpMap.has(empId.toUpperCase());

    // If new user, check if username already exists in database
    if (!isExisting && existingUsers.has(username.toUpperCase())) {
      rowErrors.push(`Username "${username}" already exists in system.`);
    }

    if (rowErrors.length > 0) {
      summary.invalidRows++;
      errors.push({ row: rowNum, employeeId: empId, errors: rowErrors });
    } else {
      seenEmployeeIds.add(empId.toUpperCase());
      seenUsernames.add(username.toUpperCase());
      summary.validRows++;

      if (isExisting) {
        summary.existingEmployees++;
      } else {
        summary.newEmployees++;
      }

      const shiftId = shiftMap.get(shiftName) || defaultShift;

      validRecords.push({
        rowNum,
        empId,
        fullName,
        username,
        password,
        department,
        designation,
        mobile,
        email,
        city,
        shiftId,
        weeklyOffId,
        status,
        isExisting,
        existingId: isExisting ? existingEmpMap.get(empId.toUpperCase()).id : null
      });
    }
  });

  return { summary, validRecords, errors };
}

/**
 * Commits employee import to database inside an ACID transaction.
 */
function commitEmployeeImport(validRecords, companyId, adminUser) {
  const roleEmployee = db.prepare("SELECT id FROM roles WHERE name = 'employee'").get();
  const currentYear = new Date().getFullYear();

  const leaveTypes = db.prepare('SELECT id, name FROM leave_types WHERE company_id = ?').all(companyId);

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, email, role_id, company_id, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEmp = db.prepare(`
    INSERT INTO employees (
      company_id, user_id, employee_id, full_name, mobile, email, department, designation,
      city, shift_id, weekly_off_id, manager_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateEmp = db.prepare(`
    UPDATE employees SET
      full_name = ?, mobile = ?, email = ?, department = ?, designation = ?,
      city = COALESCE(?, city), shift_id = COALESCE(?, shift_id), status = ?, updated_at = CURRENT_TIMESTAMP
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

  const transaction = db.transaction(() => {
    for (const r of validRecords) {
      if (r.isExisting) {
        updateEmp.run(r.fullName, r.mobile, r.email, r.department, r.designation, r.city || null, r.shiftId, r.status, r.existingId);
        updatedCount++;
      } else {
        const passHash = bcrypt.hashSync(r.password, 10);
        const userRes = insertUser.run(r.username, passHash, r.email, roleEmployee.id, companyId, r.status);
        const empRes = insertEmp.run(
          companyId, userRes.lastInsertRowid, r.empId, r.fullName, r.mobile, r.email,
          r.department, r.designation, r.city || '', r.shiftId, r.weeklyOffId, managerEmpId, r.status
        );

        const empDbId = empRes.lastInsertRowid;

        // If imported by manager, auto-map to this manager
        if (isManager && managerEmpId) {
          insertMapping.run(companyId, managerEmpId, empDbId, adminUser.id);
        }

        // Seed initial leave balances
        leaveTypes.forEach(lt => {
          let quota = 12.0;
          if (lt.name.includes('Earned')) quota = 15.0;
          else if (lt.name.includes('Paid')) quota = 10.0;
          insertLeaveBal.run(empDbId, lt.id, currentYear, quota, quota);
        });

        createdCount++;
      }
    }

    logAudit({
      companyId,
      userId: adminUser.id,
      userName: adminUser.username,
      role: adminUser.role_name,
      panel: 'HR/Admin Excel Import',
      action: 'EXCEL_EMPLOYEE_IMPORT',
      targetEntity: 'employees',
      newValues: { created: createdCount, updated: updatedCount, total: validRecords.length },
      reason: 'Batch employee import via Excel'
    });
  });

  transaction();
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
    const empId = String(row['Employee ID'] || '').trim();
    if (!empId) return;

    const existing = empMap.get(empId.toUpperCase());
    if (!existing) {
      notFound.push({ row: idx + 2, employeeId: empId, reason: 'Employee ID not found in current company.' });
      return;
    }

    const fieldChanges = [];
    const checkFields = [
      { key: 'Full Name', current: existing.full_name, field: 'full_name' },
      { key: 'Department', current: existing.department, field: 'department' },
      { key: 'Designation', current: existing.designation, field: 'designation' },
      { key: 'Mobile', current: existing.mobile, field: 'mobile' },
      { key: 'Email', current: existing.email, field: 'email' },
      { key: 'City', current: existing.city, field: 'city' },
      { key: 'Account Status', current: existing.status, field: 'status' }
    ];

    checkFields.forEach(f => {
      const newVal = String(row[f.key] || '').trim();
      if (newVal && newVal !== (existing[f.field] || '')) {
        fieldChanges.push({
          field: f.key,
          dbField: f.field,
          oldValue: existing[f.field] || '(Empty)',
          newValue: newVal
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
