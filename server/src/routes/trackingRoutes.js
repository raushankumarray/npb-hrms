const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { getTenantCompanyId } = require('../middleware/rbac');

// Haversine distance in meters between two lat/lng pairs
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Analyze waypoints: detect movement paths and waiting / dwell stops (stay >= 10 mins)
function analyzeRouteWaypoints(rawPoints) {
  if (!rawPoints || rawPoints.length === 0) {
    return {
      waypoints: [],
      stops: [],
      movements: [],
      total_distance_km: '0.00',
      total_waiting_mins: 0
    };
  }

  // Sort chronologically ascending
  const points = [...rawPoints].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

  const stops = [];
  const movements = [];
  let totalDistM = 0;
  let currentCluster = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = currentCluster[0];
    const curr = points[i];
    const dist = haversineDistanceMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);

    // Stationary radius threshold: 60 meters
    if (dist <= 60) {
      currentCluster.push(curr);
    } else {
      // Check if the previous cluster remained stationary for >= 10 minutes (600,000 ms)
      const tStart = new Date(currentCluster[0].captured_at).getTime();
      const tEnd = new Date(currentCluster[currentCluster.length - 1].captured_at).getTime();
      const durationMins = Math.round((tEnd - tStart) / 60000);

      if (durationMins >= 10) {
        stops.push({
          stop_number: stops.length + 1,
          latitude: currentCluster[0].latitude,
          longitude: currentCluster[0].longitude,
          start_time: currentCluster[0].captured_at,
          end_time: currentCluster[currentCluster.length - 1].captured_at,
          duration_mins: durationMins,
          location_name: currentCluster[0].location_name || currentCluster[currentCluster.length - 1].location_name || 'Stationary Location',
          pings_count: currentCluster.length
        });
      }

      totalDistM += dist;
      movements.push({
        from: [currentCluster[currentCluster.length - 1].latitude, currentCluster[currentCluster.length - 1].longitude],
        to: [curr.latitude, curr.longitude],
        distance_m: Math.round(dist),
        start_time: currentCluster[currentCluster.length - 1].captured_at,
        end_time: curr.captured_at
      });

      currentCluster = [curr];
    }
  }

  // Check final cluster at end of track
  if (currentCluster.length > 1) {
    const tStart = new Date(currentCluster[0].captured_at).getTime();
    const tEnd = new Date(currentCluster[currentCluster.length - 1].captured_at).getTime();
    const durationMins = Math.round((tEnd - tStart) / 60000);

    if (durationMins >= 10) {
      stops.push({
        stop_number: stops.length + 1,
        latitude: currentCluster[0].latitude,
        longitude: currentCluster[0].longitude,
        start_time: currentCluster[0].captured_at,
        end_time: currentCluster[currentCluster.length - 1].captured_at,
        duration_mins: durationMins,
        location_name: currentCluster[0].location_name || currentCluster[currentCluster.length - 1].location_name || 'Stationary Location',
        pings_count: currentCluster.length
      });
    }
  }

  const totalWaitingMins = stops.reduce((sum, s) => sum + s.duration_mins, 0);

  return {
    waypoints: points,
    stops,
    movements,
    total_distance_km: (totalDistM / 1000).toFixed(2),
    total_waiting_mins: totalWaitingMins
  };
}

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
           e.geofence_id, e.geofence_mode,
           g.location_name as assigned_geofence_name, g.latitude as assigned_geofence_lat,
           g.longitude as assigned_geofence_lng, g.radius as assigned_geofence_radius
    FROM employees e
    LEFT JOIN (
      SELECT employee_id, latitude, longitude, accuracy, location_name, captured_at,
             ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY captured_at DESC) as rn
      FROM location_tracking_logs
    ) l ON e.id = l.employee_id AND l.rn = 1
    LEFT JOIN attendance_records ar ON e.id = ar.employee_id AND ar.date = ?
    LEFT JOIN geofences g ON e.geofence_id = g.id
    WHERE e.company_id = ? AND e.is_deleted = 0 AND e.status = 'active'
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

  const rawPositions = db.prepare(query).all(...params);

  // Fetch active company geofences
  const companyGeofences = db.prepare("SELECT id, location_name, latitude, longitude, radius FROM geofences WHERE company_id = ? AND status = 'active'").all(companyId);

  // Process reporting location per employee:
  // Show assigned reporting location if geofencing applies; otherwise show only current live location
  const positions = rawPositions.map(p => {
    let geofenceApplied = false;
    let reportingLocation = null;

    if (p.geofence_id && p.assigned_geofence_lat && p.assigned_geofence_lng) {
      geofenceApplied = true;
      reportingLocation = {
        id: p.geofence_id,
        location_name: p.assigned_geofence_name,
        latitude: p.assigned_geofence_lat,
        longitude: p.assigned_geofence_lng,
        radius: p.assigned_geofence_radius
      };
    } else if (p.geofence_mode === 'company' && companyGeofences.length > 0) {
      geofenceApplied = true;
      reportingLocation = companyGeofences[0]; // primary company reporting location
    }

    return {
      ...p,
      geofence_applied: geofenceApplied,
      reporting_location: reportingLocation,
      has_live_location: !!(p.latitude && p.longitude)
    };
  }).filter(p => p.has_live_location || p.reporting_location);

  res.json({ positions, geofences: companyGeofences });
});

