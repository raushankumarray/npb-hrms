const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

function seedDatabase() {
  console.log('Initializing NPB HRMS database...');

  // Run dynamic schema migrations for existing databases first
  try {
    const empCols = db.prepare("PRAGMA table_info(employees)").all();
    if (empCols.length > 0 && !empCols.some(c => c.name === 'hr_id')) {
      db.prepare("ALTER TABLE employees ADD COLUMN hr_id INTEGER").run();
      console.log('Migration: Added hr_id column to employees.');
    }
    const mapCols = db.prepare("PRAGMA table_info(employee_mappings)").all();
    if (mapCols.length > 0 && !mapCols.some(c => c.name === 'mapping_type')) {
      db.prepare("ALTER TABLE employee_mappings ADD COLUMN mapping_type TEXT DEFAULT 'manager'").run();
      console.log('Migration: Added mapping_type column to employee_mappings.');
    }
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    if (userCols.length > 0 && !userCols.some(c => c.name === 'mobile')) {
      db.prepare("ALTER TABLE users ADD COLUMN mobile TEXT").run();
      console.log('Migration: Added mobile column to users.');
    }
    if (empCols.length > 0 && !empCols.some(c => c.name === 'reports_to_admin')) {
      db.prepare("ALTER TABLE employees ADD COLUMN reports_to_admin INTEGER DEFAULT 0").run();
      console.log('Migration: Added reports_to_admin column to employees.');
    }
    if (empCols.length > 0 && !empCols.some(c => c.name === 'city')) {
      db.prepare("ALTER TABLE employees ADD COLUMN city TEXT DEFAULT ''").run();
      console.log('Migration: Added city column to employees.');
    }
    // Migration: Allow blank employee_id by making it nullable with partial unique index
    const empIdCol = empCols.find(c => c.name === 'employee_id');
    if (empIdCol && empIdCol.notnull === 1) {
      db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        CREATE TABLE employees_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL,
          user_id INTEGER UNIQUE NOT NULL,
          employee_id TEXT,
          full_name TEXT NOT NULL,
          mobile TEXT,
          email TEXT,
          department TEXT,
          designation TEXT,
          manager_id INTEGER,
          hr_id INTEGER,
          shift_id INTEGER,
          weekly_off_id INTEGER,
          geofence_id INTEGER,
          geofence_mode TEXT DEFAULT 'company' CHECK(geofence_mode IN ('company', 'custom', 'none')),
          reports_to_admin INTEGER DEFAULT 0,
          city TEXT DEFAULT '',
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'banned', 'deleted')),
          is_deleted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
          FOREIGN KEY (weekly_off_id) REFERENCES weekly_off_settings(id) ON DELETE SET NULL,
          FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE SET NULL,
          FOREIGN KEY (hr_id) REFERENCES employees(id) ON DELETE SET NULL
        );
        INSERT INTO employees_migrated (
          id, company_id, user_id, employee_id, full_name, mobile, email, department, designation,
          manager_id, hr_id, shift_id, weekly_off_id, geofence_id, geofence_mode, reports_to_admin,
          city, status, is_deleted, created_at, updated_at
        ) SELECT
          id, company_id, user_id, employee_id, full_name, mobile, email, department, designation,
          manager_id, hr_id, shift_id, weekly_off_id, geofence_id, geofence_mode, reports_to_admin,
          city, status, is_deleted, created_at, updated_at
        FROM employees;
        DROP TABLE employees;
        ALTER TABLE employees_migrated RENAME TO employees;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_emp_id ON employees(company_id, employee_id) WHERE employee_id IS NOT NULL AND employee_id != '';
        CREATE INDEX IF NOT EXISTS idx_employees_lookup ON employees(company_id, employee_id);
        CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
        CREATE INDEX IF NOT EXISTS idx_employees_hr ON employees(hr_id);
        COMMIT;
        PRAGMA foreign_keys=on;
      `);
      console.log('Migration: Successfully made employees.employee_id nullable with partial unique index.');
    }
    // Clean up generic Paid Leave (PL) so strictly CL and EL remain
    db.prepare("DELETE FROM leave_types WHERE name LIKE '%Paid Leave%'").run();
  } catch (migErr) {
    console.warn('Migration note:', migErr.message);
  }
  
  // Read and execute schema
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schemaSql);
  console.log('Schema created successfully.');

  // Check if super admin already exists
  const existingAdmin = db.prepare("SELECT * FROM users WHERE username = 'adminn'").get();
  if (existingAdmin) {
    console.log('Database already seeded. Skipping initial seed.');
    return;
  }

  const runInTransaction = db.transaction(() => {
    // 1. Seed Roles
    const insertRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
    const roles = [
      ['super_admin', 'Global System Super Administrator with all permissions'],
      ['support', 'Multi-tenant Technical & Operations Support User'],
      ['company_admin', 'Company Administrator with full tenant authority'],
      ['manager', 'Department Manager handling Approvals and My Employees'],
      ['employee', 'Standard Employee punching attendance and viewing records']
    ];
    roles.forEach(([name, desc]) => insertRole.run(name, desc));

    const roleMap = {};
    db.prepare('SELECT id, name FROM roles').all().forEach(r => {
      roleMap[r.name] = r.id;
    });

    // 2. Seed Super Admin (Username: adminn, Password: Admin@88)
    const adminPasswordHash = bcrypt.hashSync('Admin@88', 10);
    const superAdminUser = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, NULL, 'active')
    `).run('adminn', adminPasswordHash, 'superadmin@npbhrms.com', roleMap['super_admin']);

    db.prepare(`
      INSERT INTO super_admins (user_id, full_name)
      VALUES (?, ?)
    `).run(superAdminUser.lastInsertRowid, 'NPB System Administrator');

    console.log('Super Admin account created: username "adminn"');

    // 3. Seed Support User (Level 3 - Advanced Support)
    const supportPasswordHash = bcrypt.hashSync('Support@123', 10);
    const supportUser = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, NULL, 'active')
    `).run('support_rahul', supportPasswordHash, 'rahul.support@npbhrms.com', roleMap['support']);

    const supportProfile = db.prepare(`
      INSERT INTO support_users (user_id, full_name, permission_level, device_status)
      VALUES (?, ?, 3, 'active')
    `).run(supportUser.lastInsertRowid, 'Rahul Verma (Support)');

    const insertSupportPerm = db.prepare('INSERT INTO support_permissions (support_user_id, permission_name, granted_by) VALUES (?, ?, ?)');
    ['view_companies', 'edit_employee', 'correct_attendance', 'process_passwords', 'unbind_device', 'account_support'].forEach(p => {
      insertSupportPerm.run(supportProfile.lastInsertRowid, p, superAdminUser.lastInsertRowid);
    });

    // 4. Seed Companies
    const insertCompany = db.prepare(`
      INSERT INTO companies (name, portal_name, code, email, phone, address, logo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    const comp1 = insertCompany.run('NPB Attendance Solutions', 'NPB Attendance Portal', 'NPB01', 'contact@npbattendance.com', '+91 9876543210', 'Plot 42, Cyber City, Gurugram, Haryana', null);
    const comp2 = insertCompany.run('BSES Yamuna Power Ltd', 'BSES HR Portal', 'BSES01', 'hr@bsesdelhi.com', '+91 11 23456789', 'Shakti Kiran Building, Karkardooma, Delhi', null);
    const comp3 = insertCompany.run('MANNULLY Technologies', 'MANNULLY Employee Portal', 'MAN01', 'info@mannully.com', '+91 80 45678901', 'Tech Park, Whitefield, Bengaluru', null);

    const companies = [
      { id: comp1.lastInsertRowid, code: 'NPB01', name: 'NPB Attendance Solutions' },
      { id: comp2.lastInsertRowid, code: 'BSES01', name: 'BSES Yamuna Power Ltd' },
      { id: comp3.lastInsertRowid, code: 'MAN01', name: 'MANNULLY Technologies' }
    ];

    // Seed Modules & Settings for each company
    const modules = [
      'gps_attendance', 'geofencing', 'live_tracking', 'route_tracking',
      'leave_management', 'holiday_management', 'weekly_off',
      'shift_management', 'rotational_shift', 'excel_update',
      'custom_reports', 'service_requests'
    ];

    const insertModule = db.prepare('INSERT INTO company_modules (company_id, module_name, is_enabled) VALUES (?, ?, 1)');
    const insertSettings = db.prepare(`
      INSERT INTO company_settings (
        company_id, timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours,
        show_branding_mode, website_title, contact_info, auto_archive_days
      ) VALUES (?, 'Asia/Kolkata', 8.0, 4.0, 8.0, 'both', ?, ?, 1)
    `);

    companies.forEach(c => {
      insertSettings.run(c.id, `${c.name} - HRMS Portal`, `Support Desk: support@${c.code.toLowerCase()}.com`);
      modules.forEach(m => insertModule.run(c.id, m));
    });

    // 5. Seed Shifts for NPB
    const npbId = comp1.lastInsertRowid;
    const insertShift = db.prepare(`
      INSERT INTO shifts (company_id, name, start_time, end_time, grace_time_mins, working_hours, break_time_mins, status, is_rotational)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);

    const shiftMorning = insertShift.run(npbId, 'General Morning Shift', '09:00', '18:00', 15, 8.0, 60, 0);
    const shiftEvening = insertShift.run(npbId, 'Evening Shift', '14:00', '22:30', 15, 8.0, 30, 0);
    const shiftNight = insertShift.run(npbId, 'Night Shift', '22:00', '06:30', 15, 8.0, 30, 1);

    // Rotational shift schedule
    db.prepare(`
      INSERT INTO rotational_shifts (company_id, name, cycle_type, shift_order_json, rotation_interval_days)
      VALUES (?, ?, 'weekly', ?, 7)
    `).run(npbId, 'Standard Rotational Roster (M->E->N)', JSON.stringify([shiftMorning.lastInsertRowid, shiftEvening.lastInsertRowid, shiftNight.lastInsertRowid]));

    // Weekly Off for NPB
    const weeklyOff = db.prepare(`
      INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
      VALUES (?, 'Standard Weekend (Sun)', '["Sunday"]', 1)
    `).run(npbId);

    // Holidays for NPB
    const insertHoliday = db.prepare("INSERT INTO holidays (company_id, name, holiday_date, is_optional, applies_to) VALUES (?, ?, ?, 0, 'all')");
    insertHoliday.run(npbId, 'Republic Day', '2026-01-26');
    insertHoliday.run(npbId, 'Holi', '2026-03-04');
    insertHoliday.run(npbId, 'Independence Day', '2026-08-15');
    insertHoliday.run(npbId, 'Gandhi Jayanti', '2026-10-02');
    insertHoliday.run(npbId, 'Diwali', '2026-11-08');

    // Geofences for NPB
    const insertGeofence = db.prepare(`
      INSERT INTO geofences (company_id, location_name, latitude, longitude, radius, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `);
    const gfNpbHQ = insertGeofence.run(npbId, 'NPB Cyber City Head Office', 28.4950, 77.0890, 250.0, superAdminUser.lastInsertRowid);
    insertGeofence.run(npbId, 'NPB Delhi Branch', 28.6280, 77.2190, 150.0, superAdminUser.lastInsertRowid);

    // Leave Types for NPB (Attendance/HR records only, zero payroll links)
    const insertLeaveType = db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const ltCL = insertLeaveType.run(npbId, 'Casual Leave (CL)', 12.0, 1.0, 0, 0.0);
    const ltEL = insertLeaveType.run(npbId, 'Earned Leave (EL)', 15.0, 1.25, 1, 30.0); // 1.25 per month = 15 yearly

    // 6. Seed Users for NPB
    // 6a. Company Admin: npb_admin / Company@123
    const compAdminHash = bcrypt.hashSync('Company@123', 10);
    const compAdminUser = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run('npb_admin', compAdminHash, 'admin@npbattendance.com', roleMap['company_admin'], npbId);

    // 6b. Manager: npb_mgr / Mgr@12345
    const mgrHash = bcrypt.hashSync('Mgr@12345', 10);
    const mgrUser = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run('npb_mgr', mgrHash, 'manager@npbattendance.com', roleMap['manager'], npbId);

    const mgrEmp = db.prepare(`
      INSERT INTO employees (
        company_id, user_id, employee_id, full_name, mobile, email, department, designation,
        shift_id, weekly_off_id, geofence_id, geofence_mode, status
      ) VALUES (?, ?, 'EMP_MGR_01', 'Vikram Singh (Manager)', '9822334455', 'vikram.singh@npbattendance.com', 'Engineering', 'Engineering Manager', ?, ?, ?, 'company', 'active')
    `).run(npbId, mgrUser.lastInsertRowid, shiftMorning.lastInsertRowid, weeklyOff.lastInsertRowid, gfNpbHQ.lastInsertRowid);

    // 6d. Employee 1: npb_emp1 / Emp@12345 (Amit Kumar)
    const emp1Hash = bcrypt.hashSync('Emp@12345', 10);
    const emp1User = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run('npb_emp1', emp1Hash, 'amit.kumar@npbattendance.com', roleMap['employee'], npbId);

    const emp1 = db.prepare(`
      INSERT INTO employees (
        company_id, user_id, employee_id, full_name, mobile, email, department, designation,
        manager_id, shift_id, weekly_off_id, geofence_id, geofence_mode, status
      ) VALUES (?, ?, 'NPB101', 'Amit Kumar', '9833445566', 'amit.kumar@npbattendance.com', 'Engineering', 'Senior Developer', ?, ?, ?, ?, 'company', 'active')
    `).run(npbId, emp1User.lastInsertRowid, mgrEmp.lastInsertRowid, shiftMorning.lastInsertRowid, weeklyOff.lastInsertRowid, gfNpbHQ.lastInsertRowid);

    // 6e. Employee 2: npb_emp2 / Emp@12345 (Sneha Patel)
    const emp2Hash = bcrypt.hashSync('Emp@12345', 10);
    const emp2User = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run('npb_emp2', emp2Hash, 'sneha.patel@npbattendance.com', roleMap['employee'], npbId);

    const emp2 = db.prepare(`
      INSERT INTO employees (
        company_id, user_id, employee_id, full_name, mobile, email, department, designation,
        manager_id, shift_id, weekly_off_id, geofence_id, geofence_mode, status
      ) VALUES (?, ?, 'NPB102', 'Sneha Patel', '9844556677', 'sneha.patel@npbattendance.com', 'Engineering', 'QA Engineer', ?, ?, ?, ?, 'company', 'active')
    `).run(npbId, emp2User.lastInsertRowid, mgrEmp.lastInsertRowid, shiftMorning.lastInsertRowid, weeklyOff.lastInsertRowid, gfNpbHQ.lastInsertRowid);

    // Map Employees to Manager
    const insertMapping = db.prepare('INSERT INTO employee_mappings (company_id, manager_id, employee_id, assigned_by) VALUES (?, ?, ?, ?)');
    insertMapping.run(npbId, mgrEmp.lastInsertRowid, emp1.lastInsertRowid, compAdminUser.lastInsertRowid);
    insertMapping.run(npbId, mgrEmp.lastInsertRowid, emp2.lastInsertRowid, compAdminUser.lastInsertRowid);

    // Seed Leave Balances for Employees (Earned Leave 1.25/mo = 15/yr, CL 12/yr, PL 10/yr)
    const currentYear = new Date().getFullYear();
    const insertLeaveBal = db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    [emp1.lastInsertRowid, emp2.lastInsertRowid].forEach(eId => {
      insertLeaveBal.run(eId, ltCL.lastInsertRowid, currentYear, 12.0, 0.0, 2.0, 10.0);
      insertLeaveBal.run(eId, ltEL.lastInsertRowid, currentYear, 15.0, 10.0, 3.0, 12.0); // 1.25 monthly accrued
      insertLeaveBal.run(eId, ltPL.lastInsertRowid, currentYear, 10.0, 0.0, 1.0, 9.0);
    });

    // Initial Notifications
    const insertNotif = db.prepare('INSERT INTO notifications (user_id, company_id, title, message, type, link) VALUES (?, ?, ?, ?, ?, ?)');
    insertNotif.run(superAdminUser.lastInsertRowid, null, 'Welcome to NPB HRMS', 'System is active and operational. Zero payroll compliance enforced.', 'system', '/dashboard');
    insertNotif.run(compAdminUser.lastInsertRowid, npbId, 'Company Setup Complete', 'Company portal and geofences are initialized.', 'system', '/settings');

    console.log('Seeding completed successfully with zero dummy attendance!');

    console.log('Seeding completed successfully!');
  });

  runInTransaction();
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
