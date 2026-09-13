const db = require('../db');

/**
 * Database Sanitation Service
 * Cleans all unassigned, orphaned, or dangling records from the SQLite database.
 * Ensures strict relational integrity across multi-tenant tables while safeguarding Super Admin and Support accounts.
 */
function sanitizeDatabase() {
  const stats = {
    orphanedEmployees: 0,
    orphanedUsers: 0,
    orphanedMappings: 0,
    orphanedAttendances: 0,
    orphanedCorrections: 0,
    orphanedLeaves: 0,
    orphanedBalances: 0,
    orphanedGeofenceAssignments: 0,
    orphanedDevices: 0,
    orphanedTickets: 0
  };

  try {
    const sanitizeTransaction = db.transaction(() => {
      // 1. Remove orphaned employees whose company does not exist or is deleted
      const empRes = db.prepare(`
        DELETE FROM employees
        WHERE company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0)
      `).run();
      stats.orphanedEmployees = empRes.changes;

      // 2. Remove orphaned tenant users (company_admin, manager, employee) without a valid company
      // (Super Admin and Support users are strictly preserved!)
      const userRes = db.prepare(`
        DELETE FROM users
        WHERE role_id IN (SELECT id FROM roles WHERE name IN ('company_admin', 'manager', 'employee'))
          AND (company_id IS NULL OR company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0))
      `).run();
      stats.orphanedUsers = userRes.changes;

      // 3. Remove orphaned employee mappings (where employee or manager is missing)
      const mapRes = db.prepare(`
        DELETE FROM employee_mappings
        WHERE employee_id NOT IN (SELECT id FROM employees)
           OR manager_id NOT IN (SELECT id FROM employees)
           OR company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0)
      `).run();
      stats.orphanedMappings = mapRes.changes;

      // 4. Remove orphaned attendance records
      const attRes = db.prepare(`
        DELETE FROM attendance_records
        WHERE employee_id NOT IN (SELECT id FROM employees)
           OR company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0)
      `).run();
      stats.orphanedAttendances = attRes.changes;

      // 5. Remove orphaned attendance correction requests
      const corrRes = db.prepare(`
        DELETE FROM attendance_correction_requests
        WHERE employee_id NOT IN (SELECT id FROM employees)
           OR company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0)
      `).run();
      stats.orphanedCorrections = corrRes.changes;

      // 6. Remove orphaned leave requests
      const leaveRes = db.prepare(`
        DELETE FROM leave_requests
        WHERE employee_id NOT IN (SELECT id FROM employees)
           OR company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0)
      `).run();
      stats.orphanedLeaves = leaveRes.changes;

      // 7. Remove orphaned leave balances & transactions
      const balRes = db.prepare(`
        DELETE FROM leave_balances
        WHERE employee_id NOT IN (SELECT id FROM employees)
      `).run();
      stats.orphanedBalances = balRes.changes;

      db.prepare(`
        DELETE FROM leave_transactions
        WHERE employee_id NOT IN (SELECT id FROM employees)
      `).run();

      // 8. Remove orphaned geofence assignments
      const geoRes = db.prepare(`
        DELETE FROM geofence_assignments
        WHERE employee_id NOT IN (SELECT id FROM employees)
           OR geofence_id NOT IN (SELECT id FROM geofences)
      `).run();
      stats.orphanedGeofenceAssignments = geoRes.changes;

      // 9. Remove orphaned device bindings
      const devRes = db.prepare(`
        DELETE FROM employee_devices
        WHERE user_id NOT IN (SELECT id FROM users)
      `).run();
      stats.orphanedDevices = devRes.changes;

      // 10. Remove orphaned service requests / support tickets
      const tktRes = db.prepare(`
        DELETE FROM service_requests
        WHERE company_id IS NOT NULL AND company_id NOT IN (SELECT id FROM companies WHERE is_deleted = 0)
      `).run();
      stats.orphanedTickets = tktRes.changes;

      // 11. Clean orphaned notifications
      db.prepare(`
        DELETE FROM notifications
        WHERE user_id NOT IN (SELECT id FROM users)
      `).run();
    });

    sanitizeTransaction();

    console.log('[SanitizeDB] Database cleanup finished:', stats);
    return { success: true, stats };
  } catch (err) {
    console.error('[SanitizeDB] Error cleaning database:', err);
    return { success: false, error: err.message, stats };
  }
}

module.exports = { sanitizeDatabase };
