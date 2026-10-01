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

  // If company has explicitly disabled device_binding module, bypass device lock
  try {
    const userRow = db.prepare('SELECT company_id FROM users WHERE id = ?').get(userId);
    if (userRow && userRow.company_id) {
      const mod = db.prepare("SELECT is_enabled FROM company_modules WHERE company_id = ? AND module_name = 'device_binding'").get(userRow.company_id);
      if (mod && mod.is_enabled === 0) {
        return { allowed: true, deviceId: activeDeviceId, macAddress: activeMac };
      }
    }
  } catch (e) {}

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

    // Sync device lock & MAC address to Firebase
    try {
      const boundDev = db.prepare('SELECT * FROM employee_devices WHERE user_id = ?').get(userId);
      if (boundDev) {
        const { syncEmployeeDevice } = require('./firebase');
        syncEmployeeDevice(boundDev).catch(() => {});
      }
    } catch (e) {}

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

    // Sync refreshed login state to Firebase
    try {
      const updatedDev = db.prepare('SELECT * FROM employee_devices WHERE id = ?').get(existingDevice.id);
      if (updatedDev) {
        const { syncEmployeeDevice } = require('./firebase');
        syncEmployeeDevice(updatedDev).catch(() => {});
      }
    } catch (e) {}

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
    message: 'Your account is already registered on another device. If you want to de-register, please raise a ticket.',
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
    return { 
      success: true, 
      message: 'No active device lock found for this account. The employee can already log in from another device.' 
    };
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
    oldValues: { device_id: currentDevice.device_id, mac_address: currentDevice.mac_address, status: currentDevice.status || 'bound' },
    newValues: { status: 'unbound' },
    reason: reason || 'Support deregistered device via MAC lock',
    ipAddress
  });

  const macDisplay = currentDevice.mac_address || currentDevice.device_id;

  // Sync unbound device status & purge stale binding from Firebase
  try {
    const unboundDev = db.prepare('SELECT * FROM employee_devices WHERE user_id = ?').get(userId);
    const { syncEmployeeDevice, deleteFromFirebase } = require('./firebase');
    if (unboundDev && syncEmployeeDevice) {
      syncEmployeeDevice(unboundDev).catch(() => {});
    }
    if (deleteFromFirebase) {
      deleteFromFirebase('device_bindings', userId).catch(() => {});
    }
  } catch (e) {}

  // Broadcast real-time event so all open tabs update instantly
  try {
    const { broadcastRealtimeEvent } = require('./notificationService');
    broadcastRealtimeEvent('device_unbound', {
      userId: Number(userId),
      macAddress: macDisplay,
      unboundAt: new Date().toISOString()
    });
  } catch (e) {}

  // Dispatch real-time push notification to user
  try {
    const { createNotification } = require('./notificationService');
    const uRow = db.prepare('SELECT company_id FROM users WHERE id = ?').get(userId);
    createNotification({
      userId,
      companyId: uRow ? uRow.company_id : null,
      title: 'Device Lock Released',
      message: `Your device lock (${macDisplay}) was deregistered by ${authorizerName || 'Support/Admin'}. You can now register and log in from your new device.`,
      type: 'device',
      link: '/profile'
    });
  } catch (e) {}

  return { 
    success: true, 
    message: `Device (${macDisplay}) successfully deregistered and unlocked. The employee may now log in from their new device.` 
  };
}

module.exports = {
  checkAndBindDevice,
  unbindUserDevice
};
