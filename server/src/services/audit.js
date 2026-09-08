const db = require('../db');

function logAudit({
  companyId = null,
  userId,
  userName,
  role,
  panel,
  action,
  targetEntity,
  targetId = null,
  oldValues = null,
  newValues = null,
  reason = 'System Operation',
  ipAddress = '127.0.0.1'
}) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        company_id, user_id, user_name, role, panel, action,
        target_entity, target_id, old_values_json, new_values_json, reason, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      companyId,
      userId,
      userName || 'Unknown User',
      role || 'system',
      panel || 'General',
      action,
      targetEntity,
      targetId ? String(targetId) : null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      reason,
      ipAddress
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
