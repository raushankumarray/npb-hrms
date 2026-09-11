const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole, requireSupportLevel, getTenantCompanyId } = require('../middleware/rbac');
const { validateGeofence } = require('../services/geofence');
const {
  generateAttendanceTemplate,
  validateAttendanceImport,
  commitAttendanceImport
} = require('../services/excelService');
const { logAudit } = require('../services/audit');

const upload = multer({ storage: multer.memoryStorage() });

// Helper to calculate total hours between two times "HH:MM:SS"
function calculateHours(punchIn, punchOut) {
  if (!punchIn || !punchOut) return 0;
  const [h1, m1, s1 = 0] = punchIn.split(':').map(Number);
  const [h2, m2, s2 = 0] = punchOut.split(':').map(Number);
  const totalSeconds = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
  if (totalSeconds <= 0) return 0;
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

// Helper to derive attendance status from working hours and company settings
function deriveStatusFromHours(totalHours, companyId, explicitStatus = null) {
  if (['Leave', 'Holiday', 'Weekly Off', 'WO'].includes(explicitStatus)) {
    return explicitStatus;
  }
  let halfDayMin = 4.0;
  let fullDayMin = 8.0;
  if (companyId) {
    try {
      const s = db.prepare('SELECT half_day_min_hours, full_day_min_hours FROM company_settings WHERE company_id = ?').get(companyId);
      if (s) {
        if (s.half_day_min_hours) halfDayMin = Number(s.half_day_min_hours);
        if (s.full_day_min_hours) fullDayMin = Number(s.full_day_min_hours);
      }
    } catch (e) {}
  }
  if (totalHours >= fullDayMin) return 'Present';
  if (totalHours >= halfDayMin) return 'Half Day';
  return 'Absent';
}

// Auto-migration: ensure correction_type column exists on attendance_correction_requests
try {
  const crTableInfo = db.prepare('PRAGMA table_info(attendance_correction_requests)').all();
  const crCols = crTableInfo.map(c => c.name);
  if (!crCols.includes('correction_type')) {
    db.exec("ALTER TABLE attendance_correction_requests ADD COLUMN correction_type TEXT DEFAULT 'both'");
  }
} catch (e) {
  console.warn('Migration note for attendance_correction_requests:', e.message);
}

// Helper to get company-local current date (YYYY-MM-DD), default to Asia/Kolkata
function getCompanyToday(companyId) {
  let tz = 'Asia/Kolkata';
  if (companyId) {
    try {
      const sett = db.prepare('SELECT timezone FROM company_settings WHERE company_id = ?').get(companyId);
      if (sett && sett.timezone) tz = sett.timezone;
    } catch (e) {}
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

// Helper to get company-local current time (HH:MM:SS), default to Asia/Kolkata
function getCompanyCurrentTime(companyId) {
  let tz = 'Asia/Kolkata';
  if (companyId) {
    try {
      const sett = db.prepare('SELECT timezone FROM company_settings WHERE company_id = ?').get(companyId);
      if (sett && sett.timezone) tz = sett.timezone;
    } catch (e) {}
  }
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.format(new Date());
}

// Get today's attendance status for logged-in employee
router.get('/today', verifyAuth, (req, res) => {
  if (req.user.role_name !== 'employee') {
    return res.status(400).json({ error: 'This endpoint is for employees.' });
  }

  const today = req.query.date || getCompanyToday(req.user.company_id);
  const record = db.prepare(`
    SELECT * FROM attendance_records
    WHERE employee_id = ? AND date = ?
  `).get(req.user.employee_id, today);

  // Fetch employee assigned shift timing
  const empShift = db.prepare(`
    SELECT s.name as shift_name, s.start_time, s.end_time
    FROM employees e
    LEFT JOIN shifts s ON e.shift_id = s.id
    WHERE e.id = ?
  `).get(req.user.employee_id);

  // Check if employee is on approved leave today
  const onLeave = db.prepare(`
    SELECT lr.*, lt.name as leave_type_name
    FROM leave_requests lr
    LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.employee_id = ? AND lr.status = 'approved'
      AND ? BETWEEN lr.start_date AND lr.end_date
  `).get(req.user.employee_id, today);

  res.json({
    record: record || null,
    today,
    onLeave: onLeave || null,
    shift: empShift ? {
      name: empShift.shift_name || 'General Shift',
      start_time: empShift.start_time || '09:00:00',
      end_time: empShift.end_time || '18:00:00'
    } : {
      name: 'General Shift',
      start_time: '09:00:00',
      end_time: '18:00:00'
    }
  });
});

// Monthly Calendar data endpoint (Employee personal or Team/Company aggregate)
router.get('/calendar', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const now = new Date();
  const year = parseInt(req.query.year || now.getFullYear(), 10);
  const month = parseInt(req.query.month || (now.getMonth() + 1), 10);
  const monthStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  let employeeId = req.query.employee_id;
  if (req.user.role_name === 'employee') {
    employeeId = req.user.employee_id;
  }

  // 1. Fetch holidays for this month
  const holidays = companyId ? db.prepare(`
    SELECT id, name, holiday_date, is_optional FROM holidays
    WHERE company_id = ? AND holiday_date LIKE ?
  `).all(companyId, `${datePrefix}%`) : [];

  // 2. Fetch weekly off setting: check employee-specific weekly off first if employeeId is specified
  let offDays = ['Sunday'];
  let isCustomWeeklyOff = false;
  let weeklyOffName = 'Company Scheduled Weekly Off';

  if (companyId) {
    if (employeeId) {
      const empOff = db.prepare(`
        SELECT w.off_days_json, w.is_default, w.name as weekly_off_name
        FROM employees e
        LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id
        WHERE e.id = ? AND e.company_id = ?
      `).get(employeeId, companyId);

      if (empOff && empOff.off_days_json) {
        try {
          offDays = JSON.parse(empOff.off_days_json);
          isCustomWeeklyOff = empOff.is_default === 0;
          weeklyOffName = empOff.weekly_off_name || (isCustomWeeklyOff ? 'Custom Assigned Weekly Off' : 'Company Scheduled Weekly Off');
        } catch (e) {}
      } else {
        // Fallback to Master default
        const masterW = db.prepare(`
          SELECT off_days_json, name FROM weekly_off_settings
          WHERE company_id = ? AND is_default = 1
        `).get(companyId);
        if (masterW && masterW.off_days_json) {
          try {
            offDays = JSON.parse(masterW.off_days_json);
            weeklyOffName = masterW.name || 'Company Scheduled Weekly Off';
          } catch (e) {}
        }
      }
    } else {
      // Company-wide / aggregate view: use Master default
      const masterW = db.prepare(`
        SELECT off_days_json, name FROM weekly_off_settings
        WHERE company_id = ? AND is_default = 1
      `).get(companyId);
      if (masterW && masterW.off_days_json) {
        try {
          offDays = JSON.parse(masterW.off_days_json);
          weeklyOffName = masterW.name || 'Company Scheduled Weekly Off';
        } catch (e) {}
      }
    }
  }

  // 3. Fetch attendance records
  let attQuery = `
    SELECT ar.id, ar.employee_id, ar.date, ar.punch_in_time, ar.punch_out_time, ar.total_hours, ar.status, ar.remarks,
           e.full_name as employee_name, e.employee_id as employee_code, e.department
    FROM attendance_records ar
    JOIN employees e ON ar.employee_id = e.id
    WHERE ar.date LIKE ?
  `;
  const params = [`${datePrefix}%`];

  if (companyId) {
    attQuery += ' AND ar.company_id = ?';
    params.push(companyId);
  }

  if (employeeId) {
    attQuery += ' AND ar.employee_id = ?';
    params.push(employeeId);
  } else if (req.user.role_name === 'manager') {
    attQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
  }

  attQuery += ' ORDER BY ar.date ASC, ar.punch_in_time ASC';

  const records = db.prepare(attQuery).all(...params);

  let employeeCreatedAt = null;
  if (employeeId) {
    const emp = db.prepare('SELECT created_at FROM employees WHERE id = ?').get(employeeId);
    if (emp && emp.created_at) {
      employeeCreatedAt = String(emp.created_at).split('T')[0].split(' ')[0];
    }
  }

  res.json({
    year,
    month,
    holidays,
    offDays,
    isCustomWeeklyOff,
    weeklyOffName,
    employeeCreatedAt,
    records
  });
});

// Reverse geocode latitude and longitude to human-readable map area name
async function reverseGeocodeLocation(lat, lon) {
  if (lat === undefined || lat === null || lon === undefined || lon === null) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
      headers: {
        'User-Agent': 'NPB-HRMS/1.0',
        'Accept-Language': 'en'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const a = data.address;
        const area = a.neighbourhood || a.suburb || a.colony || a.residential || a.road || a.quarter || a.hamlet;
        const city = a.city || a.town || a.village || a.city_district || a.county;
        const state = a.state;
        const parts = [area, city, state].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
        if (data.display_name) return data.display_name.split(',').slice(0, 3).join(', ').trim();
      }
    }
  } catch (err) {
    console.error('Reverse geocoding error:', err.message);
  }
  return null;
}

// Reverse Geocode Route for Employee Panel
router.get('/reverse-geocode', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }
  const locationName = await reverseGeocodeLocation(lat, lon);
  return res.json({
    success: true,
    locationName: locationName || 'Designated Office Area'
  });
});

// Employee GPS Punch In
router.post('/punch-in', verifyAuth, async (req, res) => {
  if (!['employee', 'manager'].includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Only staff members (employees, managers) can punch attendance.' });
  }

  const { latitude, longitude, accuracy, location_name, punch_time, punch_date } = req.body;

  // 1. Mandatory GPS verification & 10m Accuracy Check (desktop & mobile)
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return res.status(400).json({
      error: 'Mandatory GPS location required. Please enable location/GPS permission on your browser/device to Punch In.'
    });
  }

  const verifiedAccuracy = accuracy !== undefined && accuracy !== null ? Number(accuracy) : 10;
  if (verifiedAccuracy > 10) {
    return res.status(400).json({
      error: `GPS accuracy check failed (±${verifiedAccuracy}m). Accuracy must be within 10 meters (True) to Punch In.`
    });
  }

  const companyId = req.user.company_id;
  const employeeId = req.user.employee_id;
  const today = punch_date || getCompanyToday(companyId);
  const nowTime = punch_time || getCompanyCurrentTime(companyId);

  // Check if employee is on approved leave today
  const onLeave = db.prepare(`
    SELECT lr.*, lt.name as leave_type_name
    FROM leave_requests lr
    LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.employee_id = ? AND lr.status = 'approved'
      AND ? BETWEEN lr.start_date AND lr.end_date
  `).get(employeeId, today);

  if (onLeave) {
    return res.status(403).json({
      error: `Cannot mark attendance: You are on approved ${onLeave.leave_type_name || 'Leave'} today (${today}). If attendance needs to be marked, your Manager or Admin can modify the leave record.`
    });
  }

  // 2. Mandatory Geofencing check
  const geofenceCheck = validateGeofence({
    companyId,
    employeeId,
    latitude,
    longitude,
    accuracy
  });

  if (!geofenceCheck.allowed) {
    // Log location tracking attempt for audit
    db.prepare(`
      INSERT INTO location_tracking_logs (company_id, employee_id, latitude, longitude, accuracy, location_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, employeeId, latitude, longitude, accuracy, `BLOCKED_OUTSIDE_GEOFENCE: ${location_name || ''}`);

    return res.status(403).json({
      error: geofenceCheck.reason,
      geofenceFailed: true,
      distance: geofenceCheck.distance,
      allowedRadius: geofenceCheck.allowedRadius
    });
  }

  // 3. Check if already punched in
  const existing = db.prepare(`
    SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?
  `).get(companyId, employeeId, today);

  if (existing && existing.punch_in_time) {
    return res.status(400).json({ error: `Already punched in today at ${existing.punch_in_time}.` });
  }

  // Get employee's assigned shift
  const emp = db.prepare('SELECT shift_id FROM employees WHERE id = ?').get(employeeId);

  // Resolve location strictly to clean area name (no raw coordinates in captured address)
  let resolvedLocation = location_name;
  if (!resolvedLocation || resolvedLocation.includes('Office Location') || resolvedLocation.includes('Employee Device') || resolvedLocation.includes('Authorized Site') || resolvedLocation.includes('Open Field') || resolvedLocation.includes('Map Area')) {
    resolvedLocation = await reverseGeocodeLocation(latitude, longitude);
  }
  // Strip any coordinate patterns from location string
  if (resolvedLocation) {
    resolvedLocation = resolvedLocation.replace(/\s*\(?-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\)?/g, '').replace(/^Map Area\s*/i, '').trim();
  }
  if (!resolvedLocation) {
    const assignedGf = db.prepare(`
      SELECT g.location_name
      FROM geofence_assignments ga
      JOIN geofences g ON ga.geofence_id = g.id
      WHERE ga.employee_id = ? AND g.is_active = 1
      LIMIT 1
    `).get(employeeId);
    resolvedLocation = assignedGf?.location_name || 'Designated Office Area';
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO attendance_records (
        company_id, employee_id, date, punch_in_time,
        punch_in_lat, punch_in_lng, punch_in_location, punch_in_accuracy,
        status, shift_id, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Missing Punch Out', ?, ?)
      ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
        punch_in_time = excluded.punch_in_time,
        punch_in_lat = excluded.punch_in_lat,
        punch_in_lng = excluded.punch_in_lng,
        punch_in_location = excluded.punch_in_location,
        punch_in_accuracy = excluded.punch_in_accuracy,
        status = 'Missing Punch Out',
        shift_id = excluded.shift_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      companyId, employeeId, today, nowTime,
      latitude, longitude, resolvedLocation, accuracy || 10,
      emp ? emp.shift_id : null, geofenceCheck.reason
    );

    // Save location ping
    db.prepare(`
      INSERT INTO location_tracking_logs (company_id, employee_id, latitude, longitude, accuracy, location_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, employeeId, latitude, longitude, accuracy, resolvedLocation || 'Punch In Point');
  });

  transaction();

  res.json({
    success: true,
    message: `Punched in successfully at ${nowTime}`,
    punchInTime: nowTime,
    location: resolvedLocation
  });
});

