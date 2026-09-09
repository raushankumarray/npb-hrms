-- =======================================================
-- NPB HRMS - Production Relational SQLite Schema
-- Multi-Tenant SaaS with Strict Foreign Keys & Indices
-- =======================================================

-- 1. Companies & Tenants
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  portal_name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  logo TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'banned', 'deleted')),
  is_deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_code ON companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- 2. Company Settings
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER UNIQUE NOT NULL,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  working_hours_per_day REAL DEFAULT 8.0,
  half_day_min_hours REAL DEFAULT 4.0,
  full_day_min_hours REAL DEFAULT 8.0,
  show_branding_mode TEXT DEFAULT 'both' CHECK(show_branding_mode IN ('logo_only', 'name_only', 'both', 'neither')),
  website_title TEXT,
  contact_info TEXT,
  auto_archive_days INTEGER DEFAULT 1,
  geofence_policy TEXT DEFAULT 'strict' CHECK(geofence_policy IN ('strict', 'anywhere')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 3. Company Modules
CREATE TABLE IF NOT EXISTS company_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  module_name TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, module_name),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_company_modules ON company_modules(company_id, module_name);

-- 4. Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL CHECK(name IN ('super_admin', 'support', 'company_admin', 'manager', 'employee')),
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  module TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

-- 5. Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  role_id INTEGER NOT NULL,
  company_id INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'banned', 'deleted')),
  is_deleted INTEGER DEFAULT 0,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_company_role ON users(company_id, role_id);

-- 6. Super Admin Profiles
CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Support Users & Permissions
CREATE TABLE IF NOT EXISTS support_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  permission_level INTEGER DEFAULT 1 CHECK(permission_level BETWEEN 1 AND 4),
  device_status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  support_user_id INTEGER NOT NULL,
  permission_name TEXT NOT NULL,
  granted_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (support_user_id) REFERENCES support_users(id) ON DELETE CASCADE
);

-- 8. Shifts & Rotational Shifts
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL, -- e.g. "09:00"
  end_time TEXT NOT NULL,   -- e.g. "18:00"
  grace_time_mins INTEGER DEFAULT 15,
  working_hours REAL DEFAULT 8.0,
  break_time_mins INTEGER DEFAULT 60,
  status TEXT DEFAULT 'active',
  is_rotational INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rotational_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  cycle_type TEXT DEFAULT 'weekly',
  shift_order_json TEXT NOT NULL, -- JSON array of shift IDs e.g. [1, 2, 3]
  rotation_interval_days INTEGER DEFAULT 7,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 9. Weekly Off Settings & Holidays
CREATE TABLE IF NOT EXISTS weekly_off_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT DEFAULT 'Standard Weekly Off',
  off_days_json TEXT NOT NULL DEFAULT '["Sunday"]', -- JSON array of days e.g. ["Saturday", "Sunday"]
  is_default INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  is_optional INTEGER DEFAULT 0,
  applies_to TEXT DEFAULT 'all', -- 'all' or 'selected'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(company_id, holiday_date);

