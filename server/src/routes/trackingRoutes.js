const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { getTenantCompanyId } = require('../middleware/rbac');

// Location Ping from Employee (Mobile/Web background GPS)
router.post('/ping', verifyAuth, (req, res) => {
  if (req.user.role_name !== 'employee') {
    return res.status(403).json({ error: 'Only employees send live tracking pings.' });
  }

  const { latitude, longitude, accuracy, speed, heading, location_name } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Coordinates missing.' });
  }

  const companyId = req.user.company_id;
  const employeeId = req.user.employee_id;

  const mod = db.prepare("SELECT is_enabled FROM company_modules WHERE company_id = ? AND module_name = 'live_tracking'").get(companyId);
  if (mod && !mod.is_enabled) {
    return res.json({ success: true, trackingDisabled: true });
  }

  db.prepare(`
    INSERT INTO location_tracking_logs (company_id, employee_id, latitude, longitude, accuracy, speed, heading, location_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    companyId, employeeId, parseFloat(latitude), parseFloat(longitude),
    accuracy || null, speed || null, heading || null, location_name || null
  );

  res.json({ success: true, message: 'Ping recorded.' });
});

// Live Positions of Employees (for Manager & Admin)
router.get('/live', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { department, manager_id } = req.query;

  const today = new Date().toISOString().split('T')[0];

  let query = `
    SELECT e.id as employee_id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           COALESCE(l.latitude, ar.punch_in_lat) as latitude,
           COALESCE(l.longitude, ar.punch_in_lng) as longitude,
           COALESCE(l.accuracy, ar.punch_in_accuracy, 10) as accuracy,
           COALESCE(l.location_name, ar.punch_in_location, 'Office Punch') as location_name,
           COALESCE(l.captured_at, ar.punch_in_time) as captured_at,
           ar.punch_in_time, ar.punch_out_time, ar.status as attendance_status,
           g.location_name as assigned_geofence_name, g.radius as assigned_geofence_radius
    FROM employees e
    LEFT JOIN (
      SELECT employee_id, latitude, longitude, accuracy, location_name, captured_at,
             ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY captured_at DESC) as rn
      FROM location_tracking_logs
    ) l ON e.id = l.employee_id AND l.rn = 1
    LEFT JOIN attendance_records ar ON e.id = ar.employee_id AND ar.date = ?
    LEFT JOIN geofences g ON e.geofence_id = g.id
    WHERE e.company_id = ? AND e.is_deleted = 0 AND e.status = 'active'
      AND (l.latitude IS NOT NULL OR ar.punch_in_lat IS NOT NULL)
  `;
  const params = [today, companyId];

  // Manager isolation
  if (req.user.role_name === 'manager') {
    query += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
  }

  if (department) {
    query += ' AND e.department = ?';
    params.push(department);
  }

  if (manager_id) {
    query += ' AND e.manager_id = ?';
    params.push(manager_id);
  }

  const positions = db.prepare(query).all(...params);

  const geofences = db.prepare("SELECT id, location_name, latitude, longitude, radius FROM geofences WHERE company_id = ? AND status = 'active'").all(companyId);

  res.json({ positions, geofences });
});

// Route History / Breadcrumbs for an Employee on a specific date
router.get('/route', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_id, date } = req.query;

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required.' });
  }

  const queryDate = date || new Date().toISOString().split('T')[0];

  const pings = db.prepare(`
    SELECT latitude, longitude, accuracy, speed, location_name, captured_at
    FROM location_tracking_logs
    WHERE company_id = ? AND employee_id = ? AND captured_at LIKE ?
    ORDER BY captured_at ASC
  `).all(companyId, employee_id, `${queryDate}%`);

  const emp = db.prepare('SELECT id, employee_id, full_name, department FROM employees WHERE id = ?').get(employee_id);

  res.json({
    employee: emp,
    date: queryDate,
    waypoints: pings,
    totalPings: pings.length
  });
});

module.exports = router;
