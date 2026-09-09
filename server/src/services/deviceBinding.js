const db = require('../db');
const { logAudit } = require('./audit');

/**
 * Handles device registration and single-device enforcement for employee accounts.
 * Super Admin, Support, Company Admin, and HR users are exempt from single-device lock if desired,
 * or it strictly protects employee accounts as specified in prompt section 23.
 */
function checkAndBindDevice({ userId, roleName, deviceId, macAddress, deviceType, deviceName, ipAddress }) {
  // If no deviceId provided, generate a fallback fingerprint from headers
  const activeDeviceId = deviceId || `dev_${Buffer.from(ipAddress || 'unknown').toString('hex').slice(0, 12)}`;
  const activeMac = macAddress || (deviceId && deviceId.startsWith('hw_') ? deviceId.replace('hw_', '') : (deviceId ? deviceId.toUpperCase() : 'UNKNOWN_MAC'));

  // Device binding strictly applies to employees
  if (roleName !== 'employee') {
    return { allowed: true };
  }

  // Check if user already has an active bound device
  const existingDevice = db.prepare(`
    SELECT * FROM employee_devices 
    WHERE user_id = ? AND status = 'bound'
  `).get(userId);

  if (!existingDevice) {
    // First time login or previous device was unbound/deregistered -> bind this new device
    db.prepare(`
      INSERT INTO employee_devices (user_id, device_id, mac_address, device_type, device_name, status, bound_ip, last_login_at, registered_at)
      VALUES (?, ?, ?, ?, ?, 'bound', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        device_id = excluded.device_id,
        mac_address = excluded.mac_address,
        device_type = excluded.device_type,
        device_name = excluded.device_name,
        status = 'bound',
        bound_ip = excluded.bound_ip,
        registered_at = CURRENT_TIMESTAMP,
        last_login_at = CURRENT_TIMESTAMP
    `).run(userId, activeDeviceId, activeMac, deviceType || 'Web Browser', deviceName || 'Default Device', ipAddress);

    // Log the binding
    db.prepare(`
      INSERT INTO device_binding_logs (user_id, action, device_id, performed_by, reason, ip_address)
      VALUES (?, 'bound', ?, ?, 'Initial device registration on login', ?)
    `).run(userId, activeDeviceId, userId, ipAddress);

    return { allowed: true, deviceId: activeDeviceId, macAddress: activeMac, isNewBinding: true };
  }

  // If already bound, check if device matches (either by device_id or mac_address)
  const matches = (existingDevice.device_id === activeDeviceId) ||
                  (activeMac && existingDevice.mac_address && existingDevice.mac_address === activeMac);

  if (matches) {
    // Update last login and backfill mac_address if needed
    db.prepare(`
      UPDATE employee_devices SET last_login_at = CURRENT_TIMESTAMP, bound_ip = ?, mac_address = COALESCE(?, mac_address)
      WHERE id = ?
    `).run(ipAddress, activeMac, existingDevice.id);

    return { allowed: true, deviceId: activeDeviceId, macAddress: existingDevice.mac_address || activeMac };
  }

  // Mismatched device! Block login
  db.prepare(`
    INSERT INTO device_binding_logs (user_id, action, device_id, performed_by, reason, ip_address)
    VALUES (?, 'login_blocked', ?, ?, 'Attempted login from unauthorized secondary device', ?)
  `).run(userId, activeDeviceId, userId, ipAddress);

  const lockedMac = existingDevice.mac_address || (existingDevice.device_id.startsWith('hw_') ? existingDevice.device_id.replace('hw_', '') : existingDevice.device_id);
  const currentMac = activeMac;

  return {
    allowed: false,
    message: `Device Lock Active: This account is locked to another registered device (${existingDevice.device_name || 'Registered Device'} | MAC: ${lockedMac}). You cannot log in from a different device. To change your registered device, please contact Support to deregister device via MAC address / Device Lock.`,
    registeredDevice: {
      macAddress: lockedMac,
      deviceName: existingDevice.device_name || existingDevice.device_type || 'Registered Device',
      deviceId: existingDevice.device_id,
      registeredAt: existingDevice.registered_at,
      boundIp: existingDevice.bound_ip
    },
    currentDevice: {
      macAddress: currentMac,
      deviceId: activeDeviceId
    }
  };
}

/**
 * Unbinds/deregisters a device by authorized Support, Super Admin, or Company Admin.
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
  `).run(userId, currentDevice.device_id, authorizedUserId, reason || 'Support deregistered device via MAC lock', ipAddress);

  // Record in audit_logs
  logAudit({
    userId: authorizedUserId,
    userName: authorizerName,
    role: authorizerRole,
    panel: 'Support/Admin Panel',
    action: 'DEVICE_DEREGISTERED',
    targetEntity: 'employee_devices',
    targetId: userId,
    oldValues: { device_id: currentDevice.device_id, mac_address: currentDevice.mac_address, status: 'bound' },
    newValues: { status: 'unbound' },
    reason: reason || 'Support deregistered device via MAC lock',
    ipAddress
  });

  const macDisplay = currentDevice.mac_address || currentDevice.device_id;
  return { 
    success: true, 
    message: `Device (${macDisplay}) successfully deregistered and unlocked. The employee may now log in from their new device.` 
  };
}

module.exports = {
  checkAndBindDevice,
  unbindUserDevice
};