-- 10. Geofences
CREATE TABLE IF NOT EXISTS geofences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius REAL NOT NULL, -- radius in meters
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_by INTEGER,
  updated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 11. Employees
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER UNIQUE NOT NULL,
  employee_id TEXT, -- Company internal ID e.g. EMP001 (Optional, kept blank if not provided)
  full_name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  department TEXT,
  designation TEXT,
  manager_id INTEGER, -- Points to another employee or user
  hr_id INTEGER,      -- Points to assigned HR personnel
  shift_id INTEGER,
  weekly_off_id INTEGER,
  geofence_id INTEGER, -- Specific geofence if override
  geofence_mode TEXT DEFAULT 'company' CHECK(geofence_mode IN ('company', 'custom', 'none')),
  reports_to_admin INTEGER DEFAULT 0,
  city TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'banned', 'deleted')),
  is_deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (weekly_off_id) REFERENCES weekly_off_settings(id) ON DELETE SET NULL,
  FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE SET NULL,
  FOREIGN KEY (hr_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_emp_id ON employees(company_id, employee_id) WHERE employee_id IS NOT NULL AND employee_id != '';
CREATE INDEX IF NOT EXISTS idx_employees_lookup ON employees(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_hr ON employees(hr_id);

CREATE TABLE IF NOT EXISTS employee_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER UNIQUE NOT NULL,
  date_of_joining DATE,
  address TEXT,
  emergency_contact TEXT,
  blood_group TEXT,
  profile_picture TEXT,
  notes TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  manager_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  mapping_type TEXT DEFAULT 'manager' CHECK(mapping_type IN ('manager')),
  assigned_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(manager_id, employee_id, mapping_type),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS employee_weekly_offs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER UNIQUE NOT NULL,
  off_days_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS geofence_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  geofence_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(geofence_id, employee_id),
  FOREIGN KEY (geofence_id) REFERENCES geofences(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  shift_id INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

-- 12. Device Binding
CREATE TABLE IF NOT EXISTS employee_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  device_id TEXT NOT NULL, -- Browser fingerprint or mobile hardware ID
  device_type TEXT,
  device_name TEXT,
  registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'bound' CHECK(status IN ('bound', 'unbound')),
  bound_ip TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_binding_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('bound', 'unbound', 'login_blocked')),
  device_id TEXT NOT NULL,
  performed_by INTEGER,
  reason TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 13. Attendance System
CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  date DATE NOT NULL,
  punch_in_time TEXT,  -- HH:MM:SS
  punch_out_time TEXT, -- HH:MM:SS
  punch_in_lat REAL,
  punch_in_lng REAL,
  punch_in_location TEXT,
  punch_in_accuracy REAL,
  punch_out_lat REAL,
  punch_out_lng REAL,
  punch_out_location TEXT,
  punch_out_accuracy REAL,
  total_hours REAL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'Absent' CHECK(status IN ('Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekly Off', 'Missing Punch In', 'Missing Punch Out')),
  shift_id INTEGER,
  remarks TEXT,
  is_edited INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, employee_id, date),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(company_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance_records(employee_id, date);

CREATE TABLE IF NOT EXISTS attendance_edit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_record_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  edited_by INTEGER NOT NULL,
  editor_role TEXT NOT NULL,
  panel TEXT NOT NULL,
  reason TEXT NOT NULL,
  original_punch_in TEXT,
  original_punch_out TEXT,
  original_status TEXT,
  new_punch_in TEXT,
  new_punch_out TEXT,
  new_status TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attendance_record_id) REFERENCES attendance_records(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attendance_import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  total_records INTEGER,
  success_records INTEGER,
  failed_records INTEGER,
  filename TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_export_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  report_type TEXT,
  format TEXT,
  record_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 14. Location Tracking & Routes
CREATE TABLE IF NOT EXISTS location_tracking_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  location_name TEXT,
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracking_emp_time ON location_tracking_logs(employee_id, captured_at);

CREATE TABLE IF NOT EXISTS route_tracking_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  date DATE NOT NULL,
  start_lat REAL,
  start_lng REAL,
  end_lat REAL,
  end_lng REAL,
  total_distance_km REAL DEFAULT 0.0,
  waypoints_json TEXT, -- JSON Array of lat/lng/timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 15. Leave Management (Attendance records only, zero payroll links)
CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT NOT NULL, -- e.g. 'CL', 'Earned Leave', 'Paid Leave'
  default_yearly_quota REAL DEFAULT 12.0,
  monthly_accrual_rate REAL DEFAULT 1.0, -- e.g. 1.25 for Earned Leave (15/yr)
  is_carry_forward INTEGER DEFAULT 0,
  max_carry_forward REAL DEFAULT 0.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, name),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  leave_type_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  opening_balance REAL DEFAULT 0.0,
  accrued REAL DEFAULT 0.0,
  used REAL DEFAULT 0.0,
  balance REAL DEFAULT 0.0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, leave_type_id, year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  leave_type_id INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by INTEGER,
  rejection_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leave_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  leave_type_id INTEGER NOT NULL,
  transaction_type TEXT CHECK(transaction_type IN ('opening', 'accrual', 'deduction', 'adjustment', 'carry_forward')),
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  reason TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_accrual_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  leave_type_id INTEGER NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  rate REAL NOT NULL,
  total_employees INTEGER NOT NULL,
  applied_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, leave_type_id, month, year),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

-- 16. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  company_id INTEGER,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- 'attendance', 'leave', 'ticket', 'device', 'system'
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- 17. Service Requests & Support Tickets
CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('missing_punch', 'password_reset', 'device_change', 'attendance_correction', 'account_problem', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  punch_date DATE,
  suggested_punch_in TEXT,
  suggested_punch_out TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'resolved', 'closed')),
  resolved_by INTEGER,
  resolution_notes TEXT,
  is_archived INTEGER DEFAULT 0,
  archived_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(company_id, status, is_archived);

-- 17b. Service Request & Ticket Chat Messages
CREATE TABLE IF NOT EXISTS service_request_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sr_messages_req ON service_request_messages(request_id, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT UNIQUE NOT NULL,
  company_id INTEGER,
  created_by_user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to_support_id INTEGER,
  resolution_notes TEXT,
  is_archived INTEGER DEFAULT 0,
  archived_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to_support_id) REFERENCES support_users(id)
);

-- 18. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL,
  panel TEXT NOT NULL,
  action TEXT NOT NULL,
  target_entity TEXT NOT NULL,
  target_id TEXT,
  old_values_json TEXT,
  new_values_json TEXT,
  reason TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);

-- 19. Application Settings & Import/Export Jobs
CREATE TABLE IF NOT EXISTS application_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS excel_import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  job_type TEXT NOT NULL CHECK(job_type IN ('employee_import', 'employee_update', 'attendance_import', 'attendance_update')),
  filename TEXT NOT NULL,
  total_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  errors_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS excel_update_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  total_rows INTEGER DEFAULT 0,
  updated_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS report_exports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('xlsx', 'pdf')),
  selected_columns_json TEXT,
  filters_json TEXT,
  file_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 22. Attendance Correction Requests
CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  date DATE NOT NULL,
  current_status TEXT DEFAULT 'Absent',
  current_punch_in TEXT,
  current_punch_out TEXT,
  requested_punch_in TEXT NOT NULL,
  requested_punch_out TEXT NOT NULL,
  requested_status TEXT NOT NULL DEFAULT 'Present' CHECK(requested_status IN ('Present', 'Half Day')),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by INTEGER,
  review_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_att_corr_emp ON attendance_correction_requests(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_att_corr_comp_status ON attendance_correction_requests(company_id, status);