// Employee GPS Punch Out
router.post('/punch-out', verifyAuth, async (req, res) => {
  if (!['employee', 'manager'].includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Only staff members (employees, managers) can punch attendance.' });
  }

  const { latitude, longitude, accuracy, location_name, punch_time, punch_date } = req.body;

  // 1. Mandatory GPS verification & 10m Accuracy Check (desktop & mobile)
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return res.status(400).json({
      error: 'Mandatory GPS location required. Please enable location/GPS permission on your browser/device to Punch Out.'
    });
  }

  const verifiedAccuracy = accuracy !== undefined && accuracy !== null ? Number(accuracy) : 10;
  if (verifiedAccuracy > 10) {
    return res.status(400).json({
      error: `GPS accuracy check failed (±${verifiedAccuracy}m). Accuracy must be within 10 meters (True) to Punch Out.`
    });
  }

  const companyId = req.user.company_id;
  const employeeId = req.user.employee_id;
  const today = punch_date || getCompanyToday(companyId);
  const nowTime = punch_time || getCompanyCurrentTime(companyId);

  // Check if employee is on approved leave today
  const onLeave = db.prepare(`
    SELECT lr.*, lt.name as leave_type_name
    FROM leave_requests lr
    LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
    WHERE lr.employee_id = ? AND lr.status = 'approved'
      AND ? BETWEEN lr.start_date AND lr.end_date
  `).get(employeeId, today);

  if (onLeave) {
    return res.status(403).json({
      error: `Cannot mark attendance: You are on approved ${onLeave.leave_type_name || 'Leave'} today (${today}). If attendance needs to be marked, your Manager or Admin can modify the leave record.`
    });
  }

  // 2. Mandatory Geofencing check
  const geofenceCheck = validateGeofence({
    companyId,
    employeeId,
    latitude,
    longitude,
    accuracy
  });

  if (!geofenceCheck.allowed) {
    db.prepare(`
      INSERT INTO location_tracking_logs (company_id, employee_id, latitude, longitude, accuracy, location_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, employeeId, latitude, longitude, accuracy, `BLOCKED_OUTSIDE_GEOFENCE: ${location_name || ''}`);

    return res.status(403).json({
      error: geofenceCheck.reason,
      geofenceFailed: true,
      distance: geofenceCheck.distance,
      allowedRadius: geofenceCheck.allowedRadius
    });
  }

  // 3. Find today's attendance
  const existing = db.prepare(`
    SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?
  `).get(companyId, employeeId, today);

  if (!existing || !existing.punch_in_time) {
    return res.status(400).json({ error: 'Cannot Punch Out: Missing Punch In for today. Please raise a Missing Punch Ticket.' });
  }

  // Fetch company threshold settings
  const settings = db.prepare('SELECT half_day_min_hours, full_day_min_hours FROM company_settings WHERE company_id = ?').get(companyId) || {
    half_day_min_hours: 4.0,
    full_day_min_hours: 8.0
  };

  const totalHours = calculateHours(existing.punch_in_time, nowTime);

  // Status calculation logic
  let attendanceStatus = 'Present';
  if (totalHours < settings.half_day_min_hours) {
    attendanceStatus = 'Absent';
  } else if (totalHours < settings.full_day_min_hours) {
    attendanceStatus = 'Half Day';
  } else {
    attendanceStatus = 'Present';
  }

  // Resolve location strictly to clean area name (no raw coordinates in captured address)
  let resolvedLocation = location_name;
  if (!resolvedLocation || resolvedLocation.includes('Office Location') || resolvedLocation.includes('Employee Device') || resolvedLocation.includes('Authorized Site') || resolvedLocation.includes('Open Field') || resolvedLocation.includes('Map Area')) {
    resolvedLocation = await reverseGeocodeLocation(latitude, longitude);
  }
  // Strip any coordinate patterns from location string
  if (resolvedLocation) {
    resolvedLocation = resolvedLocation.replace(/\s*\(?-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\)?/g, '').replace(/^Map Area\s*/i, '').trim();
  }
  if (!resolvedLocation) {
    const assignedGf = db.prepare(`
      SELECT g.location_name
      FROM geofence_assignments ga
      JOIN geofences g ON ga.geofence_id = g.id
      WHERE ga.employee_id = ? AND g.is_active = 1
      LIMIT 1
    `).get(employeeId);
    resolvedLocation = assignedGf?.location_name || 'Designated Office Area';
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE attendance_records SET
        punch_out_time = ?,
        punch_out_lat = ?,
        punch_out_lng = ?,
        punch_out_location = ?,
        punch_out_accuracy = ?,
        total_hours = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nowTime, latitude, longitude, resolvedLocation,
      accuracy || 10, totalHours, attendanceStatus, existing.id
    );

    db.prepare(`
      INSERT INTO location_tracking_logs (company_id, employee_id, latitude, longitude, accuracy, location_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(companyId, employeeId, latitude, longitude, accuracy, resolvedLocation || 'Punch Out Point');
  });

  transaction();

  res.json({
    success: true,
    message: `Punched out successfully at ${nowTime}. Total hours: ${totalHours} hrs (${attendanceStatus}).`,
    punchOutTime: nowTime,
    totalHours,
    status: attendanceStatus
  });
});

