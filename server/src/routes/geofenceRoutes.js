const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, getTenantCompanyId } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');

// List Geofences, Employee Assignments & Company Policy
router.get('/', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const geofences = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM geofence_assignments ga WHERE ga.geofence_id = g.id) as assigned_employees_count
    FROM geofences g
    WHERE g.company_id = ?
    ORDER BY g.created_at DESC
  `).all(companyId);

  const employees = db.prepare(`
    SELECT e.id, e.employee_id, e.full_name, e.department, e.designation, e.city,
           e.geofence_id, e.geofence_mode, r.name as role_name,
           g.location_name as assigned_geofence_name, g.radius as assigned_geofence_radius
    FROM employees e
    JOIN users u ON e.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN geofences g ON e.geofence_id = g.id
    WHERE e.company_id = ? AND e.status = 'active' AND e.is_deleted = 0
    ORDER BY e.full_name ASC
  `).all(companyId);

  const compSetting = db.prepare('SELECT geofence_policy FROM company_settings WHERE company_id = ?').get(companyId);
  const compMod = db.prepare("SELECT is_enabled FROM company_modules WHERE company_id = ? AND module_name = 'geofencing'").get(companyId);
  const companyPolicy = compSetting?.geofence_policy || (compMod && !compMod.is_enabled ? 'anywhere' : 'strict');

  // Resolve the authenticated user's specific geofence status
  let myGeofence = null;
  let allowedAnywhere = false;

  const isEmployeeRole = req.user.role_name === 'employee';
  if (!isEmployeeRole || companyPolicy === 'anywhere' || (compMod && !compMod.is_enabled)) {
    allowedAnywhere = true;
  } else if (req.user.employee_id) {
    const empRecord = db.prepare('SELECT id, geofence_id, geofence_mode FROM employees WHERE id = ?').get(req.user.employee_id);
    if (!empRecord || empRecord.geofence_mode === 'none' || empRecord.geofence_mode === 'anywhere') {
      allowedAnywhere = true;
    } else {
      if (empRecord.geofence_id) {
        myGeofence = db.prepare("SELECT * FROM geofences WHERE id = ? AND status = 'active'").get(empRecord.geofence_id);
      }
      if (!myGeofence) {
        myGeofence = db.prepare(`
          SELECT g.* FROM geofences g
          JOIN geofence_assignments ga ON g.id = ga.geofence_id
          WHERE ga.employee_id = ? AND g.status = 'active'
          LIMIT 1
        `).get(req.user.employee_id);
      }

      if (!myGeofence) {
        allowedAnywhere = true;
      }
    }
  } else {
    allowedAnywhere = true;
  }

  res.json({
    geofences,
    employees,
    company_policy: companyPolicy,
    my_geofence: myGeofence || null,
    allowed_anywhere: allowedAnywhere
  });
});

// Update Company Geofence Policy (Company Admin, Super Admin)
router.put('/company-policy', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { policy, apply_to_all_employees } = req.body;

  if (!policy || !['strict', 'anywhere'].includes(policy)) {
    return res.status(400).json({ error: "Policy must be either 'strict' or 'anywhere'." });
  }

  const transaction = db.transaction(() => {
    // 1. Update company_settings
    db.prepare(`
      INSERT INTO company_settings (company_id, geofence_policy, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id) DO UPDATE SET
        geofence_policy = excluded.geofence_policy,
        updated_at = CURRENT_TIMESTAMP
    `).run(companyId, policy);

    // 2. Keep company_modules in sync
    db.prepare(`
      INSERT INTO company_modules (company_id, module_name, is_enabled, updated_at)
      VALUES (?, 'geofencing', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(company_id, module_name) DO UPDATE SET
        is_enabled = excluded.is_enabled,
        updated_at = CURRENT_TIMESTAMP
    `).run(companyId, policy === 'anywhere' ? 0 : 1);

    // 3. Optional: apply Anywhere to all employees
    let resetCount = 0;
    if (apply_to_all_employees) {
      const resUpdate = db.prepare(`
        UPDATE employees
        SET geofence_id = null, geofence_mode = 'none', updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ?
      `).run(companyId);
      resetCount = resUpdate.changes;
      db.prepare('DELETE FROM geofence_assignments WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)').run(companyId);
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Geofence Management',
      action: 'COMPANY_GEOFENCE_POLICY_UPDATED',
      targetEntity: 'company_settings',
      targetId: companyId,
      newValues: { policy, apply_to_all_employees: !!apply_to_all_employees, resetCount },
      reason: `Company geofence policy updated to ${policy === 'anywhere' ? 'Anywhere Punching (Unrestricted)' : 'Strict Office Geofencing'}`
    });
  });

  transaction();

  res.json({
    success: true,
    policy,
    message: policy === 'anywhere'
      ? 'Company geofence updated to Anywhere mode: all employees can now punch attendance from anywhere without any restriction.'
      : 'Company geofence updated to Strict Office mode: employees must punch within assigned office meter radius.'
  });
});

// Bulk Assign Employees to Geofence or Anywhere (Company Admin, Super Admin)
router.post('/bulk-assign', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_ids, geofence_id } = req.body;

  if (!Array.isArray(employee_ids) || employee_ids.length === 0) {
    return res.status(400).json({ error: 'Please select at least one employee to assign.' });
  }

  const isAnywhere = !geofence_id || geofence_id === 'anywhere' || geofence_id === 'none';

  let targetGeofence = null;
  if (!isAnywhere) {
    targetGeofence = db.prepare('SELECT * FROM geofences WHERE id = ? AND company_id = ?').get(parseInt(geofence_id, 10), companyId);
    if (!targetGeofence) {
      return res.status(404).json({ error: 'Selected office geofence location does not exist.' });
    }
  }

  const transaction = db.transaction(() => {
    const updateEmpStmt = db.prepare(`
      UPDATE employees
      SET geofence_id = ?, geofence_mode = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `);

    const deleteAssignStmt = db.prepare('DELETE FROM geofence_assignments WHERE employee_id = ?');
    const insertAssignStmt = db.prepare('INSERT OR IGNORE INTO geofence_assignments (geofence_id, employee_id) VALUES (?, ?)');

    for (const empId of employee_ids) {
      if (isAnywhere) {
        updateEmpStmt.run(null, 'none', empId, companyId);
        deleteAssignStmt.run(empId);
      } else {
        updateEmpStmt.run(targetGeofence.id, 'custom', empId, companyId);
        deleteAssignStmt.run(empId);
        insertAssignStmt.run(targetGeofence.id, empId);
      }
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Geofence Management',
      action: isAnywhere ? 'GEOFENCE_BULK_ASSIGNED_ANYWHERE' : 'GEOFENCE_BULK_ASSIGNED',
      targetEntity: 'employees',
      targetId: null,
      newValues: {
        target: isAnywhere ? 'Anywhere (No Geofence)' : targetGeofence.location_name,
        geofence_id: isAnywhere ? null : targetGeofence.id,
        employee_ids
      },
      reason: `Bulk assigned ${employee_ids.length} employees to ${isAnywhere ? 'Anywhere' : targetGeofence.location_name}`
    });
  });

  transaction();

  res.json({
    success: true,
    count: employee_ids.length,
    message: isAnywhere
      ? `Successfully set ${employee_ids.length} employee(s) to Anywhere mode (no geofence restriction).`
      : `Successfully assigned ${employee_ids.length} employee(s) to "${targetGeofence.location_name}" (${targetGeofence.radius}m).`
  });
});

// Create Geofence (Company Admin, Super Admin)
router.post('/', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { location_name, latitude, longitude, radius, employee_ids } = req.body;

  if (!location_name || latitude === undefined || longitude === undefined || !radius) {
    return res.status(400).json({ error: 'Location Name, Latitude, Longitude, and Radius (meters) are required.' });
  }

  const transaction = db.transaction(() => {
    const resGf = db.prepare(`
      INSERT INTO geofences (company_id, location_name, latitude, longitude, radius, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'active', ?)
    `).run(companyId, location_name.trim(), parseFloat(latitude), parseFloat(longitude), parseFloat(radius), req.user.id);

    const gfId = resGf.lastInsertRowid;

    // Optional employee assignments
    if (Array.isArray(employee_ids) && employee_ids.length > 0) {
      const insertAssign = db.prepare('INSERT INTO geofence_assignments (geofence_id, employee_id) VALUES (?, ?)');
      employee_ids.forEach(eId => insertAssign.run(gfId, eId));
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Geofence Management',
      action: 'GEOFENCE_CREATED',
      targetEntity: 'geofences',
      targetId: gfId,
      newValues: { location_name, latitude, longitude, radius },
      reason: 'Added new geofence location'
    });

    return gfId;
  });

  const createdId = transaction();
  res.status(201).json({ success: true, geofenceId: createdId, message: 'Geofence location created successfully.' });
});

// Update Geofence
router.put('/:id', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const gfId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);
  const { location_name, latitude, longitude, radius, status, employee_ids } = req.body;

  const current = db.prepare('SELECT * FROM geofences WHERE id = ? AND company_id = ?').get(gfId, companyId);
  if (!current) {
    return res.status(404).json({ error: 'Geofence not found.' });
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE geofences SET
        location_name = COALESCE(?, location_name),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        radius = COALESCE(?, radius),
        status = COALESCE(?, status),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      location_name,
      latitude !== undefined ? parseFloat(latitude) : null,
      longitude !== undefined ? parseFloat(longitude) : null,
      radius !== undefined ? parseFloat(radius) : null,
      status, req.user.id, gfId
    );

    if (Array.isArray(employee_ids)) {
      db.prepare('DELETE FROM geofence_assignments WHERE geofence_id = ?').run(gfId);
      const insertAssign = db.prepare('INSERT INTO geofence_assignments (geofence_id, employee_id) VALUES (?, ?)');
      employee_ids.forEach(eId => insertAssign.run(gfId, eId));
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Geofence Management',
      action: 'GEOFENCE_UPDATED',
      targetEntity: 'geofences',
      targetId: gfId,
      oldValues: { location_name: current.location_name, radius: current.radius, status: current.status },
      newValues: { location_name, radius, status },
      reason: 'Geofence details updated'
    });
  });

  transaction();
  res.json({ success: true, message: 'Geofence updated successfully.' });
});

// Delete Geofence
router.delete('/:id', verifyAuth, requireRole(['company_admin', 'super_admin']), (req, res) => {
  const gfId = parseInt(req.params.id, 10);
  const companyId = getTenantCompanyId(req);

  db.prepare('DELETE FROM geofences WHERE id = ? AND company_id = ?').run(gfId, companyId);

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Geofence Management',
    action: 'GEOFENCE_DELETED',
    targetEntity: 'geofences',
    targetId: gfId,
    reason: 'Deleted geofence boundary'
  });

  res.json({ success: true, message: 'Geofence deleted successfully.' });
});

module.exports = router;