// Route History / Day-wise Movement Path & Waiting Times for All or Single Employee
router.get('/route', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { employee_id, date } = req.query;

  const queryDate = date || new Date().toISOString().split('T')[0];

  // Determine employees to query
  let empQuery = `
    SELECT e.id as employee_id, e.employee_id as employee_code, e.full_name, e.department, e.designation,
           e.geofence_id, e.geofence_mode,
           g.location_name as assigned_geofence_name, g.latitude as assigned_geofence_lat,
           g.longitude as assigned_geofence_lng, g.radius as assigned_geofence_radius
    FROM employees e
    LEFT JOIN geofences g ON e.geofence_id = g.id
    WHERE e.company_id = ? AND e.is_deleted = 0 AND e.status = 'active'
  `;
  const empParams = [companyId];

  // Manager isolation
  if (req.user.role_name === 'manager') {
    empQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    empParams.push(req.user.employee_id, req.user.employee_id);
  }

  // Filter by single employee if requested and not 'all'
  if (employee_id && employee_id !== 'all') {
    empQuery += ' AND e.id = ?';
    empParams.push(parseInt(employee_id, 10));
  }

  const employees = db.prepare(empQuery).all(...empParams);
  const companyGeofences = db.prepare("SELECT id, location_name, latitude, longitude, radius FROM geofences WHERE company_id = ? AND status = 'active'").all(companyId);

  const distinctColors = [
    '#0284c7', // Sky Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#6366f1'  // Indigo
  ];

  const employeeRoutes = employees.map((emp, idx) => {
    // 1. Fetch GPS pings for this day
    const pings = db.prepare(`
      SELECT latitude, longitude, accuracy, speed, location_name, captured_at
      FROM location_tracking_logs
      WHERE company_id = ? AND employee_id = ? AND captured_at LIKE ?
      ORDER BY captured_at ASC
    `).all(companyId, emp.employee_id, `${queryDate}%`);

    // 2. Fetch attendance punch coordinates if available for this day
    const att = db.prepare(`
      SELECT punch_in_lat, punch_in_lng, punch_in_time, punch_in_location,
             punch_out_lat, punch_out_lng, punch_out_time, punch_out_location, status
      FROM attendance_records
      WHERE employee_id = ? AND date = ?
    `).get(emp.employee_id, queryDate);

    const mergedWaypoints = [...pings];

    if (att) {
      if (att.punch_in_lat && att.punch_in_lng) {
        const inTime = att.punch_in_time ? `${queryDate} ${att.punch_in_time}` : `${queryDate} 09:00:00`;
        const exists = mergedWaypoints.some(p => Math.abs(p.latitude - att.punch_in_lat) < 0.0001 && Math.abs(p.longitude - att.punch_in_lng) < 0.0001);
        if (!exists) {
          mergedWaypoints.push({
            latitude: att.punch_in_lat,
            longitude: att.punch_in_lng,
            accuracy: 10,
            speed: 0,
            location_name: att.punch_in_location || 'Punch In Location',
            captured_at: inTime,
            is_punch: 'in'
          });
        }
      }

      if (att.punch_out_lat && att.punch_out_lng) {
        const outTime = att.punch_out_time ? `${queryDate} ${att.punch_out_time}` : `${queryDate} 18:00:00`;
        const exists = mergedWaypoints.some(p => Math.abs(p.latitude - att.punch_out_lat) < 0.0001 && Math.abs(p.longitude - att.punch_out_lng) < 0.0001);
        if (!exists) {
          mergedWaypoints.push({
            latitude: att.punch_out_lat,
            longitude: att.punch_out_lng,
            accuracy: 10,
            speed: 0,
            location_name: att.punch_out_location || 'Punch Out Location',
            captured_at: outTime,
            is_punch: 'out'
          });
        }
      }
    }

    // Sort waypoints chronologically
    mergedWaypoints.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

    // Compute route stops and movements
    const analysis = analyzeRouteWaypoints(mergedWaypoints);

    // Reporting location check
    let geofenceApplied = false;
    let reportingLocation = null;

    if (emp.geofence_id && emp.assigned_geofence_lat && emp.assigned_geofence_lng) {
      geofenceApplied = true;
      reportingLocation = {
        id: emp.geofence_id,
        location_name: emp.assigned_geofence_name,
        latitude: emp.assigned_geofence_lat,
        longitude: emp.assigned_geofence_lng,
        radius: emp.assigned_geofence_radius
      };
    } else if (emp.geofence_mode === 'company' && companyGeofences.length > 0) {
      geofenceApplied = true;
      reportingLocation = companyGeofences[0];
    }

    const latestPing = mergedWaypoints.length > 0 ? mergedWaypoints[mergedWaypoints.length - 1] : null;

    return {
      employee: {
        id: emp.employee_id,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        department: emp.department,
        designation: emp.designation,
        color: distinctColors[idx % distinctColors.length]
      },
      geofence_applied: geofenceApplied,
      reporting_location: reportingLocation,
      current_location: latestPing ? {
        latitude: latestPing.latitude,
        longitude: latestPing.longitude,
        captured_at: latestPing.captured_at,
        location_name: latestPing.location_name
      } : null,
      attendance: att || null,
      waypoints: analysis.waypoints,
      stops: analysis.stops,
      movements: analysis.movements,
      total_distance_km: analysis.total_distance_km,
      total_waiting_mins: analysis.total_waiting_mins
    };
  });

  // If a single employee was requested, also return legacy fields for backward compatibility
  const singleRoute = employeeRoutes.length === 1 ? employeeRoutes[0] : null;

  res.json({
    date: queryDate,
    routes: employeeRoutes,
    total_employees: employeeRoutes.length,
    // Backward compatibility props for single employee view
    employee: singleRoute ? singleRoute.employee : null,
    waypoints: singleRoute ? singleRoute.waypoints : [],
    stops: singleRoute ? singleRoute.stops : [],
    total_distance_km: singleRoute ? singleRoute.total_distance_km : '0.00',
    total_waiting_mins: singleRoute ? singleRoute.total_waiting_mins : 0
  });
});

module.exports = router;