// Attendance List with Daily, Range & Monthly filters, search, day-wise sorting & pagination
router.get('/list', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const {
    from_date, to_date, date, day, month, year,
    employee_id, employee_ids, department, manager_id, status, search,
    limit = 10, offset = 0
  } = req.query;

  const effectiveDate = date || day || (from_date && to_date && from_date === to_date ? from_date : null);

  if (effectiveDate) {
    // SINGLE DATE MODE (Today or specific date): Show ALL active assigned employees with resolved real-time status
    let singleBaseQuery = `
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN employees m ON e.manager_id = m.id
      LEFT JOIN attendance_records a ON a.employee_id = e.id AND a.date = ?
      LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.status = 'approved' AND ? BETWEEN lr.start_date AND lr.end_date
      LEFT JOIN holidays hol ON hol.company_id = e.company_id AND hol.holiday_date = ?
      WHERE e.is_deleted = 0 AND e.status = 'active'
    `;
    const singleParams = [effectiveDate, effectiveDate, effectiveDate];

    if (companyId) {
      singleBaseQuery += ' AND e.company_id = ?';
      singleParams.push(companyId);
    }

    if (req.user.role_name === 'manager') {
      singleBaseQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
      singleParams.push(req.user.employee_id, req.user.employee_id);
    } else if (req.user.role_name === 'employee') {
      singleBaseQuery += ' AND e.id = ?';
      singleParams.push(req.user.employee_id);
    }

    if (employee_ids) {
      const ids = String(employee_ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length > 0) {
        singleBaseQuery += ` AND e.id IN (${ids.map(() => '?').join(',')})`;
        singleParams.push(...ids);
      }
    } else if (employee_id && employee_id !== 'all') {
      singleBaseQuery += ' AND e.id = ?';
      singleParams.push(parseInt(employee_id, 10));
    }

    if (department) {
      singleBaseQuery += ' AND e.department = ?';
      singleParams.push(department);
    }

    if (manager_id) {
      singleBaseQuery += ' AND e.manager_id = ?';
      singleParams.push(manager_id);
    }

    if (search) {
      singleBaseQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR a.remarks LIKE ?)';
      singleParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Status expression for this date
    const statusExpr = `
      CASE 
        WHEN a.status IS NOT NULL THEN a.status
        WHEN lr.id IS NOT NULL THEN 'Leave'
        WHEN hol.id IS NOT NULL THEN 'Holiday'
        WHEN strftime('%w', ?) = '0' THEN 'Weekly Off'
        ELSE 'Absent'
      END
    `;

    // Filter by status if specified
    if (status && status !== 'all') {
      if (status === 'WO' || status === 'Weekly Off') {
        singleBaseQuery += ` AND (${statusExpr} IN ('Weekly Off', 'WO'))`;
        singleParams.push(effectiveDate);
      } else if (status === 'HO' || status === 'Holiday') {
        singleBaseQuery += ` AND (${statusExpr} IN ('Holiday', 'HO'))`;
        singleParams.push(effectiveDate);
      } else {
        singleBaseQuery += ` AND (${statusExpr} = ?)`;
        singleParams.push(effectiveDate, status);
      }
    }

    const countQuery = `SELECT COUNT(*) as total ${singleBaseQuery}`;
    const total = db.prepare(countQuery).get(...singleParams).total;

    // Summary counts for fast header stats
    const summaryQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN (${statusExpr}) IN ('Present', 'Missing Punch Out') THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN (${statusExpr}) = 'Absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN (${statusExpr}) = 'Half Day' THEN 1 ELSE 0 END) as half_day,
        SUM(CASE WHEN (${statusExpr}) IN ('Leave', 'Holiday', 'Weekly Off', 'WO', 'HO') THEN 1 ELSE 0 END) as leave
      ${singleBaseQuery}
    `;
    const summary = db.prepare(summaryQuery).get(
      effectiveDate, effectiveDate, effectiveDate, effectiveDate,
      ...singleParams
    );

    const dataQuery = `
      SELECT 
        COALESCE(a.id, 0) as id,
        e.id as employee_id,
        e.employee_id as employee_code,
        e.full_name as employee_name,
        e.department,
        e.designation,
        c.name as company_name,
        s.name as shift_name,
        m.full_name as manager_name,
        COALESCE(a.date, ?) as date,
        a.punch_in_time,
        a.punch_out_time,
        a.punch_in_lat,
        a.punch_in_lng,
        a.punch_in_location,
        a.punch_out_lat,
        a.punch_out_lng,
        a.punch_out_location,
        a.total_hours,
        (${statusExpr}) as status,
        COALESCE(
          a.remarks,
          CASE
            WHEN lr.id IS NOT NULL THEN 'On Approved Leave'
            WHEN hol.id IS NOT NULL THEN 'Holiday: ' || hol.name
            WHEN strftime('%w', ?) = '0' THEN 'Weekly Off'
            ELSE 'Absent (No punch recorded)'
          END
        ) as remarks,
        COALESCE(a.is_edited, 0) as is_edited
      ${singleBaseQuery}
      ORDER BY 
        CASE WHEN a.punch_in_time IS NOT NULL THEN 0 ELSE 1 END,
        e.full_name ASC
      LIMIT ? OFFSET ?
    `;

    const records = db.prepare(dataQuery).all(
      effectiveDate, effectiveDate, effectiveDate,
      ...singleParams,
      parseInt(limit, 10), parseInt(offset, 10)
    );

    const comp = companyId ? db.prepare('SELECT id, name, code FROM companies WHERE id = ?').get(companyId) : null;

    return res.json({
      records,
      total,
      summary: {
        total: summary?.total || 0,
        present: summary?.present || 0,
        absent: summary?.absent || 0,
        half_day: summary?.half_day || 0,
        leave: summary?.leave || 0
      },
      company: comp
    });
  }

  // MULTI-DATE / MONTH / ALL DATES MODE
  let baseQuery = `
    FROM attendance_records a
    JOIN employees e ON a.employee_id = e.id
    JOIN companies c ON a.company_id = c.id
    LEFT JOIN shifts s ON a.shift_id = s.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE e.is_deleted = 0
  `;
  const params = [];

  if (companyId) {
    baseQuery += ' AND a.company_id = ?';
    params.push(companyId);
  }

  // Manager restriction
  if (req.user.role_name === 'manager') {
    baseQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
  } else if (req.user.role_name === 'employee') {
    baseQuery += ' AND a.employee_id = ?';
    params.push(req.user.employee_id);
  }

  if (employee_ids) {
    const ids = String(employee_ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    if (ids.length > 0) {
      baseQuery += ` AND a.employee_id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
  } else if (employee_id && employee_id !== 'all') {
    baseQuery += ' AND a.employee_id = ?';
    params.push(parseInt(employee_id, 10));
  }

  if (from_date && to_date) {
    baseQuery += ' AND a.date BETWEEN ? AND ?';
    params.push(from_date, to_date);
  } else if (from_date) {
    baseQuery += ' AND a.date >= ?';
    params.push(from_date);
  } else if (to_date) {
    baseQuery += ' AND a.date <= ?';
    params.push(to_date);
  } else if (month && year) {
    const mStr = String(month).padStart(2, '0');
    baseQuery += ' AND a.date LIKE ?';
    params.push(`${year}-${mStr}-%`);
  } else if (month && typeof month === 'string' && month.includes('-')) {
    baseQuery += ' AND a.date LIKE ?';
    params.push(`${month}-%`);
  }

  if (department) {
    baseQuery += ' AND e.department = ?';
    params.push(department);
  }

  if (manager_id) {
    baseQuery += ' AND e.manager_id = ?';
    params.push(manager_id);
  }

  if (status && status !== 'all') {
    if (status === 'WO' || status === 'Weekly Off') {
      baseQuery += " AND a.status IN ('Weekly Off', 'WO')";
    } else if (status === 'HO' || status === 'Holiday') {
      baseQuery += " AND a.status IN ('Holiday', 'HO')";
    } else {
      baseQuery += ' AND a.status = ?';
      params.push(status);
    }
  }

  if (search) {
    baseQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR a.remarks LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
  const total = db.prepare(countQuery).get(...params).total;

  // Summary counts for fast header stats
  const summaryQuery = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN a.status IN ('Present', 'Missing Punch Out') THEN 1 ELSE 0 END) as present,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent,
      SUM(CASE WHEN a.status = 'Half Day' THEN 1 ELSE 0 END) as half_day,
      SUM(CASE WHEN a.status IN ('Leave', 'Holiday', 'Weekly Off', 'WO', 'HO') THEN 1 ELSE 0 END) as leave
    ${baseQuery}
  `;
  const summary = db.prepare(summaryQuery).get(...params);

  const dataQuery = `
    SELECT a.*, e.employee_id as employee_code, e.full_name as employee_name, e.department, e.designation,
           c.name as company_name, s.name as shift_name,
           m.full_name as manager_name
    ${baseQuery}
    ORDER BY a.date DESC, a.punch_in_time DESC
    LIMIT ? OFFSET ?
  `;

  const records = db.prepare(dataQuery).all(...params, parseInt(limit, 10), parseInt(offset, 10));

  const comp = companyId ? db.prepare('SELECT id, name, code FROM companies WHERE id = ?').get(companyId) : null;

  res.json({
    records,
    total,
    summary: {
      total: summary?.total || 0,
      present: summary?.present || 0,
      absent: summary?.absent || 0,
      half_day: summary?.half_day || 0,
      leave: summary?.leave || 0
    },
    company: comp
  });
});

// Helpers for clean display and formatting
function cleanAreaName(raw) {
  if (!raw || raw === '-' || raw === '--') return '--';
  let cleaned = String(raw).replace(/\s*\(?-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+\)?/g, '').replace(/^Map Area\s*/i, '').trim();
  cleaned = cleaned.replace(/^,\s*|,\s*$/g, '').trim();
  return cleaned || 'Office / Designated Area';
}

function format12Hour(timeStr) {
  if (!timeStr || timeStr === '-' || timeStr === '--' || timeStr === '--:--:--' || timeStr === '--:--') return '--:--:--';
  if (typeof timeStr === 'string' && (timeStr.includes('AM') || timeStr.includes('PM'))) return timeStr;
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  if (isNaN(hours)) return timeStr;
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function formatWorkingHoursHHMM(totalHours, inTime, outTime) {
  if (totalHours !== null && totalHours !== undefined && !isNaN(Number(totalHours)) && Number(totalHours) > 0) {
    const th = Number(totalHours);
    let h = Math.floor(th);
    let m = Math.round((th - h) * 60);
    if (m >= 60) { h += 1; m = 0; }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (inTime && outTime && inTime !== '-' && inTime !== '--:--:--' && outTime !== '-' && outTime !== '--:--:--') {
    const p1 = String(inTime).split(':').map(Number);
    const p2 = String(outTime).split(':').map(Number);
    if (!p1.some(isNaN) && !p2.some(isNaN)) {
      const s1 = (p1[0] || 0) * 3600 + (p1[1] || 0) * 60 + (p1[2] || 0);
      const s2 = (p2[0] || 0) * 3600 + (p2[1] || 0) * 60 + (p2[2] || 0);
      const diffSec = s2 - s1;
      if (diffSec > 0) {
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
  }
  return '00:00';
}

// Generate Full Month Attendance Rows For All Assigned Employees Without Skipping Any Date
function generateFullMonthAttendanceRows(req, options = {}) {
  const companyId = getTenantCompanyId(req);
  const {
    month,
    year,
    employee_id,
    employee_ids,
    status,
    search
  } = options;

  const yInt = parseInt(year, 10) || new Date().getFullYear();
  const mInt = parseInt(month, 10) || (new Date().getMonth() + 1);
  const mStr = String(mInt).padStart(2, '0');
  const daysInMonth = new Date(yInt, mInt, 0).getDate();

  // Find all eligible active employees
  let empQuery = `
    SELECT e.*, c.name as company_name, s.name as shift_name, s.start_time, s.end_time
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    LEFT JOIN shifts s ON e.shift_id = s.id
    WHERE e.is_deleted = 0 AND e.status = 'active'
  `;
  const empParams = [];
  if (companyId) {
    empQuery += ' AND e.company_id = ?';
    empParams.push(companyId);
  }

  if (req.user.role_name === 'manager') {
    empQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    empParams.push(req.user.employee_id, req.user.employee_id);
  } else if (req.user.role_name === 'employee') {
    empQuery += ' AND e.id = ?';
    empParams.push(req.user.employee_id);
  }

  if (employee_ids) {
    const ids = Array.isArray(employee_ids)
      ? employee_ids.map(Number).filter(n => !isNaN(n))
      : String(employee_ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    if (ids.length > 0) {
      empQuery += ` AND e.id IN (${ids.map(() => '?').join(',')})`;
      empParams.push(...ids);
    }
  } else if (employee_id && employee_id !== 'all') {
    empQuery += ' AND e.id = ?';
    empParams.push(parseInt(employee_id, 10));
  }

  if (search) {
    empQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ?)';
    empParams.push(`%${search}%`, `%${search}%`);
  }

  empQuery += ' ORDER BY e.full_name ASC';
  const employees = db.prepare(empQuery).all(...empParams);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const allRows = [];

  // Pre-fetch weekly off settings and holidays for company
  const companyHolidays = companyId
    ? db.prepare('SELECT holiday_date, name FROM holidays WHERE company_id = ? AND holiday_date LIKE ?').all(companyId, `${yInt}-${mStr}-%`)
    : db.prepare('SELECT holiday_date, name, company_id FROM holidays WHERE holiday_date LIKE ?').all(`${yInt}-${mStr}-%`);

  const companyWeeklyOffs = companyId
    ? db.prepare('SELECT * FROM weekly_off_settings WHERE company_id = ?').all(companyId)
    : db.prepare('SELECT * FROM weekly_off_settings').all();

  const defaultWeeklyOffMap = {};
  companyWeeklyOffs.filter(w => w.is_default === 1).forEach(w => {
    try { defaultWeeklyOffMap[w.company_id] = JSON.parse(w.off_days_json); } catch (e) {}
  });

  const specificWeeklyOffMap = {};
  companyWeeklyOffs.forEach(w => {
    try { specificWeeklyOffMap[w.id] = JSON.parse(w.off_days_json); } catch (e) {}
  });

  for (const emp of employees) {
    const todayStr = getCompanyToday(emp.company_id);

    // Determine weekly off days for this employee
    let offDays = ['Sunday'];
    if (emp.weekly_off_id && specificWeeklyOffMap[emp.weekly_off_id]) {
      offDays = specificWeeklyOffMap[emp.weekly_off_id];
    } else if (defaultWeeklyOffMap[emp.company_id]) {
      offDays = defaultWeeklyOffMap[emp.company_id];
    }

    // Holidays map for this employee's company
    const holMap = {};
    companyHolidays.filter(h => !h.company_id || h.company_id === emp.company_id).forEach(h => {
      holMap[h.holiday_date] = h.name;
    });

    // Approved leaves for this employee in this month
    const leaves = db.prepare(`
      SELECT lr.*, lt.name as leave_name
      FROM leave_requests lr
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = ? AND lr.status = 'approved'
        AND (lr.start_date <= ? AND lr.end_date >= ?)
    `).all(emp.id, `${yInt}-${mStr}-${daysInMonth}`, `${yInt}-${mStr}-01`);

    // Attendance records for this employee in this month
    const attList = db.prepare(`
      SELECT * FROM attendance_records
      WHERE employee_id = ? AND date LIKE ?
    `).all(emp.id, `${yInt}-${mStr}-%`);
    const attMap = {};
    attList.forEach(a => { attMap[a.date] = a; });

    // Loop through ALL days from 1 to daysInMonth without skipping any date!
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const curDateStr = `${yInt}-${mStr}-${dStr}`;
      const dObj = new Date(yInt, mInt - 1, d);
      const dayOfWeek = dayNames[dObj.getDay()];

      const att = attMap[curDateStr];
      const isHoliday = holMap[curDateStr];
      const isWO = offDays.includes(dayOfWeek);
      const leave = leaves.find(l => curDateStr >= l.start_date && curDateStr <= l.end_date);

      let rowStatus = 'Upcoming';
      let punchIn12 = '--:--:--';
      let punchOut12 = '--:--:--';
      let punchInLatLong = '--';
      let punchOutLatLong = '--';
      let punchInAddress = '--';
      let punchOutAddress = '--';
      let workingHoursHHMM = '00:00';
      let remarks = '';

      if (att) {
        rowStatus = att.status || 'Present';
        punchIn12 = att.punch_in_time ? format12Hour(att.punch_in_time) : '--:--:--';
        punchOut12 = att.punch_out_time ? format12Hour(att.punch_out_time) : '--:--:--';
        punchInLatLong = (att.punch_in_lat && att.punch_in_lng) ? `${Number(att.punch_in_lat).toFixed(4)}, ${Number(att.punch_in_lng).toFixed(4)}` : '--';
        punchOutLatLong = (att.punch_out_lat && att.punch_out_lng) ? `${Number(att.punch_out_lat).toFixed(4)}, ${Number(att.punch_out_lng).toFixed(4)}` : '--';
        punchInAddress = cleanAreaName(att.punch_in_location);
        punchOutAddress = cleanAreaName(att.punch_out_location);
        workingHoursHHMM = formatWorkingHoursHHMM(att.total_hours, att.punch_in_time, att.punch_out_time);
        remarks = att.remarks || rowStatus;
      } else if (leave) {
        rowStatus = 'Leave';
        remarks = `On Approved ${leave.leave_name || 'Leave'}`;
      } else if (isHoliday) {
        rowStatus = 'Holiday';
        remarks = `Holiday: ${isHoliday}`;
      } else if (isWO) {
        rowStatus = 'Weekly Off';
        remarks = `Scheduled Weekly Off (${dayOfWeek})`;
      } else if (curDateStr <= todayStr) {
        rowStatus = 'Absent';
        remarks = 'Absent (No punch recorded)';
      } else {
        rowStatus = 'Upcoming';
        remarks = 'Upcoming Date';
      }

      // Filter by status if provided
      if (status && status !== 'all') {
        if (status === 'WO' || status === 'Weekly Off') {
          if (rowStatus !== 'Weekly Off' && rowStatus !== 'WO') continue;
        } else if (status === 'HO' || status === 'Holiday') {
          if (rowStatus !== 'Holiday' && rowStatus !== 'HO') continue;
        } else if (status.toLowerCase() !== rowStatus.toLowerCase()) {
          continue;
        }
      }

      allRows.push({
        id: att ? att.id : `${emp.id}_${curDateStr}`,
        employee_db_id: emp.id,
        "Employee ID": emp.employee_id || '-',
        "Employee Name": emp.full_name,
        "Employee": `${emp.full_name} (${emp.employee_id || 'EMP'})`,
        "Date": `${curDateStr} (${dayOfWeek.substring(0, 3)})`,
        date_raw: curDateStr,
        day_of_week: dayOfWeek,
        "Punch In Time": punchIn12,
        "Punch In Lat/Long": punchInLatLong,
        "Punch In Address": punchInAddress,
        "Punch Out Time": punchOut12,
        "Punch Out Lat/Long": punchOutLatLong,
        "Punch Out Address": punchOutAddress,
        "Status": rowStatus,
        "Working Hours (HH:MM)": workingHoursHHMM,
        // Compatibility aliases:
        "Punch In": punchIn12,
        "Punch Out": punchOut12,
        "Hours": workingHoursHHMM,
        "Working Hours": workingHoursHHMM,
        "Location / Geofence": punchInAddress !== '--' ? punchInAddress : 'Office',
        "GPS Lat/Long (Punch In)": punchInLatLong,
        "Address (Punch In)": punchInAddress,
        "GPS Lat/Long (Punch Out)": punchOutLatLong,
        "Address (Punch Out)": punchOutAddress,
        "Remarks": remarks,
        "Department": emp.department || '',
        "Shift": emp.shift_name || 'General'
      });
    }
  }

  return allRows;
}

// GET /attendance/full-month-logs: Generates and returns non-skipping monthly attendance logs for all employees
router.get('/full-month-logs', verifyAuth, (req, res) => {
  const allowedRoles = ['super_admin', 'company_admin', 'manager', 'support', 'employee'];
  if (!allowedRoles.includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Unauthorized to view attendance logs.' });
  }

  const {
    month,
    year,
    employee_id,
    employee_ids,
    status,
    search,
    limit = 50,
    offset = 0
  } = req.query;

  const allRows = generateFullMonthAttendanceRows(req, {
    month,
    year,
    employee_id,
    employee_ids,
    status,
    search
  });

  const total = allRows.length;
  const pLimit = parseInt(limit, 10) || 50;
  const pOffset = parseInt(offset, 10) || 0;
  const records = allRows.slice(pOffset, pOffset + pLimit);

  const summary = {
    total,
    present: 0,
    absent: 0,
    half_day: 0,
    leave: 0,
    wo: 0,
    holiday: 0
  };

  allRows.forEach(r => {
    const s = (r.Status || '').toLowerCase();
    if (s === 'present') summary.present++;
    else if (s === 'absent') summary.absent++;
    else if (s === 'half day') summary.half_day++;
    else if (s === 'leave') summary.leave++;
    else if (s === 'weekly off' || s === 'wo') summary.wo++;
    else if (s === 'holiday' || s === 'ho') summary.holiday++;
  });

  res.json({
    records,
    total,
    summary
  });
});

// Manual Attendance Correction (Super Admin, Support L2+, Company Admin, Manager)
router.put('/correct/:id', verifyAuth, (req, res) => {
  const allowedRoles = ['super_admin', 'company_admin', 'manager', 'support'];
  if (!allowedRoles.includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Unauthorized to manually edit attendance.' });
  }

  // Support level check
  if (req.user.role_name === 'support' && (req.user.support_level || 0) < 2) {
    return res.status(403).json({ error: 'Support Level 2 or higher required to edit attendance.' });
  }

  const recordId = parseInt(req.params.id, 10);
  const { punch_in_time, punch_out_time, status, reason, remarks, total_hours } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'A mandatory audit reason is required for attendance correction.' });
  }

  const current = db.prepare(`
    SELECT a.*, e.employee_id as emp_code, e.full_name
    FROM attendance_records a
    JOIN employees e ON a.employee_id = e.id
    WHERE a.id = ?
  `).get(recordId);

  if (!current) {
    return res.status(404).json({ error: 'Attendance record not found.' });
  }

  // Multi-tenant check
  if (req.user.role_name !== 'super_admin' && req.user.role_name !== 'support') {
    if (req.user.company_id !== current.company_id) {
      return res.status(403).json({ error: 'Access denied to other company data.' });
    }
  }

  const newPunchIn = punch_in_time !== undefined ? punch_in_time : current.punch_in_time;
  const newPunchOut = punch_out_time !== undefined ? punch_out_time : current.punch_out_time;
  const newHours = (punch_in_time !== undefined || punch_out_time !== undefined)
    ? calculateHours(newPunchIn, newPunchOut)
    : (total_hours !== undefined && total_hours !== '' ? parseFloat(total_hours) : (current.total_hours || 0));
  const newStatus = (newPunchIn && newPunchOut)
    ? deriveStatusFromHours(newHours, current.company_id, null)
    : ((!status || status === 'auto' || ['Present', 'Half Day', 'Absent'].includes(status))
      ? deriveStatusFromHours(newHours, current.company_id, null)
      : (status || current.status));

  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  const transaction = db.transaction(() => {
    // 1. Update record
    db.prepare(`
      UPDATE attendance_records SET
        punch_in_time = ?,
        punch_out_time = ?,
        total_hours = ?,
        status = ?,
        remarks = COALESCE(?, remarks),
        is_edited = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPunchIn, newPunchOut, newHours, newStatus, remarks, recordId);

    // 2. Mandatory Attendance Audit Log
    db.prepare(`
      INSERT INTO attendance_edit_logs (
        attendance_record_id, employee_id, edited_by, editor_role, panel, reason,
        original_punch_in, original_punch_out, original_status,
        new_punch_in, new_punch_out, new_status, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recordId, current.employee_id, req.user.id, req.user.role_name,
      `${req.user.role_name} Attendance Panel`, reason,
      current.punch_in_time, current.punch_out_time, current.status,
      newPunchIn, newPunchOut, newStatus, ipAddress
    );

    // 3. Central Audit Log
    logAudit({
      companyId: current.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Attendance Correction',
      action: 'ATTENDANCE_CORRECTED',
      targetEntity: 'attendance_records',
      targetId: recordId,
      oldValues: { punch_in: current.punch_in_time, punch_out: current.punch_out_time, status: current.status },
      newValues: { punch_in: newPunchIn, punch_out: newPunchOut, status: newStatus },
      reason,
      ipAddress
    });
  });

  transaction();
  res.json({ success: true, message: 'Attendance record corrected and audit log recorded.' });
});

// View Audit History for an Attendance Record
router.get('/audit-history/:id', verifyAuth, (req, res) => {
  const recordId = parseInt(req.params.id, 10);
  const logs = db.prepare(`
    SELECT l.*, u.username as editor_name
    FROM attendance_edit_logs l
    JOIN users u ON l.edited_by = u.id
    WHERE l.attendance_record_id = ?
    ORDER BY l.created_at DESC
  `).all(recordId);

  res.json({ auditHistory: logs });
});

// Manual Attendance Entry / Upsert (Manager, Company Admin, Super Admin)
router.post('/manual', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const companyId = getTenantCompanyId(req);
  const {
    employee_id,
    date,
    punch_in_time,
    punch_out_time,
    status = 'Present',
    total_hours,
    remarks,
    reason
  } = req.body;

  if (!employee_id || !date || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Employee, Date, and a mandatory Audit Reason are required.' });
  }

  // Resolve employee
  const emp = db.prepare(`
    SELECT * FROM employees WHERE (id = ? OR employee_id = ?) AND company_id = ? AND is_deleted = 0
  `).get(employee_id, employee_id, companyId);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found in company.' });
  }

  // If manager, check mapping
  if (req.user.role_name === 'manager') {
    const isMapped = emp.manager_id === req.user.employee_id || db.prepare(`
      SELECT 1 FROM employee_mappings WHERE manager_id = ? AND employee_id = ?
    `).get(req.user.employee_id, emp.id);
    if (!isMapped) {
      return res.status(403).json({ error: 'You can only record attendance for assigned team members.' });
    }
  }

  const hours = (punch_in_time && punch_out_time)
    ? calculateHours(punch_in_time, punch_out_time)
    : (total_hours !== undefined && total_hours !== '' ? parseFloat(total_hours) : 0);
  const effectiveStatus = (punch_in_time && punch_out_time)
    ? deriveStatusFromHours(hours, companyId, null)
    : ((!status || status === 'auto' || ['Present', 'Half Day', 'Absent'].includes(status))
      ? deriveStatusFromHours(hours, companyId, null)
      : status);
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO attendance_records (
        company_id, employee_id, date, punch_in_time, punch_out_time,
        total_hours, status, remarks, is_edited, shift_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
      ) ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
        punch_in_time = excluded.punch_in_time,
        punch_out_time = excluded.punch_out_time,
        total_hours = excluded.total_hours,
        status = excluded.status,
        remarks = COALESCE(excluded.remarks, attendance_records.remarks),
        is_edited = 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(companyId, emp.id, date, punch_in_time || null, punch_out_time || null, hours, effectiveStatus, remarks || 'Manual manager entry', emp.shift_id || null);

    const record = db.prepare(`SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?`).get(companyId, emp.id, date);

    if (record) {
      db.prepare(`
        INSERT INTO attendance_edit_logs (
          attendance_record_id, employee_id, edited_by, editor_role, panel, reason,
          original_punch_in, original_punch_out, original_status,
          new_punch_in, new_punch_out, new_status, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, emp.id, req.user.id, req.user.role_name,
        `${req.user.role_name} Daily Attendance Reports`, reason.trim(),
        null, null, null,
        punch_in_time || null, punch_out_time || null, status, ipAddress
      );

      logAudit({
        companyId,
        userId: req.user.id,
        userName: req.user.username,
        role: req.user.role_name,
        panel: 'Daily Attendance Reports',
        action: 'ATTENDANCE_MANUAL_RECORD',
        targetEntity: 'attendance_records',
        targetId: record.id,
        newValues: { punch_in: punch_in_time, punch_out: punch_out_time, status, hours },
        reason: reason.trim(),
        ipAddress
      });
    }
  });

  transaction();
  res.json({ success: true, message: `Attendance for ${emp.full_name} (${date}) recorded successfully.` });
});

