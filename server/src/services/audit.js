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
    // Filter out unnecessary / polling logs after login - only record authentic website operations
    if (!action || !targetEntity) return null;
    const ignoredActions = ['HEARTBEAT', 'PING', 'POLL', 'VERIFY_TOKEN', 'CHECK_STATUS', 'SYSTEM_POLL', 'NAVIGATION', 'STATUS_POLL'];
    if (ignoredActions.includes(String(action).toUpperCase())) return null;

    const stmt = db.prepare(`
      INSERT INTO audit_logs (
        company_id, user_id, user_name, role, panel, action,
        target_entity, target_id, old_values_json, new_values_json, reason, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
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

    const insertedId = result.lastInsertRowid;

    // Real-time sync to Firebase (Firestore & RTDB) with exact matched doc ID
    try {
      const { syncAuditLog } = require('./firebase');
      if (syncAuditLog) {
        syncAuditLog({
          id: insertedId,
          companyId,
          userId,
          userName: userName || 'Unknown User',
          role: role || 'system',
          panel: panel || 'General',
          action,
          targetEntity,
          targetId: targetId ? String(targetId) : null,
          oldValues,
          newValues,
          reason,
          ipAddress,
          createdAt: new Date().toISOString()
        }).catch(() => {});
      }
    } catch (e) {}

    // Instant SSE push to Support and Admin panels
    try {
      const { broadcastRealtimeEvent } = require('./notificationService');
      if (broadcastRealtimeEvent) {
        broadcastRealtimeEvent({
          companyId,
          entity: 'audit_logs',
          action: 'LOG_CREATED',
          id: insertedId,
          data: { action, targetEntity, targetId, userName, panel }
        });
      }
    } catch (e) {}

    return insertedId;
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
    return null;
  }
}

module.exports = { logAudit };

