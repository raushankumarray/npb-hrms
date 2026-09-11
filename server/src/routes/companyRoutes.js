const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');

// Configure disk storage for company logo uploads
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `company_logo_${req.params.id}_${Date.now()}${ext}`);
  }
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedExts = /jpeg|jpg|png|webp|svg|gif/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isMimeOk = file.mimetype.startsWith('image/');
    if (allowedExts.test(ext) || isMimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file format. Allowed formats: PNG, JPG, JPEG, WebP, SVG.'));
    }
  }
});

// List companies (Super Admin and Support)
router.get('/', verifyAuth, requireRole(['super_admin', 'support']), (req, res) => {
  const { status, search } = req.query;

  let query = `
    SELECT c.*,
      (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.is_deleted = 0) as total_employees,
      (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_deleted = 0) as total_users,
      (SELECT username FROM users u WHERE u.company_id = c.id AND u.role_id = (SELECT id FROM roles WHERE name = 'company_admin') LIMIT 1) as admin_username,
      (SELECT email FROM users u WHERE u.company_id = c.id AND u.role_id = (SELECT id FROM roles WHERE name = 'company_admin') LIMIT 1) as admin_email,
      (SELECT COUNT(*) FROM employees e JOIN users u ON e.user_id = u.id JOIN roles r ON u.role_id = r.id WHERE e.company_id = c.id AND r.name = 'manager') as total_managers,
      s.show_branding_mode, s.timezone, s.auto_archive_days
    FROM companies c
    LEFT JOIN company_settings s ON c.id = s.company_id
    WHERE c.is_deleted = 0
  `;
  const params = [];

  if (status && status !== 'all') {
    if (status === 'closed' || status === 'disabled') {
      query += " AND (c.status = 'disabled' OR c.status = 'banned' OR c.status = 'closed')";
    } else {
      query += ' AND c.status = ?';
      params.push(status);
    }
  }

  if (search) {
    query += ' AND (c.name LIKE ? OR c.code LIKE ? OR c.portal_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.address LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term);
  }

  query += ' ORDER BY c.created_at DESC';

  const companies = db.prepare(query).all(...params);
  res.json({ companies });
});

// Get single company details
router.get('/:id', verifyAuth, (req, res) => {
  const companyId = parseInt(req.params.id, 10);

  // Tenant isolation check
  if (req.user.role_name !== 'super_admin' && req.user.role_name !== 'support') {
    if (req.user.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied to other company details.' });
    }
  }

  const company = db.prepare('SELECT * FROM companies WHERE id = ? AND is_deleted = 0').get(companyId);
  if (!company) {
    return res.status(404).json({ error: 'Company not found.' });
  }

  const settings = db.prepare('SELECT * FROM company_settings WHERE company_id = ?').get(companyId);
  const modules = db.prepare('SELECT module_name, is_enabled FROM company_modules WHERE company_id = ?').all(companyId);

  // Find Company Admin User
  const adminUser = db.prepare(`
    SELECT id, username, email FROM users
    WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin') AND is_deleted = 0
    LIMIT 1
  `).get(companyId);

  res.json({
    company,
    settings: settings || {},
    adminUser: adminUser || null,
    modules: modules.reduce((acc, m) => {
      acc[m.module_name] = !!m.is_enabled;
      return acc;
    }, {})
  });
});

