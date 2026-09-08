const db = require('../db');

/**
 * Calculates great-circle distance between two GPS coordinates in meters (Haversine formula).
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of Earth in meters
  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates whether an employee is inside their authorized geofence.
 * Implements the full hierarchy:
 * 1. Super Admin global geofencing setting
 * 2. Company module toggle
 * 3. Employee specific geofence assignment or company geofences
 */
function validateGeofence({ companyId, employeeId, latitude, longitude, accuracy }) {
  // Validate coordinates
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return {
      allowed: false,
      reason: 'Mandatory GPS location coordinates missing. Location access is required to punch attendance.'
    };
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return {
      allowed: false,
      reason: 'Invalid GPS coordinates detected.'
    };
  }

  // Check 1: Super Admin global setting
  const globalSetting = db.prepare("SELECT setting_value FROM application_settings WHERE setting_key = 'global_geofencing_enabled'").get();
  if (globalSetting && globalSetting.setting_value === 'false') {
    return {
      allowed: true,
      reason: 'Geofencing globally bypassed by Super Admin.'
    };
  }

  // Check 2: Company Module setting & Company Geofence Policy
  const companyModule = db.prepare(`
    SELECT is_enabled FROM company_modules 
    WHERE company_id = ? AND module_name = 'geofencing'
  `).get(companyId);

  if (companyModule && !companyModule.is_enabled) {
    return {
      allowed: true,
      reason: 'Geofencing is disabled for this company. Attendance can be marked from anywhere without restriction.'
    };
  }

  const companySetting = db.prepare(`
    SELECT geofence_policy FROM company_settings WHERE company_id = ?
  `).get(companyId);

  if (companySetting && companySetting.geofence_policy === 'anywhere') {
    return {
      allowed: true,
      reason: 'Company geofence policy is set to Anywhere mode. Attendance can be marked from anywhere without restriction.'
    };
  }

  // Geofencing is exclusively enforced for 'employee' role.
  // Managers, HR, Company Admins, and Super Admins are exempt from geofencing boundaries.
  const empRole = db.prepare(`
    SELECT r.name as role_name FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    WHERE e.id = ?
  `).get(employeeId);

  if (empRole && empRole.role_name !== 'employee') {
    return {
      allowed: true,
      reason: `Role '${empRole.role_name}' is exempt from geofencing boundaries. Attendance can be marked from anywhere.`
    };
  }

  // Check 3: Check Employee's Geofence Mode
  const employee = db.prepare(`
    SELECT geofence_mode, geofence_id FROM employees WHERE id = ?
  `).get(employeeId);

  if (employee && (employee.geofence_mode === 'none' || employee.geofence_mode === 'anywhere')) {
    return {
      allowed: true,
      reason: 'Employee is set to Anywhere mode. Attendance can be marked from anywhere.'
    };
  }

  // Collect authorized geofences
  let authorizedGeofences = [];

  // 3a. If employee has specific geofence assigned in geofences table
  if (employee && employee.geofence_id) {
    const specificGf = db.prepare("SELECT * FROM geofences WHERE id = ? AND status = 'active'").get(employee.geofence_id);
    if (specificGf) {
      authorizedGeofences.push(specificGf);
    }
  }

  // 3b. If employee has multiple geofences assigned via geofence_assignments
  const assignedGfs = db.prepare(`
    SELECT g.* FROM geofences g
    JOIN geofence_assignments ga ON g.id = ga.geofence_id
    WHERE ga.employee_id = ? AND g.status = 'active'
  `).all(employeeId);

  if (assignedGfs.length > 0) {
    authorizedGeofences.push(...assignedGfs);
  }

  // 3c. If no specific geofences assigned to this employee, allow attendance from anywhere
  if (authorizedGeofences.length === 0) {
    return {
      allowed: true,
      reason: 'No office geofence assigned. Attendance can be marked from anywhere.'
    };
  }

  // Evaluate distance to each authorized geofence
  let nearestDistance = Infinity;
  let nearestGeofence = null;
  let matchedGeofence = null;

  for (const gf of authorizedGeofences) {
    const dist = calculateDistanceMeters(lat, lng, gf.latitude, gf.longitude);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestGeofence = gf;
    }

    // Check if within radius (including GPS accuracy margin if desired, or strict radius)
    if (dist <= gf.radius) {
      matchedGeofence = gf;
      break;
    }
  }

  if (matchedGeofence) {
    return {
      allowed: true,
      geofenceName: matchedGeofence.location_name,
      distance: Math.round(nearestDistance),
      allowedRadius: matchedGeofence.radius,
      reason: `Inside authorized geofence: ${matchedGeofence.location_name} (${Math.round(nearestDistance)}m / ${matchedGeofence.radius}m)`
    };
  }

  // Outside geofence! Block attendance punch
  const distMeters = Math.round(nearestDistance);
  return {
    allowed: false,
    distance: distMeters,
    allowedRadius: nearestGeofence ? nearestGeofence.radius : 0,
    nearestLocation: nearestGeofence ? nearestGeofence.location_name : 'Authorized Zone',
    reason: `You are outside your authorized geofence (${distMeters}m away from ${nearestGeofence ? nearestGeofence.location_name : 'office'}, allowed radius is ${nearestGeofence ? nearestGeofence.radius : 0}m). Punch In/Out is blocked.`
  };
}

module.exports = {
  calculateDistanceMeters,
  validateGeofence
};
