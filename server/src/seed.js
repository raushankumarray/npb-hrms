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

    // Migration: Update attendance_correction_requests CHECK constraint to include Absent
    const crTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance_correction_requests'").get();
    if (crTableSql && crTableSql.sql && !crTableSql.sql.includes("'Absent'")) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE attendance_correction_requests_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL,
          employee_id INTEGER NOT NULL,
          date DATE NOT NULL,
          current_status TEXT DEFAULT 'Absent',
          current_punch_in TEXT,
          current_punch_out TEXT,
          requested_punch_in TEXT,
          requested_punch_out TEXT,
          requested_status TEXT NOT NULL DEFAULT 'Present' CHECK(requested_status IN ('Present', 'Half Day', 'Absent')),
          reason TEXT NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
          correction_type TEXT DEFAULT 'both',
          reviewed_by INTEGER,
          review_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
          FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewed_by) REFERENCES users(id)
        );
        INSERT INTO attendance_correction_requests_migrated (id, company_id, employee_id, date, current_status, current_punch_in, current_punch_out, requested_punch_in, requested_punch_out, requested_status, reason, status, correction_type, reviewed_by, review_notes, created_at, updated_at)
        SELECT id, company_id, employee_id, date, current_status, current_punch_in, current_punch_out, requested_punch_in, requested_punch_out, requested_status, reason, status, COALESCE(correction_type, 'both'), reviewed_by, review_notes, created_at, updated_at FROM attendance_correction_requests;
        DROP TABLE attendance_correction_requests;
        ALTER TABLE attendance_correction_requests_migrated RENAME TO attendance_correction_requests;
        CREATE INDEX IF NOT EXISTS idx_att_corr_emp ON attendance_correction_requests(employee_id, date);
        CREATE INDEX IF NOT EXISTS idx_att_corr_comp_status ON attendance_correction_requests(company_id, status);
        PRAGMA foreign_keys = ON;
      `);
      console.log('Migration: Successfully updated attendance_correction_requests check constraint to include Absent.');
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
    const adminPasswordHash = bcrypt.hashSync('Admin@88', 10);
    db.prepare("UPDATE users SET password_hash = ?, status = 'active', is_deleted = 0 WHERE id = ?").run(adminPasswordHash, existingAdmin.id);
    console.log('Database already seeded. Ensured super admin "adminn" password is "Admin@88".');
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

    // Initial Notification for Super Admin
    const insertNotif = db.prepare('INSERT INTO notifications (user_id, company_id, title, message, type, link) VALUES (?, ?, ?, ?, ?, ?)');
    insertNotif.run(superAdminUser.lastInsertRowid, null, 'Welcome to NPB HRMS', 'System is active and operational. Zero payroll compliance enforced.', 'system', '/dashboard');

    console.log('Seeding completed successfully: Root Super Admin initialized.');
  });

  runInTransaction();
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
