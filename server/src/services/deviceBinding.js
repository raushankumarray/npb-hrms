const db = require('../db');
const { logAudit } = require('./audit');

/**
 * Handles device registration and single-device enforcement for employee accounts.
 * Super Admin, Support, Company Admin, and HR users are exempt from single-device lock if desired,
 * or it strictly protects employee accounts as specified in prompt section 23.
 */
function checkAndBindDevice({ userId, roleName, deviceId, deviceType, deviceName, ipAddress }) {
  // If no deviceId provided, generate a fallback fingerprint from headers
  const activeDeviceId = deviceId || `dev_${Buffer.from(ipAddress || 'unknown').toString('hex').slice(0, 12)}`;

  // Device binding strictly applies to employees (and can be applied to all company users)
  if (roleName !== 'employee') {
    return { allowed: true };
  }

  // Check if user already has an active bound device
  const existingDevice = db.prepare(`
    SELECT * FROM employee_devices 
    WHERE user_id = ? AND status = 'bound'
  `).get(userId);

  if (!existingDevice) {
    // First time login or previous device was unbound -> bind this device
    db.prepare(`
      INSERT INTO employee_devices (user_id, device_id, device_type, device_name, status, bound_ip, last_login_at)
      VALUES (?, ?, ?, ?, 'bound', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        device_id = excluded.device_id,
        device_type = excluded.device_type,
        device_name = excluded.device_name,
        status = 'bound',
        bound_ip = excluded.bound_ip,
        last_login_at = CURRENT_TIMESTAMP
    `).run(userId, activeDeviceId, deviceType || 'Web Browser', deviceName || 'Default Device', ipAddress);

    // Log the binding
    db.prepare(`
      INSERT INTO device_binding_logs (user_id, action, device_id, performed_by, reason, ip_address)
      VALUES (?, 'bound', ?, ?, 'Initial device registration on login', ?)
    `).run(userId, activeDeviceId, userId, ipAddress);

    return { allowed: true, deviceId: activeDeviceId, isNewBinding: true };
  }

  // If already bound, check if deviceId matches
  if (existingDevice.device_id === activeDeviceId) {
    // Update last login
    db.prepare(`
      UPDATE employee_devices SET last_login_at = CURRENT_TIMESTAMP, bound_ip = ?
      WHERE id = ?
    `).run(ipAddress, existingDevice.id);

    return { allowed: true, deviceId: activeDeviceId };
  }

  // Mismatched device! Block login
  db.prepare(`
    INSERT INTO device_binding_logs (user_id, action, device_id, performed_by, reason, ip_address)
    VALUES (?, 'login_blocked', ?, ?, 'Attempted login from unauthorized secondary device', ?)
  `).run(userId, activeDeviceId, userId, ipAddress);

  return {
    allowed: false,
    message: `Access Blocked: This account is already bound to another registered device (${existingDevice.device_name || existingDevice.device_type || 'Registered Device'}). To switch devices, please submit a Device Reset Ticket to Support/HR.`
  };
}

/**
 * Unbinds a device by authorized Support, Super Admin, or Company Admin.
 */
function unbindUserDevice({ userId, authorizedUserId, authorizerName, authorizerRole, reason, ipAddress }) {
  const currentDevice = db.prepare('SELECT * FROM employee_devices WHERE user_id = ?').get(userId);
  if (!currentDevice) {
    return { success: false, error: 'No device registration found for this user.' };
  }

  db.prepare(`
    UPDATE employee_devices 
    SET status = 'unbound'
    WHERE user_id = ?
  `).run(userId);

  // Record in device_binding_logs
  db.prepare(`
    INSERT INTO device_binding_logs (user_id, action, device_id, performed_by, reason, ip_address)
    VALUES (?, 'unbound', ?, ?, ?, ?)
  `).run(userId, currentDevice.device_id, authorizedUserId, reason || 'Support unlocked device', ipAddress);

  // Record in audit_logs
  logAudit({
    userId: authorizedUserId,
    userName: authorizerName,
    role: authorizerRole,
    panel: 'Support/Admin Panel',
    action: 'DEVICE_UNBOUND',
    targetEntity: 'employee_devices',
    targetId: userId,
    oldValues: { device_id: currentDevice.device_id, status: 'bound' },
    newValues: { status: 'unbound' },
    reason: reason || 'Support unbind action',
    ipAddress
  });

  return { success: true, message: 'Device successfully unbound. The employee may now log in from their new device.' };
}

module.exports = {
  checkAndBindDevice,
  unbindUserDevice
};
