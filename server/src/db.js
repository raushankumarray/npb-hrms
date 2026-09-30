const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'npb_hrms.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema migrations
try {
  db.prepare("ALTER TABLE company_settings ADD COLUMN geofence_policy TEXT DEFAULT 'strict'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE employee_devices ADD COLUMN mac_address TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE support_users ADD COLUMN enable_ai_assistant INTEGER DEFAULT 0").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE support_users ADD COLUMN assigned_companies TEXT DEFAULT 'all'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE support_users ADD COLUMN enable_audit_logs INTEGER DEFAULT 1").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE service_requests ADD COLUMN assigned_role TEXT DEFAULT 'manager'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE service_requests ADD COLUMN assigned_to INTEGER").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE attendance_correction_requests ADD COLUMN correction_type TEXT DEFAULT 'both'").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE companies ADD COLUMN plan_expiry_date DATE").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE employees ADD COLUMN employment_start_date DATE").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE employees ADD COLUMN employment_end_date DATE").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE companies ADD COLUMN favicon TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE attendance_records ADD COLUMN punch_in_area TEXT").run();
} catch (e) {}

try {
  db.prepare("ALTER TABLE attendance_records ADD COLUMN punch_out_area TEXT").run();
} catch (e) {}

try {
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='attendance_correction_requests'").get();
  if (tableSql && tableSql.sql && !tableSql.sql.includes("'Absent'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE attendance_correction_requests_new (
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
      INSERT INTO attendance_correction_requests_new (id, company_id, employee_id, date, current_status, current_punch_in, current_punch_out, requested_punch_in, requested_punch_out, requested_status, reason, status, correction_type, reviewed_by, review_notes, created_at, updated_at)
      SELECT id, company_id, employee_id, date, current_status, current_punch_in, current_punch_out, requested_punch_in, requested_punch_out, requested_status, reason, status, COALESCE(correction_type, 'both'), reviewed_by, review_notes, created_at, updated_at FROM attendance_correction_requests;
      DROP TABLE attendance_correction_requests;
      ALTER TABLE attendance_correction_requests_new RENAME TO attendance_correction_requests;
      CREATE INDEX IF NOT EXISTS idx_att_corr_emp ON attendance_correction_requests(employee_id, date);
      CREATE INDEX IF NOT EXISTS idx_att_corr_comp_status ON attendance_correction_requests(company_id, status);
      PRAGMA foreign_keys = ON;
    `);
  }
} catch (e) {
  console.warn('Migration error for attendance_correction_requests:', e.message);
}

// Add period_month and period_year to leave_transactions for strict month-wise EL and year-wise CL validation
try {
  db.prepare("ALTER TABLE leave_transactions ADD COLUMN period_month INTEGER").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE leave_transactions ADD COLUMN period_year INTEGER").run();
} catch (e) {}


// Permanent purge routine for legacy demo companies and support accounts
try {
  const legacyComps = db.prepare(`
    SELECT id FROM companies
    WHERE UPPER(code) IN ('NPB01', 'BSES01', 'MAN01')
       OR LOWER(name) IN ('npb attendance solutions', 'bses yamuna power ltd', 'mannully technologies')
  `).all();

  for (const c of legacyComps) {
    db.prepare('DELETE FROM service_request_messages WHERE request_id IN (SELECT id FROM service_requests WHERE company_id = ?)').run(c.id);
    db.prepare('DELETE FROM service_requests WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM support_tickets WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM device_bindings WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)').run(c.id);
    db.prepare('DELETE FROM employee_devices WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)').run(c.id);
    db.prepare('DELETE FROM audit_logs WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM notifications WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM attendance_correction_requests WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM attendance_records WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM leave_balances WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)').run(c.id);
    db.prepare('DELETE FROM leave_requests WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM leave_types WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM employee_mappings WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM geofences WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM rotational_shifts WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM shifts WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM holidays WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM weekly_off_settings WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM company_modules WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM company_settings WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM employees WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM users WHERE company_id = ?').run(c.id);
    db.prepare('DELETE FROM companies WHERE id = ?').run(c.id);
  }

  // Purge Rahul Verma (Support)
  const rahulUser = db.prepare("SELECT id FROM users WHERE LOWER(username) = 'support_rahul' OR LOWER(email) = 'rahul.support@npbhrms.com'").get();
  if (rahulUser) {
    db.prepare('DELETE FROM support_permissions WHERE support_user_id IN (SELECT id FROM support_users WHERE user_id = ?)').run(rahulUser.id);
    db.prepare('DELETE FROM support_users WHERE user_id = ?').run(rahulUser.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(rahulUser.id);
  }
} catch (e) {
  console.warn('Permanent demo purge notice:', e.message);
}


// Master System Modules Registry Table & Auto-Seeding
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'General',
      is_core INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const modCount = db.prepare('SELECT COUNT(*) as count FROM system_modules').get().count;
  if (modCount === 0) {
    const DEFAULT_MODULES = [
      { key: 'employees', name: 'Dynamic Form of Employee & Staff', desc: 'Employee onboarding, dynamic staff profiles, and personnel management', category: 'Core HR', is_core: 1 },
      { key: 'mapping', name: 'Employee Mapping & Supervisors', desc: 'Hierarchy mapping and multi-level manager assignments', category: 'Core HR', is_core: 1 },
      { key: 'attendance_punch', name: 'Attendance Punch Feature', desc: 'GPS mobile & desktop attendance punch clock for general staff', category: 'Attendance', is_core: 1 },
      { key: 'manager_punch', name: 'Manager Attendance Punch', desc: 'Enable attendance punch features directly for team managers', category: 'Attendance', is_core: 1 },
      { key: 'corrections', name: 'Attendance Approvals & Corrections', desc: 'Attendance correction requests, approval workflows, and audit records', category: 'Attendance', is_core: 1 },
      { key: 'leave_management', name: 'Leave Management & Balances', desc: 'Leave requests, quota tracking, and balance deduction', category: 'Leave & Holidays', is_core: 1 },
      { key: 'geofencing', name: 'Geofencing Master', desc: 'Office boundary geofencing, radius enforcement, and GPS verification', category: 'Attendance', is_core: 1 },
      { key: 'shift_management', name: 'Shift Management & Rotational', desc: 'Shift scheduling, rotational assignments, and working hours', category: 'Attendance', is_core: 1 },
      { key: 'holidays', name: 'Holidays & Weekly Off', desc: 'Company holiday master calendar, public holidays, and weekly off policies', category: 'Leave & Holidays', is_core: 1 },
      { key: 'live_tracking', name: 'Live Tracking & Route Map', desc: 'Real-time location map, staff movement tracking, and breadcrumb trails', category: 'Tracking', is_core: 1 },
      { key: 'tickets', name: 'Helpdesk & Support Tickets', desc: 'Employee issue reporting, service requests, and resolution chat', category: 'Support', is_core: 1 },
      { key: 'calendar', name: 'Company Calendar', desc: 'Unified company events, employee milestones, and attendance calendar', category: 'General', is_core: 1 },
      { key: 'reports', name: 'Custom Reports & Export', desc: 'Dynamic Excel, PDF matrix export, and historical attendance reports', category: 'Reports', is_core: 1 },
      { key: 'payroll', name: 'Payroll Module', desc: 'Salary slip generation, payroll calculation, and compensation data', category: 'Finance', is_core: 1 },
      { key: 'ai_assistant', name: 'Pihu AI Assistant', desc: 'Universal AI Assistant for Employee, Manager, and Company Admin panels', category: 'AI Tools', is_core: 1 },
      { key: 'device_binding', name: '1-Device MAC Address Lock', desc: 'Enforce single device policy per employee with hardware MAC address binding and de-registration tickets', category: 'Security', is_core: 1 },
    ];

    const insertMod = db.prepare(`
      INSERT INTO system_modules (module_key, name, description, category, is_core, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    for (const m of DEFAULT_MODULES) {
      insertMod.run(m.key, m.name, m.desc, m.category, m.is_core);
    }
  }
} catch (e) {
  console.warn('system_modules init notice:', e.message);
}

module.exports = db;
