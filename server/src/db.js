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

module.exports = db;