// Download Attendance Excel Template
router.get('/excel/template', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const buffer = generateAttendanceTemplate(companyId);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="Attendance_Update_Template.xlsx"');
  res.send(buffer);
});

// Validate Attendance Excel Import
router.post('/excel/validate', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload an Excel file.' });
  }

  const companyId = getTenantCompanyId(req);
  try {
    const result = validateAttendanceImport(req.file.buffer, companyId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Failed to process Excel file: ' + err.message });
  }
});

// Commit Attendance Excel Import
router.post('/excel/commit', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const { validRows } = req.body;
  if (!Array.isArray(validRows) || validRows.length === 0) {
    return res.status(400).json({ error: 'No valid attendance rows provided.' });
  }

  const companyId = getTenantCompanyId(req);
  try {
    const result = commitAttendanceImport(validRows, companyId, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save attendance updates: ' + err.message });
  }
});

// Custom Attendance Export (Excel / PDF) with Company Header, Date Range & Filtered Record Count
router.post('/export', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const {
    format = 'xlsx',
    selected_columns,
    from_date, to_date, date, day, month, year,
    employee_id, employee_ids, department, manager_id, status, search,
    is_full_month, scope, target_scope
  } = req.body;

  const defaultCols = [
    'Employee ID', 'Employee Name', 'Punch In Time', 'Punch In Lat/Long', 'Punch In Address',
    'Punch Out Time', 'Punch Out Lat/Long', 'Punch Out Address', 'Status', 'Working Hours (HH:MM)'
  ];
  const activeCols = (selected_columns && selected_columns.length > 0) ? selected_columns : defaultCols;

  const effectiveDate = date || day || (from_date && to_date && from_date === to_date ? from_date : null);

  const company = companyId ? db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId) : null;
  const companyName = company ? company.name : 'NPB HRMS Attendance Management';
  const { exportCustomExcel, exportHtmlReport } = require('../services/exportService');

  // FULL MONTH ALL EMPLOYEES LOGS EXPORT (DO NOT SKIP ANY DATE)
  const isFullMonth = is_full_month === true || scope === 'full_month' || target_scope === 'full_month' || (!effectiveDate && month && year && !from_date && !to_date);
  if (isFullMonth) {
    const allRows = generateFullMonthAttendanceRows(req, {
      month,
      year,
      employee_id,
      employee_ids,
      status,
      search
    });

    const mInt = parseInt(month, 10) || (new Date().getMonth() + 1);
    const yInt = parseInt(year, 10) || new Date().getFullYear();
    const dateRangeLabel = `Month: ${yInt}-${String(mInt).padStart(2, '0')} (Full Month Logs - All Team Staff)`;

    // Enforce Date as the 1st column for monthly reports export in PDF and Excel
    const fullMonthCols = activeCols.includes('Date')
      ? ['Date', ...activeCols.filter(c => c !== 'Date')]
      : ['Date', ...activeCols];

    if (format === 'xlsx' || format === 'excel') {
      const excelBuffer = exportCustomExcel({
        data: allRows,
        selectedColumns: fullMonthCols,
        sheetName: `Full Month ${yInt}-${mInt}`,
        companyName,
        reportTitle: `All Employee Full Month Attendance Log File (${yInt}-${String(mInt).padStart(2, '0')})`,
        dateRange: dateRangeLabel,
        totalRecords: allRows.length
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Full_Month_Attendance_${yInt}_${mInt}_${Date.now()}.xlsx"`);
      return res.send(excelBuffer);
    } else if (format === 'pdf' || format === 'html') {
      const htmlReport = exportHtmlReport({
        data: allRows,
        selectedColumns: fullMonthCols,
        title: `All Employee Full Month Attendance Log File (${yInt}-${String(mInt).padStart(2, '0')})`,
        companyName,
        dateRange: dateRangeLabel,
        totalRecords: allRows.length,
        generatedBy: req.user.username
      });

      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlReport);
    }

    return res.status(400).json({ error: 'Unsupported format.' });
  }

  if (effectiveDate) {
    // SINGLE DATE MODE: Export ALL active employees (even if no punch row yet) with real-time resolved status
    let singleBaseQuery = `
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN employees m ON e.manager_id = m.id
      LEFT JOIN attendance_records a ON a.employee_id = e.id AND a.date = ?
      LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.status = 'approved' AND ? BETWEEN lr.start_date AND lr.end_date
      LEFT JOIN holidays hol ON hol.company_id = e.company_id AND hol.holiday_date = ?
      WHERE e.is_deleted = 0 AND e.status = 'active'
    `;
    const singleParams = [effectiveDate, effectiveDate, effectiveDate];

    if (companyId) {
      singleBaseQuery += ' AND e.company_id = ?';
      singleParams.push(companyId);
    }

    if (req.user.role_name === 'manager') {
      singleBaseQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
      singleParams.push(req.user.employee_id, req.user.employee_id);
    } else if (req.user.role_name === 'employee') {
      singleBaseQuery += ' AND e.id = ?';
      singleParams.push(req.user.employee_id);
    }

    if (employee_ids) {
      const ids = Array.isArray(employee_ids)
        ? employee_ids.map(Number).filter(n => !isNaN(n))
        : String(employee_ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length > 0) {
        singleBaseQuery += ` AND e.id IN (${ids.map(() => '?').join(',')})`;
        singleParams.push(...ids);
      }
    } else if (employee_id && employee_id !== 'all') {
      singleBaseQuery += ' AND e.id = ?';
      singleParams.push(parseInt(employee_id, 10));
    }

    if (department) {
      singleBaseQuery += ' AND e.department = ?';
      singleParams.push(department);
    }

    if (manager_id) {
      singleBaseQuery += ' AND e.manager_id = ?';
      singleParams.push(manager_id);
    }

    if (search) {
      singleBaseQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR a.remarks LIKE ?)';
      singleParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const statusExpr = `
      CASE 
        WHEN a.status IS NOT NULL THEN a.status
        WHEN lr.id IS NOT NULL THEN 'Leave'
        WHEN hol.id IS NOT NULL THEN 'Holiday'
        WHEN strftime('%w', ?) = '0' THEN 'Weekly Off'
        ELSE 'Absent'
      END
    `;

    if (status && status !== 'all') {
      if (status === 'WO' || status === 'Weekly Off') {
        singleBaseQuery += ` AND (${statusExpr} IN ('Weekly Off', 'WO'))`;
        singleParams.push(effectiveDate);
      } else if (status === 'HO' || status === 'Holiday') {
        singleBaseQuery += ` AND (${statusExpr} IN ('Holiday', 'HO'))`;
        singleParams.push(effectiveDate);
      } else {
        singleBaseQuery += ` AND (${statusExpr} = ?)`;
        singleParams.push(effectiveDate, status);
      }
    }

    const dataQuery = `
      SELECT
        (e.full_name || ' (' || e.employee_id || ')') as "Employee",
        e.full_name as "Employee Name",
        e.employee_id as "Employee ID",
        COALESCE(a.date, ?) as "Date",
        COALESCE(a.punch_in_time, '-') as "Punch In",
        COALESCE(a.punch_out_time, '-') as "Punch Out",
        a.total_hours as "raw_total_hours",
        CASE WHEN a.total_hours IS NOT NULL THEN (a.total_hours || ' hrs') ELSE '0 hrs' END as "Hours",
        CASE WHEN a.total_hours IS NOT NULL THEN (a.total_hours || ' hrs') ELSE '0 hrs' END as "Working Hours",
        (${statusExpr}) as "Status",
        COALESCE(
          CASE 
            WHEN a.punch_in_location IS NOT NULL AND a.punch_in_location != '' THEN a.punch_in_location
            WHEN a.punch_in_lat IS NOT NULL AND a.punch_in_lng IS NOT NULL THEN (ROUND(a.punch_in_lat, 4) || ', ' || ROUND(a.punch_in_lng, 4))
            ELSE '-' 
          END,
          '-'
        ) as "Location / Geofence",
        CASE WHEN a.punch_in_lat IS NOT NULL AND a.punch_in_lng IS NOT NULL 
             THEN (ROUND(a.punch_in_lat, 4) || ', ' || ROUND(a.punch_in_lng, 4)) 
             ELSE '-' END as "GPS Lat/Long (Punch In)",
        COALESCE(a.punch_in_location, '-') as "Address (Punch In)",
        CASE WHEN a.punch_out_lat IS NOT NULL AND a.punch_out_lng IS NOT NULL 
             THEN (ROUND(a.punch_out_lat, 4) || ', ' || ROUND(a.punch_out_lng, 4)) 
             ELSE '-' END as "GPS Lat/Long (Punch Out)",
        COALESCE(a.punch_out_location, '-') as "Address (Punch Out)",
        COALESCE(
          a.remarks,
          CASE
            WHEN lr.id IS NOT NULL THEN 'On Approved Leave'
            WHEN hol.id IS NOT NULL THEN 'Holiday: ' || hol.name
            WHEN strftime('%w', ?) = '0' THEN 'Weekly Off'
            ELSE 'Absent (No punch recorded)'
          END
        ) as "Remarks",
        COALESCE(e.department, '') as "Department",
        COALESCE(s.name, 'General') as "Shift"
      ${singleBaseQuery}
      ORDER BY 
        CASE WHEN a.punch_in_time IS NOT NULL THEN 0 ELSE 1 END,
        e.full_name ASC
    `;

    const rows = db.prepare(dataQuery).all(
      effectiveDate, effectiveDate, effectiveDate,
      ...singleParams
    );

    const enhancedRows = rows.map(r => {
      const punchIn12 = format12Hour(r["Punch In"]);
      const punchOut12 = format12Hour(r["Punch Out"]);
      const inLatLong = r["GPS Lat/Long (Punch In)"] || '--';
      const outLatLong = r["GPS Lat/Long (Punch Out)"] || '--';
      const inAddr = cleanAreaName(r["Address (Punch In)"]);
      const outAddr = cleanAreaName(r["Address (Punch Out)"]);
      const wh = formatWorkingHoursHHMM(r["raw_total_hours"], r["Punch In"], r["Punch Out"]);

      return {
        ...r,
        "Employee ID": r["Employee ID"] || '-',
        "Employee Name": r["Employee Name"] || '-',
        "Punch In Time": punchIn12,
        "Punch In Lat/Long": inLatLong,
        "Punch In Address": inAddr,
        "Punch Out Time": punchOut12,
        "Punch Out Lat/Long": outLatLong,
        "Punch Out Address": outAddr,
        "Status": r["Status"] || '-',
        "Working Hours (HH:MM)": wh,
        "Punch In": punchIn12,
        "Punch Out": punchOut12,
        "Hours": wh,
        "Working Hours": wh,
        "Address (Punch In)": inAddr,
        "Address (Punch Out)": outAddr
      };
    });

    const dateRangeLabel = `Date: ${effectiveDate} (Daily Master)`;

    if (format === 'xlsx' || format === 'excel') {
      const excelBuffer = exportCustomExcel({
        data: enhancedRows,
        selectedColumns: activeCols,
        sheetName: 'Daily Attendance',
        companyName,
        reportTitle: `Daily Attendance Report - All Team Staff (${effectiveDate})`,
        dateRange: dateRangeLabel,
        totalRecords: enhancedRows.length
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Daily_Attendance_${effectiveDate}_${Date.now()}.xlsx"`);
      return res.send(excelBuffer);
    } else if (format === 'pdf' || format === 'html') {
      const htmlReport = exportHtmlReport({
        data: enhancedRows,
        selectedColumns: activeCols,
        title: `Daily Attendance Report - All Team Staff (${effectiveDate})`,
        companyName,
        dateRange: dateRangeLabel,
        totalRecords: enhancedRows.length,
        generatedBy: req.user.username
      });

      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlReport);
    }

    return res.status(400).json({ error: 'Unsupported format.' });
  }

  // MULTI-DATE / MONTH / ALL DATES MODE

  // If exporting monthly report for a specific employee (or logged-in employee), generate FULL 1 to 31 date-wise calendar rows!
  const isEmployeeMonthly = month && year && (req.user.role_name === 'employee' || (employee_id && employee_id !== 'all' && !employee_ids));
  if (isEmployeeMonthly) {
    const targetEmpId = req.user.role_name === 'employee' ? req.user.employee_id : parseInt(employee_id, 10);
    const emp = db.prepare(`
      SELECT e.*, c.name as company_name, s.name as shift_name, s.start_time, s.end_time
      FROM employees e
      JOIN companies c ON e.company_id = c.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.id = ?
    `).get(targetEmpId);

    if (emp) {
      let offDays = ['Sunday'];
      const empW = db.prepare(`
        SELECT w.off_days_json 
        FROM employees e
        LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id
        WHERE e.id = ?
      `).get(targetEmpId);
      if (empW && empW.off_days_json) {
        try { offDays = JSON.parse(empW.off_days_json); } catch (e) {}
      } else {
        const masterW = db.prepare('SELECT off_days_json FROM weekly_off_settings WHERE company_id = ? AND is_default = 1').get(emp.company_id);
        if (masterW && masterW.off_days_json) {
          try { offDays = JSON.parse(masterW.off_days_json); } catch (e) {}
        }
      }

      const mInt = parseInt(month, 10);
      const yInt = parseInt(year, 10);
      const mStr = String(mInt).padStart(2, '0');
      const daysInMonth = new Date(yInt, mInt, 0).getDate();
      const todayStr = getCompanyToday(emp.company_id);

      const holidays = db.prepare(`
        SELECT holiday_date, name FROM holidays
        WHERE company_id = ? AND holiday_date LIKE ?
      `).all(emp.company_id, `${yInt}-${mStr}-%`);
      const holMap = {};
      holidays.forEach(h => { holMap[h.holiday_date] = h.name; });

      const leaves = db.prepare(`
        SELECT lr.*, lt.name as leave_name
        FROM leave_requests lr
        LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.employee_id = ? AND lr.status = 'approved'
          AND (lr.start_date <= ? AND lr.end_date >= ?)
      `).all(targetEmpId, `${yInt}-${mStr}-${daysInMonth}`, `${yInt}-${mStr}-01`);

      const attList = db.prepare(`
        SELECT * FROM attendance_records
        WHERE employee_id = ? AND date LIKE ?
      `).all(targetEmpId, `${yInt}-${mStr}-%`);
      const attMap = {};
      attList.forEach(a => { attMap[a.date] = a; });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const monthRows = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = String(d).padStart(2, '0');
        const curDateStr = `${yInt}-${mStr}-${dStr}`;
        const dObj = new Date(yInt, mInt - 1, d);
        const dayOfWeek = dayNames[dObj.getDay()];

        const att = attMap[curDateStr];
        const isHoliday = holMap[curDateStr];
        const isWO = offDays.includes(dayOfWeek);
        const leave = leaves.find(l => curDateStr >= l.start_date && curDateStr <= l.end_date);

        let status = '-';
        let punchIn = '-';
        let punchOut = '-';
        let hours = '0 hrs';
        let loc = '-';
        let remarks = '';

        if (att) {
          status = att.status || 'Present';
          punchIn = att.punch_in_time || '-';
          punchOut = att.punch_out_time || '-';
          hours = `${att.total_hours || 0} hrs`;
          loc = att.punch_in_location || (att.punch_in_lat ? `${Number(att.punch_in_lat).toFixed(4)}, ${Number(att.punch_in_lng).toFixed(4)}` : '-');
          remarks = att.remarks || status;
        } else if (leave) {
          status = 'Leave';
          remarks = `On Approved ${leave.leave_name || 'Leave'}`;
        } else if (isHoliday) {
          status = 'Holiday';
          remarks = `Official Holiday: ${isHoliday}`;
        } else if (isWO) {
          status = 'Weekly Off';
          remarks = `Scheduled Weekly Off (${dayOfWeek})`;
        } else if (curDateStr <= todayStr) {
          status = 'Absent';
          remarks = 'Absent (No punch recorded)';
        } else {
          status = 'Upcoming';
          remarks = 'Upcoming Date';
        }

        monthRows.push({
          "Employee": `${emp.full_name} (${emp.employee_id || 'EMP'})`,
          "Employee Name": emp.full_name,
          "Employee ID": emp.employee_id || '-',
          "Date": `${curDateStr} (${dayOfWeek.substring(0, 3)})`,
          "Punch In": punchIn,
          "Punch Out": punchOut,
          "Hours": hours,
          "Working Hours": hours,
          "Status": status,
          "Location / Geofence": loc,
          "GPS Lat/Long (Punch In)": att?.punch_in_lat ? `${Number(att.punch_in_lat).toFixed(4)}, ${Number(att.punch_in_lng).toFixed(4)}` : '-',
          "Address (Punch In)": att?.punch_in_location || '-',
          "GPS Lat/Long (Punch Out)": att?.punch_out_lat ? `${Number(att.punch_out_lat).toFixed(4)}, ${Number(att.punch_out_lng).toFixed(4)}` : '-',
          "Address (Punch Out)": att?.punch_out_location || '-',
          "Remarks": remarks,
          "Department": emp.department || '',
          "Shift": emp.shift_name || 'General'
        });
      }

      const dateRangeLabel = `Month: ${yInt}-${mStr} (Days 1 to ${daysInMonth})`;

      if (format === 'xlsx' || format === 'excel') {
        const excelBuffer = exportCustomExcel({
          data: monthRows,
          selectedColumns: activeCols,
          sheetName: `Attendance ${yInt}-${mStr}`,
          companyName,
          reportTitle: `Monthly Attendance Log Report (Days 1 to ${daysInMonth}) - ${emp.full_name}`,
          dateRange: dateRangeLabel,
          totalRecords: monthRows.length
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Daily_Attendance_${yInt}_${mStr}_${emp.employee_id || 'emp'}.xlsx"`);
        return res.send(excelBuffer);
      } else if (format === 'pdf' || format === 'html') {
        const htmlReport = exportHtmlReport({
          data: monthRows,
          selectedColumns: activeCols,
          title: `Monthly Attendance Log Report (Days 1 to ${daysInMonth}) - ${emp.full_name}`,
          companyName,
          dateRange: dateRangeLabel,
          totalRecords: monthRows.length,
          generatedBy: req.user.username
        });

        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlReport);
      }
    }
  }

  let baseQuery = `
    FROM attendance_records a
    JOIN employees e ON a.employee_id = e.id
    JOIN companies c ON a.company_id = c.id
    LEFT JOIN shifts s ON a.shift_id = s.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE e.is_deleted = 0
  `;
  const params = [];

  if (companyId) {
    baseQuery += ' AND a.company_id = ?';
    params.push(companyId);
  }

  if (req.user.role_name === 'manager') {
    baseQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
  } else if (req.user.role_name === 'employee') {
    baseQuery += ' AND a.employee_id = ?';
    params.push(req.user.employee_id);
  }

  if (employee_ids) {
    const ids = Array.isArray(employee_ids)
      ? employee_ids.map(Number).filter(n => !isNaN(n))
      : String(employee_ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    if (ids.length > 0) {
      baseQuery += ` AND a.employee_id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }
  } else if (employee_id && employee_id !== 'all') {
    baseQuery += ' AND a.employee_id = ?';
    params.push(parseInt(employee_id, 10));
  }

  let dateRangeLabel = 'All Recorded Dates';
  if (from_date && to_date) {
    baseQuery += ' AND a.date BETWEEN ? AND ?';
    params.push(from_date, to_date);
    dateRangeLabel = `Period: ${from_date} to ${to_date}`;
  } else if (from_date) {
    baseQuery += ' AND a.date >= ?';
    params.push(from_date);
    dateRangeLabel = `From: ${from_date}`;
  } else if (to_date) {
    baseQuery += ' AND a.date <= ?';
    params.push(to_date);
    dateRangeLabel = `Until: ${to_date}`;
  } else if (month && year) {
    const mStr = String(month).padStart(2, '0');
    baseQuery += ' AND a.date LIKE ?';
    params.push(`${year}-${mStr}-%`);
    dateRangeLabel = `Month: ${year}-${mStr}`;
  } else if (month && typeof month === 'string' && month.includes('-')) {
    baseQuery += ' AND a.date LIKE ?';
    params.push(`${month}-%`);
    dateRangeLabel = `Month: ${month}`;
  }

  if (department) {
    baseQuery += ' AND e.department = ?';
    params.push(department);
  }

  if (manager_id) {
    baseQuery += ' AND e.manager_id = ?';
    params.push(manager_id);
  }

  if (status && status !== 'all') {
    if (status === 'WO' || status === 'Weekly Off') {
      baseQuery += " AND a.status IN ('Weekly Off', 'WO')";
    } else if (status === 'HO' || status === 'Holiday') {
      baseQuery += " AND a.status IN ('Holiday', 'HO')";
    } else {
      baseQuery += ' AND a.status = ?';
      params.push(status);
    }
  }

  if (search) {
    baseQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR a.remarks LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const dataQuery = `
    SELECT
      (e.full_name || ' (' || e.employee_id || ')') as "Employee",
      e.full_name as "Employee Name",
      e.employee_id as "Employee ID",
      a.date as "Date",
      COALESCE(a.punch_in_time, '-') as "Punch In",
      COALESCE(a.punch_out_time, '-') as "Punch Out",
      (COALESCE(a.total_hours, 0) || ' hrs') as "Hours",
      (COALESCE(a.total_hours, 0) || ' hrs') as "Working Hours",
      a.status as "Status",
      COALESCE(
        CASE 
          WHEN a.punch_in_location IS NOT NULL AND a.punch_in_location != '' THEN a.punch_in_location
          WHEN a.punch_in_lat IS NOT NULL AND a.punch_in_lng IS NOT NULL THEN (ROUND(a.punch_in_lat, 4) || ', ' || ROUND(a.punch_in_lng, 4))
          ELSE '-' 
        END,
        '-'
      ) as "Location / Geofence",
      CASE WHEN a.punch_in_lat IS NOT NULL AND a.punch_in_lng IS NOT NULL 
           THEN (ROUND(a.punch_in_lat, 4) || ', ' || ROUND(a.punch_in_lng, 4)) 
           ELSE '-' END as "GPS Lat/Long (Punch In)",
      COALESCE(a.punch_in_location, '-') as "Address (Punch In)",
      CASE WHEN a.punch_out_lat IS NOT NULL AND a.punch_out_lng IS NOT NULL 
           THEN (ROUND(a.punch_out_lat, 4) || ', ' || ROUND(a.punch_out_lng, 4)) 
           ELSE '-' END as "GPS Lat/Long (Punch Out)",
      COALESCE(a.punch_out_location, '-') as "Address (Punch Out)",
      COALESCE(a.remarks, '') as "Remarks",
      COALESCE(e.department, '') as "Department",
      COALESCE(s.name, 'General') as "Shift"
    ${baseQuery}
    ORDER BY a.date DESC, a.punch_in_time DESC
  `;

  const rows = db.prepare(dataQuery).all(...params);

  if (format === 'xlsx' || format === 'excel') {
    const excelBuffer = exportCustomExcel({
      data: rows,
      selectedColumns: activeCols,
      sheetName: 'Attendance',
      companyName,
      reportTitle: 'Employee Daily Attendance Record (Day-wise)',
      dateRange: dateRangeLabel,
      totalRecords: rows.length
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_Report_${Date.now()}.xlsx"`);
    return res.send(excelBuffer);
  } else if (format === 'pdf' || format === 'html') {
    const htmlReport = exportHtmlReport({
      data: rows,
      selectedColumns: activeCols,
      title: 'Employee Daily Attendance Record (Day-wise)',
      companyName,
      dateRange: dateRangeLabel,
      totalRecords: rows.length,
      generatedBy: req.user.username
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlReport);
  }

  res.status(400).json({ error: 'Unsupported format.' });
});

// ======================================================================
// MONTHLY MASTER ATTENDANCE SHEET / MATRIX PDF (1..31 DAYS & PAYABLE DAYS)
// ======================================================================
router.post('/monthly-matrix-pdf', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  let employeeId = req.body.employee_id;
  if (req.user.role_name === 'employee') {
    employeeId = req.user.employee_id;
  }
  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required.' });
  }

  const now = new Date();
  const year = parseInt(req.body.year || now.getFullYear(), 10);
  const month = parseInt(req.body.month || (now.getMonth() + 1), 10);
  const mStr = String(month).padStart(2, '0');
  const datePrefix = `${year}-${mStr}`;

  // Fetch employee info
  const emp = db.prepare(`
    SELECT e.*, c.name as company_name
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    WHERE e.id = ? AND e.is_deleted = 0
  `).get(employeeId);

  if (!emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // Fetch holidays for this month
  const holidays = db.prepare(`
    SELECT id, name, holiday_date, is_optional FROM holidays
    WHERE company_id = ? AND holiday_date LIKE ?
  `).all(emp.company_id, `${datePrefix}%`);
  const holidayMap = {};
  holidays.forEach(h => { holidayMap[h.holiday_date] = h; });

  // Fetch employee weekly off
  let offDays = ['Sunday'];
  const empOff = db.prepare(`
    SELECT w.off_days_json
    FROM employees e
    LEFT JOIN weekly_off_settings w ON e.weekly_off_id = w.id
    WHERE e.id = ?
  `).get(employeeId);

  if (empOff && empOff.off_days_json) {
    try { offDays = JSON.parse(empOff.off_days_json); } catch (e) {}
  } else {
    const masterW = db.prepare(`
      SELECT off_days_json FROM weekly_off_settings
      WHERE company_id = ? AND is_default = 1
    `).get(emp.company_id);
    if (masterW && masterW.off_days_json) {
      try { offDays = JSON.parse(masterW.off_days_json); } catch (e) {}
    }
  }

  // Fetch all attendance records for this month
  const attRecords = db.prepare(`
    SELECT * FROM attendance_records
    WHERE company_id = ? AND employee_id = ? AND date LIKE ?
    ORDER BY date ASC
  `).all(emp.company_id, employeeId, `${datePrefix}%`);
  const attMap = {};
  attRecords.forEach(a => { attMap[a.date] = a; });

  // Number of days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNamesShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const matrixDays = [];
  let countPresent = 0;
  let countHalfDay = 0;
  let countWeeklyOff = 0;
  let countHoliday = 0;
  let countLeave = 0;
  let countAbsent = 0;

  const todayStr = getCompanyToday(emp.company_id);

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const curDateStr = `${year}-${mStr}-${dStr}`;
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay();
    const dayNameShort = dayNamesShort[dayOfWeek];
    const dayNameFull = dayNamesFull[dayOfWeek];

    const att = attMap[curDateStr];
    const hol = holidayMap[curDateStr];
    const isWO = offDays.includes(dayNameFull);

    let status = '-';
    let tooltip = '';

    if (att) {
      if (att.status === 'Present') {
        status = 'P';
        countPresent++;
        tooltip = `Present (${att.punch_in_time || ''} - ${att.punch_out_time || ''})`;
      } else if (att.status === 'Half Day') {
        status = 'HD';
        countHalfDay++;
        tooltip = `Half Day (${att.total_hours || 0} hrs)`;
      } else if (att.status === 'Leave') {
        status = 'L';
        countLeave++;
        tooltip = `Approved Leave: ${att.remarks || ''}`;
      } else if (att.status === 'Absent') {
        status = 'A';
        countAbsent++;
        tooltip = 'Absent';
      } else if (att.status === 'Holiday') {
        status = 'HO';
        countHoliday++;
        tooltip = `Holiday: ${att.remarks || ''}`;
      } else if (att.status === 'Weekly Off') {
        status = 'WO';
        countWeeklyOff++;
        tooltip = 'Weekly Off';
      } else {
        status = 'P';
        countPresent++;
        tooltip = att.status;
      }
    } else if (hol) {
      status = 'HO';
      countHoliday++;
      tooltip = `Official Holiday: ${hol.name}`;
    } else if (isWO) {
      status = 'WO';
      countWeeklyOff++;
      tooltip = `Weekly Off (${dayNameFull})`;
    } else if (curDateStr <= todayStr) {
      status = 'A';
      countAbsent++;
      tooltip = 'Absent (Unrecorded)';
    } else {
      status = '-';
      tooltip = 'Future Date';
    }

    matrixDays.push({
      day: d,
      date: curDateStr,
      dayName: dayNameShort,
      status,
      tooltip
    });
  }

  // Calculate Final Payable Days (Strict Zero-Payroll: operational attendance days credit)
  const payableDays = Math.round((countPresent + (countHalfDay * 0.5) + countWeeklyOff + countHoliday + countLeave) * 100) / 100;

  const summary = {
    present: countPresent,
    half_day: countHalfDay,
    weekly_off: countWeeklyOff,
    holiday: countHoliday,
    leave: countLeave,
    absent: countAbsent,
    payable_days: payableDays
  };

  const { exportMonthlyMatrixHtmlReport } = require('../services/exportService');
  const htmlReport = exportMonthlyMatrixHtmlReport({
    companyName: emp.company_name,
    employee: {
      fullName: emp.full_name,
      employeeCode: emp.employee_id,
      department: emp.department || 'Operations'
    },
    month,
    year,
    matrixDays,
    summary
  });

  res.setHeader('Content-Type', 'text/html');
  return res.send(htmlReport);
});

