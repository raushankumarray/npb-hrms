# NPB HRMS - Production Multi-Tenant SaaS HRMS & Attendance Platform

**NPB HRMS** is a complete, production-ready, secure, scalable multi-tenant SaaS HRMS and Attendance Management platform designed to handle multi-company isolation, strict role-based access control, mandatory GPS attendance, employee geofencing, live tracking, single-device binding, and comprehensive Excel/PDF audit workflows.

> **Strict Scope Compliance**: All payroll calculation, salary deductions, and salary-slip generation are strictly omitted. Leave records (Casual Leave / CL, Earned Leave, Paid Leave) are maintained purely as HR and attendance records.

---

## 1. User Hierarchy & Pre-Seeded Test Credentials

| Role | Username | Password | Access / Authority Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `adminn` | `Admin@88` | Highest system authority. Manages companies, support accounts, module toggles, and global audits. |
| **Support (Level 3)** | `support_rahul` | `Support@123` | Multi-company support. Device unbinding, attendance correction, ticket resolution. |
| **Company Admin** | `npb_admin` | `Company@123` | Full control over company "NPB Attendance Solutions" (Tenant `NPB01`). |
| **HR Lead** | `npb_hr` | `Hr@12345` | Employee Master, Excel import/update, daily/monthly attendance, leave approvals. |
| **Manager** | `npb_mgr` | `Mgr@12345` | Direct reportees only. Leave approvals, live tracking map, and team attendance. |
| **Employee (Amit)** | `npb_emp1` | `Emp@12345` | GPS attendance punch, leave balance & applications, service tickets. |
| **Employee (Sneha)** | `npb_emp2` | `Emp@12345` | GPS attendance punch, leave balance & applications, service tickets. |

*Note: Initial development credentials are never displayed in the login UI or frontend source code, and all passwords are encrypted using bcrypt hashing.*

---

## 2. Core Features & Architectural Highlights

### Strict Generic Login Page & Dynamic Post-Login Branding
- The login page is completely generic: displays only Username, Password, Sign In, and Forgot Password modal.
- No company logo, name, or website branding appears prior to authentication.
- Post-login: dynamically applies branding settings (`both`, `logo_only`, `name_only`, `neither`) configured for the company or Super Admin console.
- Browser title and favicon update dynamically post-login.

### Mandatory GPS Attendance & Server-Side Geofencing
- Attendance Punch In/Out strictly requires device GPS coordinates (Latitude, Longitude, Accuracy).
- Server-side Haversine distance calculations evaluate proximity against authorized geofences.
- Hierarchy check: Super Admin Global toggle &rarr; Company Module toggle &rarr; Employee Geofence assignment &rarr; Active Company Geofences.
- Any punch attempt outside the allowed radius (e.g. 200m) is immediately blocked with HTTP 403 and logged for audit.

### Single-Device Binding
- An employee account is bound to their primary device upon initial login.
- Subsequent logins from an unauthorized secondary device are blocked with a clear notice to request an unlock ticket.
- Support users (Level 3+) or Administrators can safely unlock/unbind devices with a mandatory reason recorded in `device_binding_logs` and `audit_logs`.

### Master Data Excel Engine
- **Import Engine**: Download standardized Excel templates, upload spreadsheets, review auto-validation statistics (valid rows, errors, duplicates), and commit via database transactions.
- **Diff Update Engine**: Compares uploaded Excel values against database records based on `Employee ID`, highlights differences (Old Value vs New Value), and updates with audit trails.
- **Attendance Excel Update**: Batch upload attendance records with validation.

### Custom Column Export Builder
- Interactive column checklist allowing users to export only the selected columns (e.g., Employee Name, Date, Punch In, Status).
- Generates formatted Excel spreadsheets (`.xlsx`) and printable landscape reports (`.pdf` / HTML print) with 12-hour AM/PM time formatting (e.g. `09:05 AM`, `06:10 PM`).

### Leave Management (Zero Payroll)
- Supports Casual Leave (CL), Earned Leave (EL with default 1.25/month accrual = 15/year, configurable), and Paid Leave (PL).
- Employee submission &rarr; Manager / HR approval workflow &rarr; Automatic balance deduction and attendance status synchronization.

### Shift & Rotational Shift Scheduling
- Fixed shifts (Grace time, working hours, break time).
- Rotational roster definitions (Weekly or custom interval cycles e.g. Morning &rarr; Evening &rarr; Night).

### Live Tracking & Route Maps
- Leaflet map integration with OpenStreetMap tiles.
- Displays live employee positions, route traces, and geofence boundary circles.

---

## 3. Quick Start & Execution

### Starting the Unified Production Server
The backend server automatically builds and serves the frontend client bundle statically on port 5000:

```bash
# Navigate to the project root
cd C:\Users\raush\.gemini\antigravity\scratch\npb-hrms

# Start the unified production application
npm start
```

Visit **http://localhost:5000** in your browser to access NPB HRMS.

### Running Automated Tests
```bash
npm test
```
Runs 11 automated verification checks including bcrypt authentication, Haversine geofence calculations, device binding blocks, Excel generation, and end-to-end multi-tenant workflows.
