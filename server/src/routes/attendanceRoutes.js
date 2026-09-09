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

  res.json({
    record: record || null,
    today,
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
    locationName: locationName || `Map Area (${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)})`
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

  // Resolve location strictly from GPS map area reverse geocoding (no random fallback)
  let resolvedLocation = location_name;
  if (!resolvedLocation || resolvedLocation.includes('Office Location') || resolvedLocation.includes('Employee Device') || resolvedLocation.includes('Authorized Site') || resolvedLocation.includes('Open Field')) {
    resolvedLocation = await reverseGeocodeLocation(latitude, longitude);
  }
  if (!resolvedLocation && latitude !== undefined && longitude !== undefined) {
    resolvedLocation = `Map Area (${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)})`;
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

  // Resolve location strictly from GPS map area reverse geocoding (no random fallback)
  let resolvedLocation = location_name;
  if (!resolvedLocation || resolvedLocation.includes('Office Location') || resolvedLocation.includes('Employee Device') || resolvedLocation.includes('Authorized Site') || resolvedLocation.includes('Open Field')) {
    resolvedLocation = await reverseGeocodeLocation(latitude, longitude);
  }
  if (!resolvedLocation && latitude !== undefined && longitude !== undefined) {
    resolvedLocation = `Map Area (${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)})`;
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
  const newHours = total_hours !== undefined ? parseFloat(total_hours) : calculateHours(newPunchIn, newPunchOut);
  const newStatus = status || current.status;

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

  const hours = total_hours !== undefined && total_hours !== '' ? parseFloat(total_hours) : calculateHours(punch_in_time, punch_out_time);
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
    `).run(companyId, emp.id, date, punch_in_time || null, punch_out_time || null, hours, status, remarks || 'Manual manager entry', emp.shift_id || null);

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
    employee_id, employee_ids, department, manager_id, status, search
  } = req.body;

  const defaultCols = [
    'Employee', 'Date', 'Punch In', 'Punch Out', 'Hours', 'Status', 'Location / Geofence', 'Remarks'
  ];
  const activeCols = (selected_columns && selected_columns.length > 0) ? selected_columns : defaultCols;

  const effectiveDate = date || day || (from_date && to_date && from_date === to_date ? from_date : null);

  const company = companyId ? db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId) : null;
  const companyName = company ? company.name : 'NPB HRMS Attendance Management';
  const { exportCustomExcel, exportHtmlReport } = require('../services/exportService');

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

    const dateRangeLabel = `Date: ${effectiveDate} (Daily Master)`;

    if (format === 'xlsx' || format === 'excel') {
      const excelBuffer = exportCustomExcel({
        data: rows,
        selectedColumns: activeCols,
        sheetName: 'Daily Attendance',
        companyName,
        reportTitle: `Daily Attendance Report - All Team Staff (${effectiveDate})`,
        dateRange: dateRangeLabel,
        totalRecords: rows.length
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Daily_Attendance_${effectiveDate}_${Date.now()}.xlsx"`);
      return res.send(excelBuffer);
    } else if (format === 'pdf' || format === 'html') {
      const htmlReport = exportHtmlReport({
        data: rows,
        selectedColumns: activeCols,
        title: `Daily Attendance Report - All Team Staff (${effectiveDate})`,
        companyName,
        dateRange: dateRangeLabel,
        totalRecords: rows.length,
        generatedBy: req.user.username
      });

      res.setHeader('Content-Type', 'text/html');
      return res.send(htmlReport);
    }

    return res.status(400).json({ error: 'Unsupported format.' });
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

  // Resolve final in and out times
  const finalIn = requested_punch_in ? requested_punch_in.trim() : currentPunchIn;
  const finalOut = requested_punch_out ? requested_punch_out.trim() : currentPunchOut;

  // Auto-calculate requested attendance status based on hours
  let autoCalculatedStatus = 'Present';
  if (finalIn && finalOut) {
    const totalHours = calculateHours(finalIn, finalOut);
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
      reason, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    companyId, employeeId, date,
    currentStatus, currentPunchIn, currentPunchOut,
    finalIn || '09:00:00', finalOut || '18:00:00', finalRequestedStatus,
    reason.trim()
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
      // Calculate working hours
      const hours = calculateHours(request.requested_punch_in, request.requested_punch_out);
      const targetStatus = request.requested_status || 'Present';

      // 2. Upsert attendance record to Present (or requested status)
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
        request.requested_punch_in,
        request.requested_punch_out,
        hours,
        targetStatus,
        `Approved Correction: ${request.reason}`
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
        `Correction Request #${requestId} Approved: ${request.reason}`,
        request.current_punch_in, request.current_punch_out, request.current_status,
        request.requested_punch_in, request.requested_punch_out, targetStatus
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

