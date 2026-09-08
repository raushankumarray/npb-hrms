const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { getTenantCompanyId } = require('../middleware/rbac');
const { exportCustomExcel, exportHtmlReport, formatTo12Hour } = require('../services/exportService');
const { logAudit } = require('../services/audit');

// Helper to query report data with all filters
function fetchReportDataset({ companyId, from_date, to_date, department, manager_id, employee_id, status, search, limit, offset, userRole, currentEmpId }) {
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

  // Manager permission: only assigned employees
  if (userRole === 'manager') {
    baseQuery += ' AND (e.manager_id = ? OR e.id IN (SELECT employee_id FROM employee_mappings WHERE manager_id = ?))';
    params.push(currentEmpId, currentEmpId);
  } else if (userRole === 'employee') {
    baseQuery += ' AND a.employee_id = ?';
    params.push(currentEmpId);
  } else if (employee_id) {
    baseQuery += ' AND a.employee_id = ?';
    params.push(employee_id);
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
    baseQuery += ' AND a.status = ?';
    params.push(status);
  }

  if (search) {
    baseQuery += ' AND (e.full_name LIKE ? OR e.employee_id LIKE ? OR a.remarks LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
  const total = db.prepare(countQuery).get(...params).total;

  let dataQuery = `
    SELECT 
      e.full_name as "Employee Name",
      e.employee_id as "Employee ID",
      c.name as "Company",
      e.department as "Department",
      e.designation as "Designation",
      COALESCE(m.full_name, 'None') as "Manager Name",
      a.date as "Date",
      COALESCE(a.punch_in_time, 'Missing') as "Punch In",
      COALESCE(a.punch_out_time, 'Missing') as "Punch Out",
      COALESCE(a.punch_in_location, 'Office') as "Location Name",
      a.punch_in_lat as "Latitude",
      a.punch_in_lng as "Longitude",
      a.punch_in_accuracy as "GPS Accuracy",
      a.status as "Attendance Status",
      a.total_hours as "Total Working Hours",
      COALESCE(s.name, 'General') as "Shift",
      COALESCE(a.remarks, '') as "Remarks"
    ${baseQuery}
    ORDER BY a.date DESC, a.punch_in_time DESC
  `;

  if (limit) {
    dataQuery += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset || 0, 10));
  }

  const rows = db.prepare(dataQuery).all(...params);
  return { total, rows };
}

// Get Report Data API (for table display with pagination)
router.get('/data', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const { from_date, to_date, department, manager_id, employee_id, status, search, limit = 25, offset = 0 } = req.query;

  const result = fetchReportDataset({
    companyId,
    from_date,
    to_date,
    department,
    manager_id,
    employee_id,
    status,
    search,
    limit,
    offset,
    userRole: req.user.role_name,
    currentEmpId: req.user.employee_id
  });

  res.json({ records: result.rows, total: result.total });
});

// Custom Export Builder: Export to Excel (.xlsx) or HTML/PDF with selected columns
router.post('/export', verifyAuth, (req, res) => {
  const companyId = getTenantCompanyId(req);
  const {
    format = 'xlsx',
    selected_columns,
    from_date,
    to_date,
    department,
    manager_id,
    employee_id,
    status,
    search
  } = req.body;

  if (!Array.isArray(selected_columns) || selected_columns.length === 0) {
    return res.status(400).json({ error: 'Please select at least one column to export.' });
  }

  // Fetch all matching data (no pagination limit for full report download)
  const result = fetchReportDataset({
    companyId,
    from_date,
    to_date,
    department,
    manager_id,
    employee_id,
    status,
    search,
    userRole: req.user.role_name,
    currentEmpId: req.user.employee_id
  });

  // Audit the export action
  db.prepare(`
    INSERT INTO report_exports (
      company_id, user_id, role, report_type, format, selected_columns_json, filters_json
    ) VALUES (?, ?, ?, 'Attendance Report', ?, ?, ?)
  `).run(
    companyId,
    req.user.id,
    req.user.role_name,
    format,
    JSON.stringify(selected_columns),
    JSON.stringify({ from_date, to_date, department, status })
  );

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Reports & Export',
    action: 'REPORT_EXPORTED',
    targetEntity: 'report_exports',
    newValues: { format, rowCount: result.rows.length, selectedColumns: selected_columns },
    reason: `Exported ${result.rows.length} rows as ${format.toUpperCase()}`
  });

  if (format === 'xlsx') {
    const excelBuffer = exportCustomExcel({
      data: result.rows,
      selectedColumns: selected_columns,
      sheetName: 'Attendance Report'
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_Report_${Date.now()}.xlsx"`);
    return res.send(excelBuffer);
  } else if (format === 'pdf' || format === 'html') {
    // Generate professional printable HTML report for clean print to PDF
    const compName = req.user.company_id ? db.prepare('SELECT name FROM companies WHERE id = ?').get(req.user.company_id)?.name : 'NPB HRMS';
    const dateRangeStr = from_date && to_date ? `${from_date} to ${to_date}` : 'All Recorded Dates';
    const htmlReport = exportHtmlReport({
      data: result.rows,
      selectedColumns: selected_columns,
      title: 'Custom Attendance & HRMS Report',
      companyName: compName,
      dateRange: dateRangeStr,
      generatedBy: req.user.username
    });

    res.setHeader('Content-Type', 'text/html');
    return res.send(htmlReport);
  }

  res.status(400).json({ error: 'Unsupported format.' });
});

module.exports = router;