// Create Company (Super Admin only)
router.post('/', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const {
    name, portal_name, code, email, phone, address, logo,
    admin_username, admin_password, admin_email,
    timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours,
    show_branding_mode
  } = req.body;

  if (!name || !code || !admin_username || !admin_password) {
    return res.status(400).json({ error: 'Company Legal Name, Company Code, Admin Username, and Admin Password are required.' });
  }

  const cleanName = name.trim();
  const cleanCode = code.trim().toUpperCase();
  const finalPortalName = (portal_name && portal_name.trim()) ? portal_name.trim() : cleanName;

  // Check unique code
  const existingComp = db.prepare('SELECT id FROM companies WHERE code = ?').get(cleanCode);
  if (existingComp) {
    return res.status(400).json({ error: `Company code "${code}" already exists.` });
  }

  // Check unique admin username
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(admin_username.trim());
  if (existingUser) {
    return res.status(400).json({ error: `Username "${admin_username}" is already taken.` });
  }

  const roleCompAdmin = db.prepare("SELECT id FROM roles WHERE name = 'company_admin'").get();

  const transaction = db.transaction(() => {
    // 1. Insert Company
    const compRes = db.prepare(`
      INSERT INTO companies (name, portal_name, code, email, phone, address, logo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(cleanName, finalPortalName, cleanCode, email || '', phone || '', address || '', logo || null);

    const newCompanyId = compRes.lastInsertRowid;

    // 2. Insert Settings
    db.prepare(`
      INSERT INTO company_settings (
        company_id, timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours,
        show_branding_mode, website_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      newCompanyId,
      timezone || 'Asia/Kolkata',
      working_hours_per_day || 8.0,
      half_day_min_hours || 4.0,
      full_day_min_hours || 8.0,
      show_branding_mode || 'both',
      `${name} HRMS Portal`
    );

    // 3. Enable standard modules
    const modules = [
      'gps_attendance', 'geofencing', 'live_tracking', 'route_tracking',
      'leave_management', 'holiday_management', 'weekly_off',
      'shift_management', 'rotational_shift', 'excel_update',
      'custom_reports', 'service_requests'
    ];
    const insertMod = db.prepare('INSERT INTO company_modules (company_id, module_name, is_enabled) VALUES (?, ?, 1)');
    modules.forEach(m => insertMod.run(newCompanyId, m));

    // 4. Create Company Admin User
    const passHash = bcrypt.hashSync(admin_password, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(admin_username.trim(), passHash, admin_email || email, roleCompAdmin.id, newCompanyId);

    // 5. Create default shift, weekly off, and leave types
    const shiftRes = db.prepare(`
      INSERT INTO shifts (company_id, name, start_time, end_time, grace_time_mins, working_hours, status)
      VALUES (?, 'General Shift', '09:00', '18:00', 15, 8.0, 'active')
    `).run(newCompanyId);

    db.prepare(`
      INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
      VALUES (?, 'Standard Weekly Off (Sunday)', '["Sunday"]', 1)
    `).run(newCompanyId);

    const insertLeaveType = db.prepare(`
      INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate, is_carry_forward, max_carry_forward)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertLeaveType.run(newCompanyId, 'Casual Leave (CL)', 12.0, 1.0, 0, 0.0);
    insertLeaveType.run(newCompanyId, 'Earned Leave (EL)', 15.0, 1.25, 1, 30.0); // 1.25/month = 15/year

    // Audit log
    logAudit({
      companyId: newCompanyId,
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin',
      action: 'COMPANY_CREATED',
      targetEntity: 'companies',
      targetId: newCompanyId,
      newValues: { name, code, portal_name, admin_username },
      reason: 'Created new tenant company'
    });

    return newCompanyId;
  });

  const createdId = transaction();
  res.status(201).json({ success: true, companyId: createdId, message: 'Company created successfully.' });
});

// Update Company details & Status (Super Admin or Company Admin for settings)
router.put('/:id', verifyAuth, (req, res) => {
  const companyId = parseInt(req.params.id, 10);

  // RBAC check
  if (req.user.role_name !== 'super_admin') {
    if (req.user.role_name !== 'company_admin' || req.user.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied.' });
    }
  }

  const {
    name, portal_name, code, email, phone, address, logo, status,
    admin_username, admin_password, admin_email,
    timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours,
    show_branding_mode, auto_archive_days
  } = req.body;

  const currentComp = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  if (!currentComp) {
    return res.status(404).json({ error: 'Company not found.' });
  }

  // If changing code, verify uniqueness
  if (code && code.trim().toUpperCase() !== currentComp.code) {
    const codeConflict = db.prepare('SELECT id FROM companies WHERE code = ? AND id != ?').get(code.trim().toUpperCase(), companyId);
    if (codeConflict) {
      return res.status(400).json({ error: `Company code "${code}" is already in use by another company.` });
    }
  }

  // Find current admin user
  const adminUser = db.prepare(`
    SELECT id, username, email FROM users
    WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin')
    LIMIT 1
  `).get(companyId);

  // If changing admin username, verify uniqueness
  if (admin_username && admin_username.trim()) {
    const trimmedUser = admin_username.trim();
    if (!adminUser || adminUser.username !== trimmedUser) {
      const userConflict = db.prepare('SELECT id FROM users WHERE username = ?' + (adminUser ? ' AND id != ?' : '')).get(...(adminUser ? [trimmedUser, adminUser.id] : [trimmedUser]));
      if (userConflict) {
        return res.status(400).json({ error: `Admin username "${trimmedUser}" is already taken.` });
      }
    }
  }

  const transaction = db.transaction(() => {
    // Only Super Admin can change status (enable, disable, ban)
    let newStatus = currentComp.status;
    if (req.user.role_name === 'super_admin' && status) {
      newStatus = status;
    }

    const newName = (name && name.trim()) ? name.trim() : currentComp.name;
    const newPortalName = portal_name ? portal_name.trim() : newName;
    const newCode = (code && code.trim()) ? code.trim().toUpperCase() : currentComp.code;

    db.prepare(`
      UPDATE companies SET
        name = ?,
        portal_name = ?,
        code = ?,
        email = ?,
        phone = ?,
        address = COALESCE(?, address),
        logo = COALESCE(?, logo),
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newName,
      newPortalName,
      newCode,
      email !== undefined ? email : currentComp.email,
      phone !== undefined ? phone : currentComp.phone,
      address,
      logo,
      newStatus,
      companyId
    );

    // Update admin user credentials if requested
    if (adminUser) {
      if (admin_username && admin_username.trim() && admin_username.trim() !== adminUser.username) {
        db.prepare('UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(admin_username.trim(), adminUser.id);
      }
      if (admin_password && admin_password.trim()) {
        const passHash = bcrypt.hashSync(admin_password.trim(), 10);
        db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passHash, adminUser.id);
      }
      if (admin_email !== undefined) {
        db.prepare('UPDATE users SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(admin_email, adminUser.id);
      }
    }

    // Update settings if provided
    db.prepare(`
      UPDATE company_settings SET
        timezone = COALESCE(?, timezone),
        working_hours_per_day = COALESCE(?, working_hours_per_day),
        half_day_min_hours = COALESCE(?, half_day_min_hours),
        full_day_min_hours = COALESCE(?, full_day_min_hours),
        show_branding_mode = COALESCE(?, show_branding_mode),
        auto_archive_days = COALESCE(?, auto_archive_days),
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
    `).run(timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours, show_branding_mode, auto_archive_days, companyId);

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: req.user.role_name,
      panel: req.user.role_name === 'super_admin' ? 'Super Admin' : 'Company Admin',
      action: 'COMPANY_UPDATED',
      targetEntity: 'companies',
      targetId: companyId,
      oldValues: { name: currentComp.name, code: currentComp.code, status: currentComp.status },
      newValues: { name: newName, code: newCode, status: newStatus, admin_username },
      reason: 'Company master profile / credentials update'
    });
  });

  transaction();
  res.json({ success: true, message: 'Company details and credentials updated successfully.' });
});