// ======================================================================
// TEAM MONTHLY ATTENDANCE SHEET / MUSTER ROLL (ALL EMPLOYEES 1..DAYS)
// ======================================================================

function buildMonthlySheetData(req, options = {}) {
  const companyId = getTenantCompanyId(req);
  const now = new Date();
  const year = parseInt(options.year || now.getFullYear(), 10);
  const month = parseInt(options.month || (now.getMonth() + 1), 10);
  const mStr = String(month).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();

  // Find all eligible active employees
  let empQuery = `
    SELECT e.*, c.name as company_name, c.logo as company_logo
    FROM employees e
    JOIN companies c ON e.company_id = c.id
    WHERE e.is_deleted = 0 AND e.status = 'active'
  `;
  const empParams = [];
  if (companyId) {
    empQuery += ' AND e.company_id = ?';
    empParams.push(companyId);
  }

  if (req.user.role_name === 'manager') {
    empQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    empParams.push(req.user.employee_id, req.user.employee_id);
  } else if (req.user.role_name === 'employee') {
    empQuery += ' AND e.id = ?';
    empParams.push(req.user.employee_id);
  }

  const { employee_id, employee_ids, search, manager_id } = options;

  if (manager_id && manager_id !== 'all') {
    empQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    empParams.push(parseInt(manager_id, 10), parseInt(manager_id, 10));
  }

  if (employee_ids) {
    const ids = Array.isArray(employee_ids)
      ? employee_ids.map(Number).filter(n => !isNaN(n))
      : String(employee_ids).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    if (ids.length > 0) {
      empQuery += ` AND e.id IN (${ids.map(() => '?').join(',')})`;
      empParams.push(...ids);
    }
  } else if (employee_id && employee_id !== 'all') {
    empQuery += ' AND e.id = ?';
    empParams.push(parseInt(employee_id, 10));
  }

  if (search && search.trim()) {
    empQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ?)';
    empParams.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  empQuery += ' ORDER BY e.full_name ASC';
  const allEmployees = db.prepare(empQuery).all(...empParams);

  // Pre-fetch weekly off settings and holidays for company
  const companyHolidays = companyId
    ? db.prepare('SELECT holiday_date, name FROM holidays WHERE (company_id = ? OR company_id IS NULL) AND holiday_date LIKE ?').all(companyId, `${year}-${mStr}-%`)
    : db.prepare('SELECT holiday_date, name, company_id FROM holidays WHERE holiday_date LIKE ?').all(`${year}-${mStr}-%`);

  const companyWeeklyOffs = companyId
    ? db.prepare('SELECT * FROM weekly_off_settings WHERE company_id = ?').all(companyId)
    : db.prepare('SELECT * FROM weekly_off_settings').all();

  const defaultWeeklyOffMap = {};
  companyWeeklyOffs.filter(w => w.is_default === 1).forEach(w => {
    try { defaultWeeklyOffMap[w.company_id] = JSON.parse(w.off_days_json); } catch (e) {}
  });

  const specificWeeklyOffMap = {};
  companyWeeklyOffs.forEach(w => {
    try { specificWeeklyOffMap[w.id] = JSON.parse(w.off_days_json); } catch (e) {}
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let compName = 'NPB HRMS Attendance Management';
  let compLogo = null;
  if (companyId) {
    const compRow = db.prepare('SELECT name, logo FROM companies WHERE id = ?').get(companyId);
    if (compRow) {
      compName = compRow.name || compName;
      compLogo = compRow.logo || null;
    }
  } else if (allEmployees.length > 0) {
    compName = allEmployees[0].company_name || compName;
    compLogo = allEmployees[0].company_logo || null;
  }

  const processedEmployees = allEmployees.map(emp => {
    const todayStr = getCompanyToday(emp.company_id);

    let offDays = ['Sunday'];
    if (emp.weekly_off_id && specificWeeklyOffMap[emp.weekly_off_id]) {
      offDays = specificWeeklyOffMap[emp.weekly_off_id];
    } else if (defaultWeeklyOffMap[emp.company_id]) {
      offDays = defaultWeeklyOffMap[emp.company_id];
    }

    const holMap = {};
    companyHolidays.filter(h => !h.company_id || h.company_id === emp.company_id).forEach(h => {
      holMap[h.holiday_date] = h.name;
    });

    const leaves = db.prepare(`
      SELECT lr.*, lt.name as leave_name
      FROM leave_requests lr
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.employee_id = ? AND lr.status = 'approved'
        AND (lr.start_date <= ? AND lr.end_date >= ?)
    `).all(emp.id, `${year}-${mStr}-${daysInMonth}`, `${year}-${mStr}-01`);

    const attList = db.prepare(`
      SELECT * FROM attendance_records
      WHERE employee_id = ? AND date LIKE ?
    `).all(emp.id, `${year}-${mStr}-%`);
    const attMap = {};
    attList.forEach(a => { attMap[a.date] = a; });

    const dailyStatus = {};
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let hoCount = 0;
    let woCount = 0;
    let halfDayCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const curDateStr = `${year}-${mStr}-${dStr}`;
      const dObj = new Date(year, month - 1, d);
      const dayOfWeek = dayNames[dObj.getDay()];

      const att = attMap[curDateStr];
      const isHoliday = holMap[curDateStr];
      const isWO = offDays.includes(dayOfWeek);
      const leave = leaves.find(l => curDateStr >= l.start_date && curDateStr <= l.end_date);

      let code = '--';

      if (att) {
        const s = (att.status || '').toLowerCase();
        if (s === 'present') {
          code = 'P';
          presentCount++;
        } else if (s === 'half day') {
          code = 'HD';
          halfDayCount++;
        } else if (s === 'absent') {
          code = 'A';
          absentCount++;
        } else if (s === 'leave') {
          code = 'L';
          leaveCount++;
        } else if (s === 'weekly off' || s === 'wo') {
          code = 'WO';
          woCount++;
        } else if (s === 'holiday' || s === 'ho') {
          code = 'HO';
          hoCount++;
        } else {
          code = 'P';
          presentCount++;
        }
      } else if (leave) {
        code = 'L';
        leaveCount++;
      } else if (isHoliday) {
        code = 'HO';
        hoCount++;
      } else if (isWO) {
        code = 'WO';
        woCount++;
      } else if (curDateStr <= todayStr) {
        code = 'A';
        absentCount++;
      } else {
        code = '--';
      }

      dailyStatus[d] = code;
    }

    // Working days formula strictly: P + L + ho + wo + half day (2 half days = 1 day count)
    const rawWorkingDays = presentCount + leaveCount + hoCount + woCount + (halfDayCount * 0.5);
    const totalWorkingDays = Number.isInteger(rawWorkingDays) ? rawWorkingDays : parseFloat(rawWorkingDays.toFixed(1));

    return {
      id: emp.id,
      employee_id: emp.employee_id || `EMP${String(emp.id).padStart(3, '0')}`,
      full_name: emp.full_name,
      department: emp.department || 'Operations',
      dailyStatus,
      summary: {
        present: presentCount,
        absent: absentCount,
        leave: leaveCount,
        ho: hoCount,
        wo: woCount,
        half_day: halfDayCount,
        total_working_days: totalWorkingDays
      }
    };
  });

  return {
    month,
    year,
    daysInMonth,
    totalEmployees: processedEmployees.length,
    allEmployees: processedEmployees,
    company: {
      name: compName,
      logo: compLogo
    }
  };
}

// GET /attendance/monthly-sheet
router.get('/monthly-sheet', verifyAuth, (req, res) => {
  const allowedRoles = ['super_admin', 'company_admin', 'manager', 'support'];
  if (!allowedRoles.includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Unauthorized to view monthly attendance sheet.' });
  }

  const {
    month,
    year,
    employee_id,
    employee_ids,
    search,
    manager_id,
    limit = 10,
    offset = 0
  } = req.query;

  const result = buildMonthlySheetData(req, {
    month,
    year,
    employee_id,
    employee_ids,
    search,
    manager_id
  });

  const pLimit = parseInt(limit, 10) || 10;
  const pOffset = parseInt(offset, 10) || 0;
  const paginatedEmployees = result.allEmployees.slice(pOffset, pOffset + pLimit);

  res.json({
    month: result.month,
    year: result.year,
    daysInMonth: result.daysInMonth,
    total: result.totalEmployees,
    limit: pLimit,
    offset: pOffset,
    page: Math.floor(pOffset / pLimit) + 1,
    totalPages: Math.ceil(result.totalEmployees / pLimit) || 1,
    employees: paginatedEmployees,
    company: result.company
  });
});

// POST /attendance/monthly-sheet-export
router.post('/monthly-sheet-export', verifyAuth, (req, res) => {
  const allowedRoles = ['super_admin', 'company_admin', 'manager', 'support'];
  if (!allowedRoles.includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Unauthorized to export monthly attendance sheet.' });
  }

  const {
    format = 'xlsx',
    month,
    year,
    employee_id,
    employee_ids,
    search,
    manager_name,
    manager_id
  } = req.body;

  const result = buildMonthlySheetData(req, {
    month,
    year,
    employee_id,
    employee_ids,
    search,
    manager_id
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthLabel = `${monthNames[result.month - 1]} ${result.year}`;
  const effectiveManagerName = manager_name || req.user.full_name || req.user.fullName || req.user.username || 'Authorized Manager';

  const {
    exportMonthlyAttendanceSheetExcel,
    exportMonthlyAttendanceSheetHtml
  } = require('../services/exportService');

  if (format === 'xlsx' || format === 'excel') {
    const excelBuffer = exportMonthlyAttendanceSheetExcel({
      companyName: result.company.name,
      monthLabel,
      managerName: effectiveManagerName,
      daysInMonth: result.daysInMonth,
      employees: result.allEmployees
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Monthly_Attendance_${result.year}_${result.month}_${Date.now()}.xlsx"`);
    return res.send(excelBuffer);
  } else if (format === 'pdf' || format === 'html') {
    const htmlReport = exportMonthlyAttendanceSheetHtml({
      companyName: result.company.name,
      companyLogo: result.company.logo,
      monthLabel,
      managerName: effectiveManagerName,
      daysInMonth: result.daysInMonth,
      employees: result.allEmployees
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlReport);
  }

  return res.status(400).json({ error: 'Unsupported format.' });
});

// ==========================================
// ATTENDANCE CORRECTION REQUESTS & APPROVALS
// ==========================================

// Submit Attendance Correction Request (Employee or Admin)
router.post('/correction-request', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const employeeId = req.user.role_name === 'employee' ? req.user.employee_id : (req.body.employee_id || req.user.employee_id);
  const {
    date,
    correction_type = 'both', // 'both' | 'in' | 'out'
    requested_punch_in,
    requested_punch_out,
    reason
  } = req.body;

  if (!date || !reason || !reason.trim()) {
    return res.status(400).json({ error: 'Attendance date and correction remarks/reason are required.' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (date > todayStr) {
    return res.status(400).json({ error: 'Future dates cannot be selected for attendance correction.' });
  }

  if (correction_type === 'both' && (!requested_punch_in || !requested_punch_out)) {
    return res.status(400).json({ error: 'Both Punch In and Punch Out times are required for this correction type.' });
  }
  if (correction_type === 'in' && !requested_punch_in) {
    return res.status(400).json({ error: 'Requested Punch In time is required.' });
  }
  if (correction_type === 'out' && !requested_punch_out) {
    return res.status(400).json({ error: 'Requested Punch Out time is required.' });
  }

  // Get current attendance status for this date if exists
  const existing = db.prepare(`
    SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?
  `).get(companyId, employeeId, date);

  const currentStatus = existing ? existing.status : 'Absent';
  const currentPunchIn = existing ? existing.punch_in_time : null;
  const currentPunchOut = existing ? existing.punch_out_time : null;

  // Resolve final requested values based on correction_type
  let reqInVal = '';
  let reqOutVal = '';

  if (correction_type === 'in') {
    reqInVal = (requested_punch_in || '').trim();
    reqOutVal = (currentPunchOut || '').trim();
  } else if (correction_type === 'out') {
    reqInVal = (currentPunchIn || '').trim();
    reqOutVal = (requested_punch_out || '').trim();
  } else {
    reqInVal = (requested_punch_in || '').trim();
    reqOutVal = (requested_punch_out || '').trim();
  }

  // Auto-calculate requested attendance status based on hours
  let autoCalculatedStatus = 'Present';
  const effIn = reqInVal || currentPunchIn;
  const effOut = reqOutVal || currentPunchOut;
  if (effIn && effOut) {
    const totalHours = calculateHours(effIn, effOut);
    if (totalHours >= 8.0) {
      autoCalculatedStatus = 'Present';
    } else if (totalHours >= 4.0) {
      autoCalculatedStatus = 'Half Day';
    } else {
      autoCalculatedStatus = 'Absent';
    }
  } else {
    // If only one punch is requested without counterpart, default to Present for supervisor review
    autoCalculatedStatus = 'Present';
  }

  const finalRequestedStatus = req.body.requested_status || autoCalculatedStatus;

  const result = db.prepare(`
    INSERT INTO attendance_correction_requests (
      company_id, employee_id, date,
      current_status, current_punch_in, current_punch_out,
      requested_punch_in, requested_punch_out, requested_status,
      reason, status, correction_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    companyId, employeeId, date,
    currentStatus, currentPunchIn, currentPunchOut,
    reqInVal, reqOutVal, finalRequestedStatus,
    reason.trim(), correction_type
  );

  // Notify assigned reporting manager or Admin
  const emp = db.prepare('SELECT full_name, employee_id, manager_id, reports_to_admin FROM employees WHERE id = ?').get(employeeId);
  const notifyUserIds = new Set();

  if (emp) {
    if (emp.manager_id) {
      const mgrUser = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
      if (mgrUser && mgrUser.user_id) notifyUserIds.add(mgrUser.user_id);
    }

    try {
      const mappings = db.prepare('SELECT manager_id FROM employee_mappings WHERE employee_id = ?').all(employeeId);
      for (const m of mappings) {
        if (m.manager_id) {
          const u = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(m.manager_id);
          if (u && u.user_id) notifyUserIds.add(u.user_id);
        }
      }
    } catch (e) {}

    // If no specific manager assigned or reports_to_admin is true, notify company admins
    if (notifyUserIds.size === 0 || emp.reports_to_admin) {
      const admins = db.prepare(`
        SELECT u.id FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.company_id = ? AND r.name IN ('company_admin', 'admin')
      `).all(companyId);
      for (const a of admins) {
        notifyUserIds.add(a.id);
      }
    }
  }

  for (const uid of notifyUserIds) {
    db.prepare(`
      INSERT INTO notifications (user_id, company_id, title, message, type, link)
      VALUES (?, ?, 'Attendance Correction Request', ?, 'attendance', '/attendance')
    `).run(
      uid, companyId,
      `${emp ? emp.full_name : 'Employee'} requested attendance correction for ${date} (${finalRequestedStatus}).`
    );
  }

  res.status(201).json({
    success: true,
    requestId: result.lastInsertRowid,
    autoStatus: finalRequestedStatus,
    message: `Attendance correction request submitted successfully (${finalRequestedStatus}). Awaiting supervisor approval.`
  });
});

// List Attendance Correction Requests
router.get('/correction-requests', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { status = 'all', limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT cr.*,
           e.full_name as employee_name, e.employee_id as employee_code, e.department, e.city,
           u.username as reviewer_name
    FROM attendance_correction_requests cr
    JOIN employees e ON cr.employee_id = e.id
    LEFT JOIN users u ON cr.reviewed_by = u.id
    WHERE cr.company_id = ?
  `;
  const params = [companyId];

  if (req.user.role_name === 'employee') {
    query += ' AND cr.employee_id = ?';
    params.push(req.user.employee_id);
  } else if (req.user.role_name === 'manager') {
    query += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(req.user.employee_id, req.user.employee_id);
  }

  if (status && status !== 'all') {
    query += ' AND cr.status = ?';
    params.push(status);
  }

  query += ' ORDER BY cr.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const requests = db.prepare(query).all(...params);
  res.json({ requests });
});

// Review Attendance Correction Request (Approve or Reject/Cancel)
// Company Admin, Manager, Super Admin
router.put('/correction-requests/:id/review', verifyAuth, requireRole(['company_admin', 'manager', 'super_admin']), (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { status, review_notes } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "approved" or "rejected".' });
  }

  const request = db.prepare(`
    SELECT cr.*, e.user_id, e.full_name, e.employee_id as employee_code, e.company_id
    FROM attendance_correction_requests cr
    JOIN employees e ON cr.employee_id = e.id
    WHERE cr.id = ?
  `).get(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Attendance correction request not found.' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: `Request has already been ${request.status}.` });
  }

  const transaction = db.transaction(() => {
    // 1. Update correction request status
    db.prepare(`
      UPDATE attendance_correction_requests SET
        status = ?,
        reviewed_by = ?,
        review_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user.id, review_notes || null, requestId);

    if (status === 'approved') {
      // 1. Fetch existing attendance record
      const existing = db.prepare(`
        SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?
      `).get(request.company_id, request.employee_id, request.date);

      let finalPunchIn = existing ? existing.punch_in_time : null;
      let finalPunchOut = existing ? existing.punch_out_time : null;

      const corrType = request.correction_type ||
        (request.requested_punch_in && !request.requested_punch_out ? 'in' :
         !request.requested_punch_in && request.requested_punch_out ? 'out' : 'both');

      if (corrType === 'in') {
        finalPunchIn = request.requested_punch_in || finalPunchIn;
        // Punch Out is NOT touched! Preserves existing punch out
      } else if (corrType === 'out') {
        // Punch In is NOT touched! Preserves existing punch in
        finalPunchOut = request.requested_punch_out || finalPunchOut;
      } else {
        // Both updated
        if (request.requested_punch_in) finalPunchIn = request.requested_punch_in;
        if (request.requested_punch_out) finalPunchOut = request.requested_punch_out;
      }

      // Calculate working hours
      let hours = 0;
      if (finalPunchIn && finalPunchOut) {
        hours = calculateHours(finalPunchIn, finalPunchOut);
      } else if (existing && existing.total_hours) {
        hours = existing.total_hours;
      }

      // Status strictly auto-calculated based on working hours:
      // >= 8.0h => Present, >= 4.0h => Half Day, < 4.0h => Absent
      let targetStatus = 'Present';
      if (finalPunchIn && finalPunchOut) {
        targetStatus = deriveStatusFromHours(hours, request.company_id);
      } else if (existing && existing.status) {
        targetStatus = existing.status;
      }

      // 2. Upsert attendance record preserving non-targeted punch time
      db.prepare(`
        INSERT INTO attendance_records (
          company_id, employee_id, date,
          punch_in_time, punch_out_time,
          total_hours, status, remarks, is_edited
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
          punch_in_time = excluded.punch_in_time,
          punch_out_time = excluded.punch_out_time,
          total_hours = excluded.total_hours,
          status = excluded.status,
          remarks = excluded.remarks,
          is_edited = 1,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        request.company_id,
        request.employee_id,
        request.date,
        finalPunchIn,
        finalPunchOut,
        hours,
        targetStatus,
        `Approved Correction (${corrType.toUpperCase()}): ${request.reason}`
      );

      // 3. Log into attendance_edit_logs for complete audit trail
      db.prepare(`
        INSERT INTO attendance_edit_logs (
          attendance_record_id, employee_id, edited_by, editor_role, panel, reason,
          original_punch_in, original_punch_out, original_status,
          new_punch_in, new_punch_out, new_status, ip_address
        ) VALUES (
          (SELECT id FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?),
          ?, ?, ?, 'Attendance Correction Approval', ?,
          ?, ?, ?,
          ?, ?, ?, '127.0.0.1'
        )
      `).run(
        request.company_id, request.employee_id, request.date,
        request.employee_id, req.user.id, req.user.role_name,
        `Correction Request #${requestId} Approved (${corrType.toUpperCase()}): ${request.reason}`,
        request.current_punch_in, request.current_punch_out, request.current_status,
        finalPunchIn, finalPunchOut, targetStatus
      );

      // 4. Notify employee
      db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type, link)
        VALUES (?, ?, 'Correction Request Approved', ?, 'attendance', '/attendance-history')
      `).run(
        request.user_id,
        request.company_id,
        `Your attendance correction request for ${request.date} was approved. Status updated to ${targetStatus} (${hours} hrs).`
      );
    } else {
      // If rejected / cancelled -> Attendance status is set/retained as Absent
      db.prepare(`
        INSERT INTO attendance_records (
          company_id, employee_id, date,
          status, remarks, is_edited
        ) VALUES (?, ?, ?, 'Absent', 'Correction Request Cancelled/Rejected', 1)
        ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
          status = 'Absent',
          remarks = 'Correction Request Cancelled/Rejected',
          is_edited = 1,
          updated_at = CURRENT_TIMESTAMP
      `).run(request.company_id, request.employee_id, request.date);

      // Notify employee
      db.prepare(`
        INSERT INTO notifications (user_id, company_id, title, message, type, link)
        VALUES (?, ?, 'Correction Request Cancelled/Rejected', ?, 'attendance', '/attendance-history')
      `).run(
        request.user_id,
        request.company_id,
        `Your attendance correction request for ${request.date} was rejected. Status marked as Absent.${review_notes ? ' Note: ' + review_notes : ''}`
      );
    }

    logAudit({
      companyId: request.company_id,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: 'Attendance Correction Review',
      action: status === 'approved' ? 'ATTENDANCE_CORRECTION_APPROVED' : 'ATTENDANCE_CORRECTION_REJECTED',
      targetEntity: 'attendance_correction_requests',
      targetId: requestId,
      newValues: { status, date: request.date, employeeId: request.employee_id, review_notes },
      reason: `Correction request #${requestId} ${status} by ${req.user.username}`
    });
  });

  transaction();

  res.json({
    success: true,
    message: `Attendance correction request #${requestId} has been ${status === 'approved' ? 'approved (status set to Present)' : 'rejected (status marked as Absent)'}.`
  });
});

module.exports = router;