// Dedicated Change Admin Password Endpoint (Super Admin)
router.post('/:id/change-password', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const companyId = parseInt(req.params.id, 10);
  const { new_password } = req.body;

  if (!new_password || !new_password.trim()) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  const adminUser = db.prepare(`
    SELECT id, username FROM users
    WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin')
    LIMIT 1
  `).get(companyId);

  if (!adminUser) {
    return res.status(404).json({ error: 'Company Admin user not found.' });
  }

  const passHash = bcrypt.hashSync(new_password.trim(), 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(passHash, adminUser.id);

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: 'super_admin',
    panel: 'Super Admin',
    action: 'COMPANY_ADMIN_PASSWORD_CHANGED',
    targetEntity: 'users',
    targetId: adminUser.id,
    reason: 'Super Admin reset company admin password'
  });

  res.json({ success: true, message: `Password for Company Admin (${adminUser.username}) changed successfully.` });
});

// Upload Company Logo (Company Admin or Super Admin)
router.post('/:id/logo', verifyAuth, uploadLogo.single('logo'), (req, res) => {
  const companyId = parseInt(req.params.id, 10);

  // Tenant isolation check
  if (req.user.role_name !== 'super_admin') {
    if (req.user.role_name !== 'company_admin' || req.user.company_id !== companyId) {
      return res.status(403).json({ error: 'Access denied to update company logo.' });
    }
  }

  let logoUrl = '';
  if (req.file) {
    logoUrl = `/uploads/${req.file.filename}`;
  } else if (req.body.logo_base64) {
    logoUrl = req.body.logo_base64;
  } else {
    return res.status(400).json({ error: 'Please provide an image file to upload.' });
  }

  const currentComp = db.prepare('SELECT logo FROM companies WHERE id = ?').get(companyId);

  db.prepare('UPDATE companies SET logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(logoUrl, companyId);

  logAudit({
    companyId,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'Company Branding',
    action: 'COMPANY_LOGO_UPDATED',
    targetEntity: 'companies',
    targetId: companyId,
    oldValues: { logo: currentComp?.logo || null },
    newValues: { logo: logoUrl },
    reason: 'Company logo uploaded and updated'
  });

  res.json({
    success: true,
    logoUrl,
    message: 'Company logo uploaded and saved successfully.'
  });
});

// Helper function to permanently remove a company and ALL cascading data from the database
function executePermanentCompanyDeletion(companyId, adminUsername, adminUserId) {
  const company = db.prepare('SELECT id, name, code, logo FROM companies WHERE id = ?').get(companyId);
  if (!company) return null;

  // 1. Service Requests & Chat Messages (request_id points to service_requests.id, user_id points to users.id)
  try {
    db.prepare(`
      DELETE FROM service_request_messages 
      WHERE request_id IN (SELECT id FROM service_requests WHERE company_id = ?)
         OR user_id IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM service_requests WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM support_tickets 
      WHERE company_id = ? 
         OR created_by_user_id IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  // 2. Attendance & Correction Requests & Tracking Logs
  try {
    db.prepare(`
      DELETE FROM attendance_edit_logs 
      WHERE attendance_record_id IN (SELECT id FROM attendance_records WHERE company_id = ?)
         OR employee_id IN (SELECT id FROM employees WHERE company_id = ?)
         OR edited_by IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId, companyId, companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM attendance_correction_requests WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM attendance_import_logs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM attendance_export_logs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM attendance_records WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM location_tracking_logs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM route_tracking_logs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 3. Leave Management & Balances
  try {
    db.prepare('DELETE FROM leave_requests WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM leave_transactions 
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)
         OR leave_type_id IN (SELECT id FROM leave_types WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM leave_balances 
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)
         OR leave_type_id IN (SELECT id FROM leave_types WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM leave_accrual_logs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM leave_types WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 4. Excel & Report Exports Jobs
  try {
    db.prepare('DELETE FROM excel_import_jobs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM excel_update_jobs WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM report_exports WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 5. Notifications & Audits
  try {
    db.prepare(`
      DELETE FROM notifications 
      WHERE company_id = ? 
         OR user_id IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM audit_logs 
      WHERE company_id = ? 
         OR user_id IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  // 6. Device Bindings
  try {
    db.prepare(`
      DELETE FROM employee_devices 
      WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM device_binding_logs 
      WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
    `).run(companyId);
  } catch (e) {}

  // 7. Employee Mappings, Profiles, Weekly Offs, Assignments
  try {
    db.prepare(`
      DELETE FROM employee_mappings 
      WHERE company_id = ? 
         OR employee_id IN (SELECT id FROM employees WHERE company_id = ?)
         OR manager_id IN (SELECT id FROM employees WHERE company_id = ?)
    `).run(companyId, companyId, companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM employee_profiles 
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)
    `).run(companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM employee_weekly_offs 
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)
    `).run(companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM shift_assignments 
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)
         OR shift_id IN (SELECT id FROM shifts WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  try {
    db.prepare(`
      DELETE FROM geofence_assignments 
      WHERE employee_id IN (SELECT id FROM employees WHERE company_id = ?)
         OR geofence_id IN (SELECT id FROM geofences WHERE company_id = ?)
    `).run(companyId, companyId);
  } catch (e) {}

  // 8. Shifts, Geofences, Holidays, Weekly Offs
  try {
    db.prepare('DELETE FROM geofences WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM shifts WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM rotational_shifts WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM weekly_off_settings WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM holidays WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 9. Employees
  try {
    db.prepare('DELETE FROM employees WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 10. Users
  try {
    db.prepare('DELETE FROM users WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 11. Company Settings & Modules
  try {
    db.prepare('DELETE FROM company_modules WHERE company_id = ?').run(companyId);
  } catch (e) {}

  try {
    db.prepare('DELETE FROM company_settings WHERE company_id = ?').run(companyId);
  } catch (e) {}

  // 12. Delete Company Permanently
  db.prepare('DELETE FROM companies WHERE id = ?').run(companyId);

  // 13. Clean up logo file from disk if it was uploaded
  if (company.logo && typeof company.logo === 'string' && company.logo.startsWith('/uploads/')) {
    try {
      const filePath = path.resolve(__dirname, '../../', '.' + company.logo);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn('Could not remove logo file on disk:', err.message);
    }
  }

  // 14. Audit log for super admin
  try {
    logAudit({
      userId: adminUserId,
      userName: adminUsername,
      role: 'super_admin',
      panel: 'Super Admin',
      action: 'COMPANY_PERMANENTLY_DELETED',
      targetEntity: 'companies',
      targetId: companyId,
      oldValues: { name: company.name, code: company.code },
      reason: 'Company and all associated accounts/records permanently purged from database'
    });
  } catch (e) {}

  return company.name;
}

// Delete Single Company (Super Admin only - 100% Permanent Deletion, No Soft Delete)
router.delete('/:id', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const companyId = parseInt(req.params.id, 10);
  const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
  if (!company) {
    return res.status(404).json({ error: 'Company not found.' });
  }

  const transaction = db.transaction(() => {
    executePermanentCompanyDeletion(companyId, req.user.username, req.user.id);
  });

  transaction();
  return res.json({
    success: true,
    message: `Company "${company.name}" and all associated data have been permanently deleted from the database.`
  });
});

// Bulk Delete Multiple Companies Permanently (Super Admin only - 100% Permanent Deletion)
router.post('/bulk-delete', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { company_ids } = req.body;
  if (!Array.isArray(company_ids) || company_ids.length === 0) {
    return res.status(400).json({ error: 'Please select at least one company to permanently delete.' });
  }

  const deletedNames = [];
  const transaction = db.transaction(() => {
    for (const rawId of company_ids) {
      const cId = parseInt(rawId, 10);
      if (!isNaN(cId)) {
        const name = executePermanentCompanyDeletion(cId, req.user.username, req.user.id);
        if (name) deletedNames.push(name);
      }
    }
  });

  transaction();
  return res.json({
    success: true,
    deletedCount: deletedNames.length,
    deletedNames,
    message: `Successfully and permanently deleted ${deletedNames.length} company portal(s) and all associated records from the database.`
  });
});

// Manage Modules for a Company (Super Admin only)
router.put('/:id/modules', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const companyId = parseInt(req.params.id, 10);
  const { modules } = req.body; // Map: { gps_attendance: true, geofencing: false, ... }

  if (!modules || typeof modules !== 'object') {
    return res.status(400).json({ error: 'Modules map is required.' });
  }

  const upsert = db.prepare(`
    INSERT INTO company_modules (company_id, module_name, is_enabled, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(company_id, module_name) DO UPDATE SET
      is_enabled = excluded.is_enabled,
      updated_at = CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction(() => {
    for (const [modName, isEnabled] of Object.entries(modules)) {
      upsert.run(companyId, modName, isEnabled ? 1 : 0);
    }

    logAudit({
      companyId,
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Modules',
      action: 'COMPANY_MODULES_UPDATED',
      targetEntity: 'company_modules',
      targetId: companyId,
      newValues: modules,
      reason: 'Updated company enabled modules'
    });
  });

  transaction();
  res.json({ success: true, message: 'Company modules updated successfully.' });
});

module.exports = router;
