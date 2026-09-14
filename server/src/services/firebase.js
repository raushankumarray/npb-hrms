const { initializeApp, cert, deleteApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../db');

let firebaseApp = null;
let firestoreDb = null;
let realtimeDb = null;
let messagingService = null;

let firebaseStatus = {
  initialized: false,
  connected: false,
  mode: 'unconfigured',
  projectId: null,
  databaseUrl: null,
  services: {
    firestore: false,
    realtimeDb: false,
    fcm: false
  },
  features: {
    realtimeGpsSync: true,
    realtimeTicketChat: true,
    liveAttendanceSync: true,
    pushNotifications: true
  },
  lastConnectedAt: null,
  lastError: null
};

// Tolerant parser for service account JSON (handles missing braces, unescaped newlines)
function parseServiceAccount(input) {
  if (!input) return null;
  if (typeof input === 'object' && input !== null) {
    const copy = { ...input };
    if (copy.private_key && typeof copy.private_key === 'string') {
      copy.private_key = copy.private_key.replace(/\\n/g, '\n');
    }
    return copy;
  }
  if (typeof input !== 'string') return null;
  let str = input.trim();
  if (!str.startsWith('{') && str.includes('"project_id"')) {
    str = '{' + str;
  }
  if (!str.endsWith('}') && str.includes('"project_id"')) {
    str = str + '}';
  }
  try {
    const parsed = JSON.parse(str);
    if (parsed.private_key && typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return parsed;
  } catch (e) {
    console.warn('Failed to parse Service Account JSON:', e.message);
    return null;
  }
}

// Helper to read setting from SQLite application_settings table
function getAppSetting(key) {
  try {
    const row = db.prepare('SELECT setting_value FROM application_settings WHERE setting_key = ?').get(key);
    return row ? row.setting_value : null;
  } catch (err) {
    return null;
  }
}

// Helper to save setting to SQLite application_settings table
function setAppSetting(key, val, desc = '') {
  try {
    const existing = db.prepare('SELECT id FROM application_settings WHERE setting_key = ?').get(key);
    if (existing) {
      db.prepare(`
        UPDATE application_settings SET setting_value = ?, description = COALESCE(NULLIF(?, ''), description), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(val, desc, existing.id);
    } else {
      db.prepare(`
        INSERT INTO application_settings (setting_key, setting_value, description, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `).run(key, val, desc);
    }
  } catch (err) {
    console.error('Failed to save setting:', key, err.message);
  }
}

/**
 * Initialize or re-initialize Firebase Admin SDK
 * Priority order:
 * 1. Database application_settings (custom uploaded via Super Admin console)
 * 2. File: server/config/serviceAccountKey.json or server/serviceAccountKey.json
 * 3. Environment variables: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID
 */
function initFirebase() {
  try {
    // Clean up any existing app before re-init
    try {
      const existingApps = getApps();
      for (const app of existingApps) {
        if (app.name === 'npb-hrms-admin' || app.name === '[DEFAULT]') {
          deleteApp(app).catch(() => {});
        }
      }
    } catch (e) {}
    firebaseApp = null;
    firestoreDb = null;
    realtimeDb = null;
    messagingService = null;

    let explicitProjectId = process.env.FIREBASE_PROJECT_ID || getAppSetting('firebase_project_id');
    let databaseURL = process.env.FIREBASE_DATABASE_URL || getAppSetting('firebase_database_url');
    let serviceAccount = null;

    // 1. Check SQLite setting
    const dbJson = getAppSetting('firebase_service_account_json');
    if (dbJson) {
      serviceAccount = parseServiceAccount(dbJson);
    }

    // 2. Check local files
    if (!serviceAccount) {
      const configPaths = [
        path.resolve(__dirname, '../../config/serviceAccountKey.json'),
        path.resolve(__dirname, '../../serviceAccountKey.json')
      ];
      for (const p of configPaths) {
        if (fs.existsSync(p)) {
          try {
            serviceAccount = parseServiceAccount(fs.readFileSync(p, 'utf8'));
            if (serviceAccount) break;
          } catch (e) {}
        }
      }
    }

    // 3. Check environment variables
    if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }

    if (!serviceAccount && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      serviceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL
      };
    }

    if (!serviceAccount) {
      firebaseStatus = {
        initialized: false,
        connected: false,
        mode: 'awaiting_credentials',
        projectId: explicitProjectId || null,
        databaseUrl: databaseURL || null,
        services: {
          firestore: false,
          realtimeDb: false,
          fcm: false
        },
        features: {
          realtimeGpsSync: true,
          realtimeTicketChat: true,
          liveAttendanceSync: true,
          pushNotifications: true
        },
        lastConnectedAt: null,
        lastError: 'Firebase credentials not yet provided. Upload or paste Service Account Key in Super Admin Settings to connect.'
      };
      console.log('ℹ️ Firebase: Awaiting Service Account Credentials. (SQLite fallback active)');
      return false;
    }

    // Initialize Firebase Admin with modern modular SDK
    const config = {
      credential: cert(serviceAccount)
    };
    if (databaseURL) {
      config.databaseURL = databaseURL;
    }

    firebaseApp = initializeApp(config, 'npb-hrms-admin');

    try {
      firestoreDb = getFirestore(firebaseApp);
    } catch (e) {
      console.warn('Firestore initialization notice:', e.message);
    }

    if (databaseURL) {
      try {
        realtimeDb = getDatabase(firebaseApp);
      } catch (e) {
        console.warn('Realtime Database initialization notice:', e.message);
      }
    }

    try {
      messagingService = getMessaging(firebaseApp);
    } catch (e) {
      console.warn('Messaging initialization notice:', e.message);
    }

    firebaseStatus = {
      initialized: true,
      connected: true,
      mode: 'live',
      projectId: serviceAccount.project_id || explicitProjectId,
      databaseUrl: databaseURL || (serviceAccount.project_id ? `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com` : null),
      services: {
        firestore: !!firestoreDb,
        realtimeDb: !!realtimeDb,
        fcm: !!messagingService
      },
      features: {
        realtimeGpsSync: true,
        realtimeTicketChat: true,
        liveAttendanceSync: true,
        pushNotifications: true
      },
      lastConnectedAt: new Date().toISOString(),
      lastError: null
    };

    console.log(`🔥 Firebase Admin Connected! Project: ${serviceAccount.project_id}`);

    // Auto-sync or auto-restore based on database state
    setTimeout(() => {
      try {
        const compCount = db.prepare('SELECT COUNT(*) as count FROM companies WHERE is_deleted = 0').get()?.count || 0;
        if (compCount === 0) {
          console.log('🔄 Local DB has 0 companies. Auto-fetching and restoring all data from Firebase...');
          fetchAllFromFirebaseAndRestoreToDb().then(res => {
            if (res.success) {
              console.log(`🚀 Firebase Auto-Restore Complete: ${res.restoredCompanies} companies, ${res.restoredEmployees} employees, ${res.restoredUsers} users, ${res.restoredAttendances} attendances restored.`);
            }
          }).catch(err => {
            console.warn('Firebase auto-restore notice:', err.message);
          });
        } else {
          syncAllDatabaseToFirebase().then(res => {
            if (res.success) {
              console.log(`🚀 Firebase Auto-Sync Complete: ${res.companiesCount} companies, ${res.employeesCount} employees, ${res.usersCount} users synced.`);
            }
          }).catch(err => {
            console.warn('Firebase auto-sync notice:', err.message);
          });
        }
      } catch (err) {
        console.warn('Firebase post-init handler notice:', err.message);
      }
    }, 1500);

    return true;
  } catch (err) {
    firebaseStatus = {
      initialized: false,
      connected: false,
      mode: 'error',
      projectId: null,
      databaseUrl: null,
      features: {
        realtimeGpsSync: false,
        realtimeTicketChat: false,
        liveAttendanceSync: false,
        pushNotifications: false
      },
      lastConnectedAt: null,
      lastError: err.message
    };
    console.error('🔥 Firebase Initialization Error:', err.message);
    return false;
  }
}

// Initial boot attempt
initFirebase();

/**
 * Real-time sync: Live GPS tracking location
 */
async function syncGpsLocation(companyId, employeeId, locationData) {
  if (!firebaseStatus.connected) return null;
  try {
    const payload = {
      companyId,
      employeeId,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      speed: locationData.speed || 0,
      heading: locationData.heading || 0,
      accuracy: locationData.accuracy || 0,
      locationName: locationData.location_name || '',
      updatedAt: new Date().toISOString()
    };

    if (realtimeDb) {
      await realtimeDb.ref(`live_locations/${companyId}/${employeeId}`).set(payload);
    }
    if (firestoreDb) {
      await firestoreDb.collection('live_locations').doc(`${companyId}_${employeeId}`).set(payload, { merge: true });
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncGpsLocation error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Ticket chat messages
 */
async function syncTicketMessage(ticketId, messageData) {
  if (!firebaseStatus.connected) return null;
  try {
    const payload = {
      ticketId,
      senderId: messageData.user_id,
      senderName: messageData.sender_name,
      senderRole: messageData.sender_role,
      message: messageData.message,
      timestamp: new Date().toISOString()
    };

    if (realtimeDb) {
      await realtimeDb.ref(`ticket_messages/${ticketId}`).push(payload);
    }
    if (firestoreDb) {
      await firestoreDb.collection('tickets').doc(String(ticketId)).collection('messages').add(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncTicketMessage error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Attendance Punch
 */
async function syncAttendancePunch(companyId, employeeId, punchData) {
  if (!firebaseStatus.connected) return null;
  try {
    const today = new Date().toISOString().split('T')[0];
    const payload = {
      companyId,
      employeeId,
      date: today,
      punchInTime: punchData.punch_in_time || null,
      punchOutTime: punchData.punch_out_time || null,
      status: punchData.status || 'Present',
      syncedAt: new Date().toISOString()
    };

    if (realtimeDb) {
      await realtimeDb.ref(`attendance_punches/${companyId}/${employeeId}/${today}`).set(payload);
    }
    if (firestoreDb) {
      await firestoreDb.collection('attendance_punches').doc(`${companyId}_${employeeId}_${today}`).set(payload, { merge: true });
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncAttendancePunch error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Company record
 */
async function syncCompany(company, extra = {}) {
  if (!firebaseStatus.connected || !company) return null;
  try {
    let adminUsername = extra.username || '';
    let adminEmail = extra.email || '';
    if (!adminUsername && company.id) {
      try {
        const adminRow = db.prepare("SELECT username, email FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin') ORDER BY id ASC LIMIT 1").get(company.id);
        if (adminRow) {
          adminUsername = adminRow.username;
          adminEmail = adminRow.email || '';
        }
      } catch (e) {}
    }

    const payload = {
      id: company.id,
      name: company.name,
      code: company.code,
      portalName: company.portal_name || company.name,
      portal_name: company.portal_name || company.name,
      logo: company.logo || '',
      favicon: company.favicon || null,
      email: company.email || adminEmail || '',
      phone: company.phone || '',
      address: company.address || '',
      status: company.status || 'active',
      plan_expiry_date: company.plan_expiry_date || null,
      planExpiryDate: company.plan_expiry_date || null,
      adminUsername: adminUsername,
      adminEmail: adminEmail,
      updatedAt: new Date().toISOString(),
      createdAt: company.created_at || new Date().toISOString()
    };

    if (extra.password) {
      payload.adminPassword = extra.password;
    }

    if (firestoreDb) {
      await firestoreDb.collection('companies').doc(String(company.id)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`companies/${company.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncCompany notice:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Employee record (synced company-wise and globally)
 */
async function syncEmployee(employee, extra = {}) {
  if (!firebaseStatus.connected || !employee) return null;
  try {
    let companyName = employee.company_name || extra.company_name || '';
    if (!companyName && employee.company_id) {
      try {
        const cRow = db.prepare('SELECT name FROM companies WHERE id = ?').get(employee.company_id);
        if (cRow) companyName = cRow.name;
      } catch (e) {}
    }

    let username = employee.username || extra.username || '';
    if (!username && employee.user_id) {
      try {
        const uRow = db.prepare('SELECT username FROM users WHERE id = ?').get(employee.user_id);
        if (uRow) username = uRow.username;
      } catch (e) {}
    }

    const payload = {
      id: employee.id,
      companyId: employee.company_id,
      company_id: employee.company_id,
      userId: employee.user_id || extra.userId || null,
      user_id: employee.user_id || extra.userId || null,
      companyName: companyName,
      company_name: companyName,
      employeeCode: employee.employee_id || '',
      employee_id: employee.employee_id || '',
      fullName: employee.full_name,
      full_name: employee.full_name,
      username: username,
      email: employee.email || '',
      mobile: employee.mobile || '',
      department: employee.department || '',
      designation: employee.designation || '',
      city: employee.city || '',
      role: employee.role_name || extra.role || 'employee',
      role_name: employee.role_name || extra.role || 'employee',
      managerId: employee.manager_id || null,
      manager_id: employee.manager_id || null,
      reportsToAdmin: employee.reports_to_admin ? 1 : 0,
      reports_to_admin: employee.reports_to_admin ? 1 : 0,
      employment_start_date: employee.employment_start_date || null,
      employmentStartDate: employee.employment_start_date || null,
      employment_end_date: employee.employment_end_date || null,
      employmentEndDate: employee.employment_end_date || null,
      status: employee.status || 'active',
      shiftId: employee.shift_id || null,
      shift_id: employee.shift_id || null,
      weeklyOffId: employee.weekly_off_id || null,
      weekly_off_id: employee.weekly_off_id || null,
      updatedAt: new Date().toISOString(),
      createdAt: employee.created_at || new Date().toISOString()
    };

    if (extra.password) {
      payload.password = extra.password;
    }

    if (firestoreDb) {
      await firestoreDb.collection('employees').doc(String(employee.id)).set(payload, { merge: true });
      if (employee.company_id) {
        await firestoreDb.collection('companies').doc(String(employee.company_id)).collection('employees').doc(String(employee.id)).set(payload, { merge: true });
      }
    }
    if (realtimeDb) {
      await realtimeDb.ref(`employees/${employee.id}`).set(payload);
      if (employee.company_id) {
        await realtimeDb.ref(`companies/${employee.company_id}/employees/${employee.id}`).set(payload);
        await realtimeDb.ref(`company_employees/${employee.company_id}/${employee.id}`).set(payload);
      }
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncEmployee notice:', err.message);
    return false;
  }
}

/**
 * Real-time sync: User account / Login event
 */
async function syncUser(user) {
  if (!firebaseStatus.connected || !user) return null;
  try {
    let companyName = user.company_name || '';
    if (!companyName && user.company_id) {
      try {
        const cRow = db.prepare('SELECT name FROM companies WHERE id = ?').get(user.company_id);
        if (cRow) companyName = cRow.name;
      } catch (e) {}
    }

    let roleName = user.role_name || user.role || '';
    if (!roleName && user.role_id) {
      try {
        const rRow = db.prepare('SELECT name FROM roles WHERE id = ?').get(user.role_id);
        if (rRow) roleName = rRow.name;
      } catch (e) {}
    }

    const payload = {
      id: user.id,
      username: user.username,
      email: user.email || '',
      mobile: user.mobile || '',
      passwordHash: user.password_hash || '',
      password_hash: user.password_hash || '',
      role: roleName,
      role_name: roleName,
      roleId: user.role_id || null,
      role_id: user.role_id || null,
      companyId: user.company_id || null,
      company_id: user.company_id || null,
      companyName: companyName,
      status: user.status || 'active',
      lastLoginAt: user.last_login_at || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (firestoreDb) {
      await firestoreDb.collection('users').doc(String(user.id)).set(payload, { merge: true });
      if (user.company_id) {
        await firestoreDb.collection('companies').doc(String(user.company_id)).collection('users').doc(String(user.id)).set(payload, { merge: true });
      }
    }
    if (realtimeDb) {
      await realtimeDb.ref(`users/${user.id}`).set(payload);
      if (user.company_id) {
        await realtimeDb.ref(`companies/${user.company_id}/users/${user.id}`).set(payload);
      }
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncUser notice:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Attendance Punch
 */
async function syncAttendancePunch(companyId, employeeId, punchData) {
  if (!firebaseStatus.connected) return null;
  try {
    const today = punchData.date || new Date().toISOString().split('T')[0];
    const payload = {
      companyId,
      company_id: companyId,
      employeeId,
      employee_id: employeeId,
      date: today,
      punchInTime: punchData.punch_in_time || punchData.punchInTime || null,
      punchOutTime: punchData.punch_out_time || punchData.punchOutTime || null,
      punchInLat: punchData.punch_in_lat ?? punchData.punchInLat ?? null,
      punchInLng: punchData.punch_in_lng ?? punchData.punchInLng ?? null,
      punchInLocation: punchData.punch_in_location || punchData.punchInLocation || null,
      punchOutLat: punchData.punch_out_lat ?? punchData.punchOutLat ?? null,
      punchOutLng: punchData.punch_out_lng ?? punchData.punchOutLng ?? null,
      punchOutLocation: punchData.punch_out_location || punchData.punchOutLocation || null,
      totalHours: punchData.total_hours ?? punchData.totalHours ?? 0.0,
      status: punchData.status || 'Present',
      remarks: punchData.remarks || null,
      syncedAt: new Date().toISOString()
    };

    if (realtimeDb) {
      await realtimeDb.ref(`attendance_punches/${companyId}/${employeeId}/${today}`).set(payload);
      if (companyId) {
        await realtimeDb.ref(`companies/${companyId}/attendance/${today}/${employeeId}`).set(payload);
        await realtimeDb.ref(`company_attendance/${companyId}/${today}/${employeeId}`).set(payload);
      }
    }
    if (firestoreDb) {
      await firestoreDb.collection('attendance_punches').doc(`${companyId}_${employeeId}_${today}`).set(payload, { merge: true });
      if (companyId) {
        await firestoreDb.collection('companies').doc(String(companyId)).collection('attendance').doc(`${today}_${employeeId}`).set(payload, { merge: true });
      }
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncAttendancePunch error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Attendance Correction Request
 */
async function syncAttendanceCorrection(correction) {
  if (!firebaseStatus.connected || !correction) return null;
  try {
    const compId = correction.company_id || correction.companyId;
    const corrId = correction.id;
    const payload = {
      id: corrId,
      companyId: compId,
      company_id: compId,
      employeeId: correction.employee_id || correction.employeeId,
      employee_id: correction.employee_id || correction.employeeId,
      date: correction.date,
      currentPunchIn: correction.current_punch_in || null,
      currentPunchOut: correction.current_punch_out || null,
      currentStatus: correction.current_status || 'Absent',
      requestedPunchIn: correction.requested_punch_in || null,
      requestedPunchOut: correction.requested_punch_out || null,
      requestedStatus: correction.requested_status || 'Present',
      reason: correction.reason || '',
      status: correction.status || 'pending',
      correctionType: correction.correction_type || 'both',
      reviewedBy: correction.reviewed_by || null,
      reviewNotes: correction.review_notes || null,
      syncedAt: new Date().toISOString()
    };

    if (firestoreDb) {
      await firestoreDb.collection('attendance_corrections').doc(String(corrId)).set(payload, { merge: true });
      if (compId) {
        await firestoreDb.collection('companies').doc(String(compId)).collection('attendance_corrections').doc(String(corrId)).set(payload, { merge: true });
      }
    }
    if (realtimeDb) {
      await realtimeDb.ref(`attendance_corrections/${compId}/${corrId}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncAttendanceCorrection error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Employee Manager/HR Mapping
 */
async function syncEmployeeMapping(mapping) {
  if (!firebaseStatus.connected || !mapping) return null;
  try {
    const compId = mapping.company_id || mapping.companyId;
    const mgrId = mapping.manager_id || mapping.managerId;
    const empId = mapping.employee_id || mapping.employeeId;
    const key = `${compId}_${mgrId}_${empId}`;
    const payload = {
      id: mapping.id || key,
      companyId: compId,
      company_id: compId,
      managerId: mgrId,
      manager_id: mgrId,
      employeeId: empId,
      employee_id: empId,
      mappingType: mapping.mapping_type || 'manager',
      assignedBy: mapping.assigned_by || null,
      syncedAt: new Date().toISOString()
    };

    if (firestoreDb) {
      await firestoreDb.collection('employee_mappings').doc(key).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`employee_mappings/${compId}/${mgrId}_${empId}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncEmployeeMapping error:', err.message);
    return false;
  }
}

async function deleteEmployeeMapping(mappingIdOrCompId, companyId, managerId, employeeId) {
  if (!firebaseStatus.connected) return null;
  try {
    const keysToDelete = [];
    if (typeof mappingIdOrCompId === 'object' && mappingIdOrCompId !== null) {
      const { id, company_id, companyId: cId, manager_id, managerId: mId, employee_id, employeeId: eId } = mappingIdOrCompId;
      const c = cId || company_id;
      const m = mId || manager_id;
      const e = eId || employee_id;
      if (id) keysToDelete.push(String(id));
      if (c && m && e) keysToDelete.push(`${c}_${m}_${e}`);
    } else {
      if (mappingIdOrCompId) keysToDelete.push(String(mappingIdOrCompId));
      if (companyId) keysToDelete.push(String(companyId));
      if (companyId && managerId && employeeId) keysToDelete.push(`${companyId}_${managerId}_${employeeId}`);
    }
    for (const k of keysToDelete) {
      if (firestoreDb) await firestoreDb.collection('employee_mappings').doc(k).delete().catch(() => {});
      if (realtimeDb) await realtimeDb.ref(`employee_mappings/${k}`).remove().catch(() => {});
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Real-time sync: Leave Management (Type, Balance, Request)
 */
async function syncLeaveType(leaveType) {
  if (!firebaseStatus.connected || !leaveType) return null;
  try {
    const compId = leaveType.company_id || leaveType.companyId;
    const payload = {
      id: leaveType.id,
      companyId: compId,
      company_id: compId,
      name: leaveType.name,
      defaultYearlyQuota: leaveType.default_yearly_quota || 12.0,
      monthlyAccrualRate: leaveType.monthly_accrual_rate || 1.0,
      isCarryForward: leaveType.is_carry_forward ? 1 : 0,
      maxCarryForward: leaveType.max_carry_forward || 0.0,
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('leave_types').doc(`${compId}_${leaveType.id}`).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`leave_types/${compId}/${leaveType.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncLeaveType error:', err.message);
    return false;
  }
}

async function syncLeaveBalance(balance) {
  if (!firebaseStatus.connected || !balance) return null;
  try {
    const empId = balance.employee_id || balance.employeeId;
    const ltId = balance.leave_type_id || balance.leaveTypeId;
    const yr = balance.year;
    const key = `${empId}_${ltId}_${yr}`;
    const payload = {
      id: balance.id || key,
      employeeId: empId,
      employee_id: empId,
      leaveTypeId: ltId,
      leave_type_id: ltId,
      year: yr,
      openingBalance: balance.opening_balance || 0.0,
      accrued: balance.accrued || 0.0,
      used: balance.used || 0.0,
      balance: balance.balance || 0.0,
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('leave_balances').doc(key).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`leave_balances/${empId}/${ltId}_${yr}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncLeaveBalance error:', err.message);
    return false;
  }
}

async function syncLeaveRequest(request) {
  if (!firebaseStatus.connected || !request) return null;
  try {
    const compId = request.company_id || request.companyId;
    const reqId = request.id;
    const payload = {
      id: reqId,
      companyId: compId,
      company_id: compId,
      employeeId: request.employee_id || request.employeeId,
      employee_id: request.employee_id || request.employeeId,
      leaveTypeId: request.leave_type_id || request.leaveTypeId,
      leave_type_id: request.leave_type_id || request.leaveTypeId,
      startDate: request.start_date || request.startDate,
      start_date: request.start_date || request.startDate,
      endDate: request.end_date || request.endDate,
      end_date: request.end_date || request.endDate,
      totalDays: request.total_days || request.totalDays || 1,
      total_days: request.total_days || request.totalDays || 1,
      reason: request.reason || '',
      status: request.status || 'pending',
      approvedBy: request.approved_by || request.approvedBy || null,
      rejectionReason: request.rejection_reason || request.rejectionReason || null,
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('leave_requests').doc(String(reqId)).set(payload, { merge: true });
      if (compId) {
        await firestoreDb.collection('companies').doc(String(compId)).collection('leave_requests').doc(String(reqId)).set(payload, { merge: true });
      }
    }
    if (realtimeDb) {
      await realtimeDb.ref(`leave_requests/${compId}/${reqId}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncLeaveRequest error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Company Calendar, Holidays, Weekly Offs, Shifts
 */
async function syncHoliday(holiday) {
  if (!firebaseStatus.connected || !holiday) return null;
  try {
    const compId = holiday.company_id || holiday.companyId;
    const payload = {
      id: holiday.id,
      companyId: compId,
      company_id: compId,
      name: holiday.name,
      holidayDate: holiday.holiday_date || holiday.holidayDate,
      holiday_date: holiday.holiday_date || holiday.holidayDate,
      isOptional: holiday.is_optional ? 1 : 0,
      appliesTo: holiday.applies_to || 'all',
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('holidays').doc(String(holiday.id)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`holidays/${compId}/${holiday.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncHoliday error:', err.message);
    return false;
  }
}

async function syncWeeklyOff(weeklyOff) {
  if (!firebaseStatus.connected || !weeklyOff) return null;
  try {
    const compId = weeklyOff.company_id || weeklyOff.companyId;
    const payload = {
      id: weeklyOff.id,
      companyId: compId,
      company_id: compId,
      name: weeklyOff.name,
      offDaysJson: weeklyOff.off_days_json || weeklyOff.offDaysJson || '["Sunday"]',
      isDefault: weeklyOff.is_default ? 1 : 0,
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('weekly_off_settings').doc(String(weeklyOff.id)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`weekly_off_settings/${compId}/${weeklyOff.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncWeeklyOff error:', err.message);
    return false;
  }
}

async function syncShift(shift) {
  if (!firebaseStatus.connected || !shift) return null;
  try {
    const compId = shift.company_id || shift.companyId;
    const payload = {
      id: shift.id,
      companyId: compId,
      company_id: compId,
      name: shift.name,
      startTime: shift.start_time || shift.startTime,
      endTime: shift.end_time || shift.endTime,
      workingHours: shift.working_hours || shift.workingHours || 8.0,
      graceTimeMins: shift.grace_time_mins || shift.graceTimeMins || 15,
      breakTimeMins: shift.break_time_mins || shift.breakTimeMins || 60,
      status: shift.status || 'active',
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('shifts').doc(String(shift.id)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`shifts/${compId}/${shift.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncShift error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Geofencing Data
 */
async function syncGeofence(geofence) {
  if (!firebaseStatus.connected || !geofence) return null;
  try {
    const compId = geofence.company_id || geofence.companyId;
    const payload = {
      id: geofence.id,
      companyId: compId,
      company_id: compId,
      name: geofence.location_name || geofence.name,
      locationName: geofence.location_name || geofence.name,
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      radius: geofence.radius || 100,
      address: geofence.address || '',
      status: geofence.status || 'active',
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('geofences').doc(String(geofence.id)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`geofences/${compId}/${geofence.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncGeofence error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Company Settings & Modules
 */
async function syncCompanySettings(companyId, settings) {
  if (!firebaseStatus.connected || !companyId || !settings) return null;
  try {
    const payload = {
      companyId,
      timezone: settings.timezone || 'Asia/Kolkata',
      workingHoursPerDay: settings.working_hours_per_day || 8.0,
      halfDayMinHours: settings.half_day_min_hours || 4.0,
      fullDayMinHours: settings.full_day_min_hours || 8.0,
      showBrandingMode: settings.show_branding_mode || 'both',
      geofencePolicy: settings.geofence_policy || 'strict',
      websiteTitle: settings.website_title || '',
      contactInfo: settings.contact_info || '',
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('company_settings').doc(String(companyId)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`company_settings/${companyId}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncCompanySettings error:', err.message);
    return false;
  }
}

async function syncCompanyModules(companyId, modules) {
  if (!firebaseStatus.connected || !companyId) return null;
  try {
    const payload = {
      companyId,
      modules: modules || {},
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('company_modules').doc(String(companyId)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`company_modules/${companyId}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncCompanyModules error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Helpdesk / Support Ticket
 */
async function syncSupportTicket(ticket) {
  if (!firebaseStatus.connected || !ticket) return null;
  try {
    const compId = ticket.company_id || ticket.companyId;
    const payload = {
      id: ticket.id,
      ticketNumber: ticket.ticket_number || ticket.ticketNumber || `TKT-${ticket.id}`,
      companyId: compId,
      company_id: compId,
      userId: ticket.user_id || ticket.userId,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category || 'General',
      priority: ticket.priority || 'medium',
      status: ticket.status || 'open',
      createdAt: ticket.created_at || new Date().toISOString(),
      syncedAt: new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('support_tickets').doc(String(ticket.id)).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`support_tickets/${ticket.id}`).set(payload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncSupportTicket error:', err.message);
    return false;
  }
}

/**
 * Real-time sync: Audit Logs
 */
async function syncAuditLog(log) {
  if (!firebaseStatus.connected || !log) return null;
  try {
    const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
      id,
      companyId: log.companyId || log.company_id || null,
      userId: log.userId || log.user_id,
      userName: log.userName || log.user_name || 'System',
      role: log.role || 'system',
      panel: log.panel || 'General',
      action: log.action,
      targetEntity: log.targetEntity || log.target_entity || '',
      targetId: log.targetId || log.target_id || null,
      reason: log.reason || '',
      ipAddress: log.ipAddress || log.ip_address || '127.0.0.1',
      createdAt: log.createdAt || new Date().toISOString()
    };
    if (firestoreDb) {
      await firestoreDb.collection('audit_logs').doc(id).set(payload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`audit_logs/${id}`).set(payload);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Real-time sync: Company Attendance Summary / Reports
 */
async function syncCompanyReports(companyId) {
  if (!firebaseStatus.connected || !companyId) return null;
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalEmps = db.prepare('SELECT COUNT(*) as count FROM employees WHERE company_id = ? AND is_deleted = 0').get(companyId)?.count || 0;
    const presentToday = db.prepare(`
      SELECT COUNT(DISTINCT employee_id) as count FROM attendance_records
      WHERE company_id = ? AND date = ? AND (status IN ('Present', 'half_day', 'Half Day') OR punch_in_time IS NOT NULL)
    `).get(companyId, today)?.count || 0;
    const leaveToday = db.prepare(`
      SELECT COUNT(DISTINCT employee_id) as count FROM leave_requests
      WHERE company_id = ? AND status = 'approved' AND ? BETWEEN start_date AND end_date
    `).get(companyId, today)?.count || 0;
    const absentToday = Math.max(0, totalEmps - presentToday - leaveToday);

    const reportPayload = {
      companyId,
      date: today,
      totalEmployees: totalEmps,
      presentToday,
      absentToday,
      leaveToday,
      generatedAt: new Date().toISOString()
    };

    if (firestoreDb) {
      await firestoreDb.collection('companies').doc(String(companyId)).collection('reports').doc('attendance_summary').set(reportPayload, { merge: true });
    }
    if (realtimeDb) {
      await realtimeDb.ref(`companies/${companyId}/reports/attendance_summary`).set(reportPayload);
    }
    return true;
  } catch (err) {
    console.warn('Firebase syncCompanyReports error:', err.message);
    return false;
  }
}

/**
 * Real-time permanent delete from Firebase
 */
async function deleteFromFirebase(entityType, id, extra = {}) {
  if (!firebaseStatus.connected || !id) return null;
  try {
    const strId = String(id);
    if (entityType === 'companies') {
      if (firestoreDb) {
        await firestoreDb.collection('companies').doc(strId).delete().catch(() => {});
        await firestoreDb.collection('company_settings').doc(strId).delete().catch(() => {});
        await firestoreDb.collection('company_modules').doc(strId).delete().catch(() => {});
      }
      if (realtimeDb) {
        await realtimeDb.ref(`companies/${strId}`).remove().catch(() => {});
        await realtimeDb.ref(`company_settings/${strId}`).remove().catch(() => {});
        await realtimeDb.ref(`company_modules/${strId}`).remove().catch(() => {});
        await realtimeDb.ref(`company_employees/${strId}`).remove().catch(() => {});
        await realtimeDb.ref(`company_attendance/${strId}`).remove().catch(() => {});
        await realtimeDb.ref(`live_locations/${strId}`).remove().catch(() => {});
      }
    } else if (entityType === 'employees') {
      if (firestoreDb) {
        await firestoreDb.collection('employees').doc(strId).delete().catch(() => {});
        if (extra.companyId) {
          await firestoreDb.collection('companies').doc(String(extra.companyId)).collection('employees').doc(strId).delete().catch(() => {});
        }
        if (extra.userId) {
          await firestoreDb.collection('users').doc(String(extra.userId)).delete().catch(() => {});
        }
      }
      if (realtimeDb) {
        await realtimeDb.ref(`employees/${strId}`).remove().catch(() => {});
        if (extra.companyId) {
          await realtimeDb.ref(`companies/${extra.companyId}/employees/${strId}`).remove().catch(() => {});
          await realtimeDb.ref(`company_employees/${extra.companyId}/${strId}`).remove().catch(() => {});
          await realtimeDb.ref(`live_locations/${extra.companyId}/${strId}`).remove().catch(() => {});
        }
        if (extra.userId) {
          await realtimeDb.ref(`users/${extra.userId}`).remove().catch(() => {});
        }
      }
    } else {
      if (firestoreDb) {
        await firestoreDb.collection(entityType).doc(strId).delete().catch(() => {});
      }
      if (realtimeDb) {
        await realtimeDb.ref(`${entityType}/${strId}`).remove().catch(() => {});
      }
    }
    return true;
  } catch (err) {
    console.warn(`Firebase deleteFromFirebase (${entityType}/${id}) notice:`, err.message);
    return false;
  }
}

/**
 * Full Database Sync to Firebase
 * Mirrors all current SQLite companies, users, employees, reports, and attendance to Firebase
 */
async function syncAllDatabaseToFirebase() {
  if (!firebaseStatus.connected) {
    return {
      success: false,
      error: 'Firebase is not connected. Please connect Firebase in Super Admin Settings first.'
    };
  }

  try {
    // 1. Sync all active companies, their settings and modules
    const companies = db.prepare('SELECT * FROM companies WHERE is_deleted = 0').all();
    let companiesCount = 0;
    for (const c of companies) {
      const adminUser = db.prepare("SELECT username, email FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin') LIMIT 1").get(c.id);
      await syncCompany(c, adminUser);
      
      const settings = db.prepare('SELECT * FROM company_settings WHERE company_id = ?').get(c.id);
      if (settings) await syncCompanySettings(c.id, settings);

      const modules = db.prepare('SELECT module_name, is_enabled FROM company_modules WHERE company_id = ?').all(c.id);
      if (modules && modules.length > 0) {
        const modMap = {};
        modules.forEach(m => modMap[m.module_name] = !!m.is_enabled);
        await syncCompanyModules(c.id, modMap);
      }
      companiesCount++;
    }

    // 2. Sync all active users
    const users = db.prepare('SELECT u.id, u.username, u.email, u.mobile, u.password_hash, u.company_id, u.role_id, u.status, u.last_login_at, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.is_deleted = 0').all();
    let usersCount = 0;
    for (const u of users) {
      await syncUser(u);
      usersCount++;
    }

    // 3. Sync all shifts, weekly offs, holidays, and geofences
    let shiftsCount = 0;
    const shifts = db.prepare('SELECT * FROM shifts').all();
    for (const s of shifts) {
      await syncShift(s);
      shiftsCount++;
    }

    let weeklyOffsCount = 0;
    const weeklyOffs = db.prepare('SELECT * FROM weekly_off_settings').all();
    for (const w of weeklyOffs) {
      await syncWeeklyOff(w);
      weeklyOffsCount++;
    }

    let holidaysCount = 0;
    const holidays = db.prepare('SELECT * FROM holidays').all();
    for (const h of holidays) {
      await syncHoliday(h);
      holidaysCount++;
    }

    let geofencesCount = 0;
    const geofences = db.prepare('SELECT * FROM geofences').all();
    for (const g of geofences) {
      await syncGeofence(g);
      geofencesCount++;
    }

    // 4. Sync all active employees
    const employees = db.prepare('SELECT e.*, u.username, c.name as company_name FROM employees e JOIN users u ON e.user_id = u.id JOIN companies c ON e.company_id = c.id WHERE e.is_deleted = 0').all();
    let employeesCount = 0;
    for (const emp of employees) {
      await syncEmployee(emp);
      employeesCount++;
    }

    // 5. Sync employee mappings
    let mappingsCount = 0;
    const mappings = db.prepare('SELECT * FROM employee_mappings').all();
    for (const m of mappings) {
      await syncEmployeeMapping(m);
      mappingsCount++;
    }

    // 6. Sync leave types, balances, and requests
    let leavesCount = 0;
    const leaveTypes = db.prepare('SELECT * FROM leave_types').all();
    for (const lt of leaveTypes) {
      await syncLeaveType(lt);
    }
    const leaveBalances = db.prepare('SELECT * FROM leave_balances').all();
    for (const lb of leaveBalances) {
      await syncLeaveBalance(lb.employee_id, lb.leave_type_id);
    }
    const leaveRequests = db.prepare('SELECT * FROM leave_requests').all();
    for (const lr of leaveRequests) {
      await syncLeaveRequest(lr);
      leavesCount++;
    }

    // 7. Sync attendance corrections
    let correctionsCount = 0;
    const corrections = db.prepare('SELECT * FROM attendance_correction_requests').all();
    for (const cr of corrections) {
      await syncAttendanceCorrection(cr);
      correctionsCount++;
    }

    // 8. Sync recent attendance punches (past 30 days)
    const recentAttendances = db.prepare("SELECT * FROM attendance_records WHERE date >= date('now', '-30 days')").all();
    let attendancesCount = 0;
    for (const att of recentAttendances) {
      await syncAttendancePunch(att.company_id, att.employee_id, {
        date: att.date,
        punch_in_time: att.punch_in_time,
        punch_out_time: att.punch_out_time,
        punch_in_lat: att.punch_in_lat,
        punch_in_lng: att.punch_in_lng,
        punch_in_location: att.punch_in_location,
        punch_out_lat: att.punch_out_lat,
        punch_out_lng: att.punch_out_lng,
        punch_out_location: att.punch_out_location,
        total_hours: att.total_hours,
        status: att.status,
        remarks: att.remarks
      });
      attendancesCount++;
    }

    // 9. Sync support / service tickets
    let ticketsCount = 0;
    const tickets = db.prepare('SELECT * FROM support_tickets').all();
    for (const t of tickets) {
      await syncSupportTicket(t);
      ticketsCount++;
    }

    // 10. Sync company attendance summary reports
    let reportsCount = 0;
    for (const c of companies) {
      await syncCompanyReports(c.id);
      reportsCount++;
    }

    return {
      success: true,
      companiesCount,
      usersCount,
      employeesCount,
      attendancesCount,
      reportsCount,
      shiftsCount,
      weeklyOffsCount,
      holidaysCount,
      geofencesCount,
      mappingsCount,
      leavesCount,
      correctionsCount,
      ticketsCount,
      message: `Successfully synchronized ${companiesCount} companies, ${employeesCount} employees, ${usersCount} user accounts, ${attendancesCount} attendance records, ${leavesCount} leave requests, ${correctionsCount} corrections, ${shiftsCount} shifts, ${geofencesCount} geofences, and ${reportsCount} reports to Firebase!`
    };
  } catch (err) {
    console.error('syncAllDatabaseToFirebase error:', err);
    return {
      success: false,
      error: `Full sync error: ${err.message}`
    };
  }
}

/**
 * Test Firebase Connection live
 */
async function testFirebaseConnection() {
  const start = Date.now();
  if (!firebaseStatus.connected || !firebaseApp) {
    return {
      success: false,
      error: firebaseStatus.lastError || 'Firebase is not initialized. Please provide valid Service Account credentials.'
    };
  }

  try {
    const testPayload = {
      ping: 'pong',
      timestamp: new Date().toISOString(),
      testBy: 'NPB HRMS Super Admin'
    };

    let testedFirestore = false;
    let testedRealtime = false;

    if (firestoreDb) {
      try {
        await firestoreDb.collection('_connection_test').doc('heartbeat').set(testPayload);
        testedFirestore = true;
      } catch (e) {
        console.warn('Firestore test ping notice:', e.message);
      }
    }

    if (realtimeDb) {
      try {
        await Promise.race([
          realtimeDb.ref('_connection_test/heartbeat').set(testPayload),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime DB timeout (verify Database URL and test mode rules)')), 3500))
        ]);
        testedRealtime = true;
      } catch (e) {
        console.warn('Realtime DB test ping notice:', e.message);
      }
    }

    const latency = Date.now() - start;

    if (!testedFirestore && !testedRealtime) {
      return {
        success: false,
        error: 'Could not write test heartbeat to Firestore or Realtime Database. Please verify that either Cloud Firestore or Realtime Database is enabled in your Firebase Console and rules allow access.'
      };
    }

    return {
      success: true,
      latencyMs: latency,
      projectId: firebaseStatus.projectId,
      databaseUrl: firebaseStatus.databaseUrl,
      firestoreTested: testedFirestore,
      realtimeDbTested: testedRealtime,
      message: `Firebase connection verified! Read/Write latency: ${latency}ms.`
    };
  } catch (err) {
    return {
      success: false,
      error: `Firebase Connection Test Failed: ${err.message}`
    };
  }
}

/**
 * Wipe all company data from local database while strictly preserving Super Admin (adminn / Admin@88)
 * Optionally also wipes company data from Firebase Cloud Firestore & Realtime DB so it shows zero.
 */
async function wipeAllCompanyDataFromDb({ syncToFirebase = true } = {}) {
  try {
    const runWipe = db.transaction(() => {
      const safeDelete = (tableName) => {
        try {
          db.prepare(`DELETE FROM ${tableName}`).run();
        } catch (e) {}
      };

      // 1. Delete all transactional, module, attendance, and ticket tables
      safeDelete('attendance_correction_requests');
      safeDelete('attendance_records');
      safeDelete('attendance_edit_logs');
      safeDelete('attendance_import_logs');
      safeDelete('attendance_export_logs');
      safeDelete('employee_mappings');
      safeDelete('employee_devices');
      safeDelete('device_bindings');
      safeDelete('device_binding_logs');
      safeDelete('leave_transactions');
      safeDelete('leave_balances');
      safeDelete('leave_requests');
      safeDelete('leave_types');
      safeDelete('leave_accrual_logs');
      safeDelete('shift_assignments');
      safeDelete('rotational_shifts');
      safeDelete('shifts');
      safeDelete('weekly_off_settings');
      safeDelete('employee_weekly_offs');
      safeDelete('geofence_assignments');
      safeDelete('geofences');
      safeDelete('holidays');
      safeDelete('location_tracking_logs');
      safeDelete('route_tracking_logs');
      safeDelete('service_request_messages');
      safeDelete('service_requests');
      safeDelete('support_ticket_messages');
      safeDelete('support_tickets');
      safeDelete('ticket_messages');
      safeDelete('report_exports');
      safeDelete('excel_import_jobs');
      safeDelete('excel_update_jobs');
      safeDelete('employee_profiles');
      safeDelete('employees');
      safeDelete('company_settings');
      safeDelete('company_modules');
      safeDelete('companies');
      safeDelete('support_users');

      // Clean notifications except super admin
      db.prepare(`
        DELETE FROM notifications 
        WHERE user_id NOT IN (SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'super_admin'))
      `).run();

      // Delete all users EXCEPT super_admin
      db.prepare(`
        DELETE FROM users 
        WHERE role_id != (SELECT id FROM roles WHERE name = 'super_admin')
      `).run();
    });

    db.pragma('foreign_keys = OFF');
    try {
      runWipe();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    // Ensure super_admin adminn is active with correct credentials
    const superAdminRole = db.prepare("SELECT id FROM roles WHERE name = 'super_admin'").get();
    if (superAdminRole) {
      const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'adminn'").get();
      if (!existingAdmin) {
        const passHash = bcrypt.hashSync('Admin@88', 10);
        const resU = db.prepare(`
          INSERT INTO users (username, password_hash, email, role_id, company_id, status)
          VALUES ('adminn', ?, 'superadmin@npbhrms.com', ?, NULL, 'active')
        `).run(passHash, superAdminRole.id);
        const existingSA = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(resU.lastInsertRowid);
        if (!existingSA) {
          db.prepare('INSERT INTO super_admins (user_id, full_name) VALUES (?, ?)').run(resU.lastInsertRowid, 'Global Super Administrator');
        }
      }
    }

    // If syncToFirebase is requested and connected, also wipe from Firebase
    if (syncToFirebase && firebaseStatus.connected) {
      if (firestoreDb) {
        try {
          const compSnap = await firestoreDb.collection('companies').get();
          const batch = firestoreDb.batch();
          compSnap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        } catch (e) {
          console.warn('Firestore wipe companies notice:', e.message);
        }

        try {
          const empSnap = await firestoreDb.collection('employees').get();
          const batch = firestoreDb.batch();
          empSnap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        } catch (e) {
          console.warn('Firestore wipe employees notice:', e.message);
        }

        try {
          const userSnap = await firestoreDb.collection('users').get();
          const batch = firestoreDb.batch();
          userSnap.forEach(d => {
            const data = d.data();
            if (data.role !== 'super_admin' && data.username !== 'adminn') {
              batch.delete(d.ref);
            }
          });
          await batch.commit();
        } catch (e) {
          console.warn('Firestore wipe users notice:', e.message);
        }

        try {
          const attSnap = await firestoreDb.collection('attendance_punches').limit(500).get();
          const batch = firestoreDb.batch();
          attSnap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        } catch (e) {}

        try {
          const locSnap = await firestoreDb.collection('live_locations').limit(500).get();
          const batch = firestoreDb.batch();
          locSnap.forEach(d => batch.delete(d.ref));
          await batch.commit();
        } catch (e) {}

        const extraCollections = [
          'attendance_corrections', 'employee_mappings', 'leave_types', 'leave_balances',
          'leave_requests', 'holidays', 'weekly_off_settings', 'shifts', 'geofences',
          'company_settings', 'company_modules', 'support_tickets'
        ];
        for (const colName of extraCollections) {
          try {
            const snap = await firestoreDb.collection(colName).limit(500).get();
            const batch = firestoreDb.batch();
            snap.forEach(d => batch.delete(d.ref));
            await batch.commit();
          } catch (e) {}
        }
      }

      if (realtimeDb) {
        try {
          await realtimeDb.ref('companies').remove();
          await realtimeDb.ref('employees').remove();
          await realtimeDb.ref('company_employees').remove();
          await realtimeDb.ref('company_attendance').remove();
          await realtimeDb.ref('attendance_punches').remove();
          await realtimeDb.ref('live_locations').remove();
          await realtimeDb.ref('shifts').remove();
          await realtimeDb.ref('weekly_off_settings').remove();
          await realtimeDb.ref('holidays').remove();
          await realtimeDb.ref('geofences').remove();
          await realtimeDb.ref('employee_mappings').remove();
          await realtimeDb.ref('leave_types').remove();
          await realtimeDb.ref('leave_balances').remove();
          await realtimeDb.ref('leave_requests').remove();
          await realtimeDb.ref('attendance_corrections').remove();
          await realtimeDb.ref('support_tickets').remove();
          await realtimeDb.ref('company_settings').remove();
          await realtimeDb.ref('company_modules').remove();
        } catch (e) {
          console.warn('Realtime DB wipe notice:', e.message);
        }
      }
    }

    return {
      success: true,
      message: 'All company data has been wiped from database and reset to 0. Super Admin account is completely preserved.'
    };
  } catch (err) {
    console.error('wipeAllCompanyDataFromDb error:', err);
    return {
      success: false,
      error: `Failed to wipe company data: ${err.message}`
    };
  }
}

/**
 * Reset / Disconnect Firebase credentials from database to allow switching to another account
 * Auto-cleans local company data from database while preserving Super Admin account
 */
async function resetFirebaseConfig() {
  try {
    setAppSetting('firebase_project_id', '');
    setAppSetting('firebase_service_account_json', '');
    setAppSetting('firebase_database_url', '');

    if (firebaseApp) {
      try {
        await deleteApp(firebaseApp);
      } catch (e) {}
    }
    firebaseApp = null;
    firestoreDb = null;
    realtimeDb = null;
    messagingService = null;

    firebaseStatus = {
      initialized: false,
      connected: false,
      mode: 'unconfigured',
      projectId: null,
      databaseUrl: null,
      services: { firestore: false, realtimeDb: false, fcm: false },
      features: { realtimeGpsSync: true, realtimeTicketChat: true, liveAttendanceSync: true, pushNotifications: true },
      lastConnectedAt: null,
      lastError: null
    };

    // Auto remove all company data from local database upon disconnecting Firebase (preserving Super Admin)
    await wipeAllCompanyDataFromDb({ syncToFirebase: false });

    return {
      success: true,
      message: 'Firebase account disconnected and all local company data cleared from database. Super Admin account is preserved. You can now connect another Firebase project and restore data.'
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to reset Firebase config: ${err.message}`
    };
  }
}

/**
 * Fetch All Data from Firebase and Restore / Recover into local SQLite database
 * Recovers all companies, users, employees, managers, support accounts, and attendance records.
 * All accounts can immediately log in and access all data without error.
 */
async function fetchAllFromFirebaseAndRestoreToDb() {
  if (!firebaseStatus.connected) {
    return {
      success: false,
      error: 'Firebase is not connected. Please connect your Firebase account in Super Admin Settings first.'
    };
  }

  try {
    const roleRows = db.prepare('SELECT id, name FROM roles').all();
    const roleMap = {};
    for (const r of roleRows) roleMap[r.name] = r.id;

    // Ensure default roles
    if (!roleMap['super_admin']) {
      const ins = db.prepare('INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)');
      ins.run('super_admin', 'Global System Super Administrator');
      ins.run('support', 'Support User');
      ins.run('company_admin', 'Company Administrator');
      ins.run('manager', 'Manager');
      ins.run('employee', 'Employee');
      db.prepare('SELECT id, name FROM roles').all().forEach(r => roleMap[r.name] = r.id);
    }

    let companiesMap = new Map();
    let usersMap = new Map();
    let employeesMap = new Map();
    let attendanceMap = new Map();
    let shiftsMap = new Map();
    let weeklyOffsMap = new Map();
    let holidaysMap = new Map();
    let geofencesMap = new Map();
    let mappingsMap = new Map();
    let leaveTypesMap = new Map();
    let leaveBalancesMap = new Map();
    let leaveRequestsMap = new Map();
    let correctionsMap = new Map();
    let ticketsMap = new Map();
    let settingsMap = new Map();
    let modulesMap = new Map();

    // 1. Fetch from Firestore if available
    if (firestoreDb) {
      const fetchFsCollection = async (collName, targetMap) => {
        try {
          const snap = await firestoreDb.collection(collName).limit(1000).get();
          snap.forEach(doc => {
            const d = doc.data();
            targetMap.set(String(d.id || doc.id), { id: d.id || doc.id, ...d });
          });
        } catch (e) {
          console.warn(`Firestore fetch ${collName} notice:`, e.message);
        }
      };

      await fetchFsCollection('companies', companiesMap);
      await fetchFsCollection('users', usersMap);
      await fetchFsCollection('employees', employeesMap);
      await fetchFsCollection('shifts', shiftsMap);
      await fetchFsCollection('weekly_off_settings', weeklyOffsMap);
      await fetchFsCollection('holidays', holidaysMap);
      await fetchFsCollection('geofences', geofencesMap);
      await fetchFsCollection('employee_mappings', mappingsMap);
      await fetchFsCollection('leave_types', leaveTypesMap);
      await fetchFsCollection('leave_balances', leaveBalancesMap);
      await fetchFsCollection('leave_requests', leaveRequestsMap);
      await fetchFsCollection('attendance_corrections', correctionsMap);
      await fetchFsCollection('support_tickets', ticketsMap);
      await fetchFsCollection('company_settings', settingsMap);
      await fetchFsCollection('company_modules', modulesMap);

      try {
        const snap = await firestoreDb.collection('attendance_punches').limit(1000).get();
        snap.forEach(doc => {
          const d = doc.data();
          const key = `${d.companyId || d.company_id}_${d.employeeId || d.employee_id}_${d.date}`;
          attendanceMap.set(key, d);
        });
      } catch (e) {
        console.warn('Firestore fetch attendance notice:', e.message);
      }
    }

    // 2. Also check Realtime Database for any additional data
    if (realtimeDb) {
      const fetchRtDbCollection = async (refPath, targetMap) => {
        try {
          const snap = await realtimeDb.ref(refPath).once('value');
          const val = snap.val();
          if (val && typeof val === 'object') {
            Object.entries(val).forEach(([k, v]) => {
              if (v && typeof v === 'object') {
                if (v.id) {
                  const id = String(v.id);
                  if (!targetMap.has(id)) targetMap.set(id, { id: v.id, ...v });
                } else {
                  // Might be companyId -> itemId map
                  Object.entries(v).forEach(([subK, subV]) => {
                    if (subV && typeof subV === 'object') {
                      const id = String(subV.id || subK);
                      if (!targetMap.has(id)) targetMap.set(id, { id: subV.id || subK, ...subV });
                    }
                  });
                }
              }
            });
          }
        } catch (e) {}
      };

      await fetchRtDbCollection('companies', companiesMap);
      await fetchRtDbCollection('users', usersMap);
      await fetchRtDbCollection('employees', employeesMap);
      await fetchRtDbCollection('shifts', shiftsMap);
      await fetchRtDbCollection('weekly_off_settings', weeklyOffsMap);
      await fetchRtDbCollection('holidays', holidaysMap);
      await fetchRtDbCollection('geofences', geofencesMap);
      await fetchRtDbCollection('employee_mappings', mappingsMap);
      await fetchRtDbCollection('leave_types', leaveTypesMap);
      await fetchRtDbCollection('leave_balances', leaveBalancesMap);
      await fetchRtDbCollection('leave_requests', leaveRequestsMap);
      await fetchRtDbCollection('attendance_corrections', correctionsMap);
      await fetchRtDbCollection('support_tickets', ticketsMap);
      await fetchRtDbCollection('company_settings', settingsMap);
      await fetchRtDbCollection('company_modules', modulesMap);
    }

    // Strict 1:1 Mirror: Purge existing local tenant data before restore so that local database
    // strictly mirrors Firebase with 0 ghost/leftover companies, while strictly preserving Super Admin `adminn`.
    await wipeAllCompanyDataFromDb({ syncToFirebase: false });

    // 3. Upsert into SQLite in transaction
    let restoredCompanies = 0;
    let restoredUsers = 0;
    let restoredEmployees = 0;
    let restoredAttendances = 0;

    const companyIdMap = new Map();
    const userIdMap = new Map();
    const employeeIdMap = new Map();
    const shiftIdMap = new Map();
    const weeklyOffIdMap = new Map();
    const geofenceIdMap = new Map();
    const leaveTypeIdMap = new Map();
    const claimedCompanyIds = new Set();
    const claimedUserIds = new Set();
    const claimedEmployeeIds = new Set();
    const companyAdminUsernameMap = new Map();
    const companyAdminPasswordMap = new Map();
    const companyAdminEmailMap = new Map();

    const restoreTransaction = db.transaction(() => {
      // Phase 1: Restore Companies & Setup Default Structures
      for (const [docKey, c] of companiesMap) {
        let rawId = Number(c.id);
        const rawCode = (c.code || (!isNaN(rawId) && rawId > 0 ? `COMP${rawId}` : `COMP_${Date.now()}_${Math.floor(Math.random() * 1000)}`)).trim().toUpperCase();
        const name = (c.name || c.portalName || c.portal_name || rawCode || 'Company').trim();
        const portalName = (c.portal_name || c.portalName || name || 'Portal').trim();
        const email = c.email || '';
        const phone = c.phone || '';
        const address = c.address || '';
        const logo = c.logo || '';

        // Normalize status: check constraint IN ('active', 'disabled', 'banned', 'deleted')
        let status = (c.status || 'active').toLowerCase().trim();
        if (status === 'suspended' || status === 'inactive') status = 'disabled';
        if (status === 'block' || status === 'blocked') status = 'banned';
        if (!['active', 'disabled', 'banned', 'deleted'].includes(status)) status = 'active';

        let targetCompId = (!isNaN(rawId) && rawId > 0) ? rawId : null;
        let existing = null;

        if (targetCompId) {
          existing = db.prepare('SELECT id, code FROM companies WHERE id = ?').get(targetCompId);
        }
        if (!existing && rawCode) {
          const byCode = db.prepare('SELECT id, code FROM companies WHERE LOWER(code) = LOWER(?)').get(rawCode);
          if (byCode) {
            existing = byCode;
            targetCompId = existing.id;
          }
        }

        const planExpiryDate = c.plan_expiry_date || c.planExpiryDate || null;
        const compFavicon = c.favicon || null;

        if (existing && claimedCompanyIds.has(existing.id)) {
          // Already claimed/restored in this cycle - update company details and keep existing id
          db.prepare(`
            UPDATE companies SET name = ?, portal_name = ?, email = ?, phone = ?, address = ?, logo = ?, favicon = COALESCE(?, favicon), plan_expiry_date = COALESCE(?, plan_expiry_date), status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(name, portalName, email, phone, address, logo, compFavicon, planExpiryDate, status, existing.id);
          targetCompId = existing.id;
        } else if (existing) {
          db.prepare(`
            UPDATE companies SET name = ?, portal_name = ?, code = ?, email = ?, phone = ?, address = ?, logo = ?, favicon = COALESCE(?, favicon), plan_expiry_date = COALESCE(?, plan_expiry_date), status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(name, portalName, rawCode, email, phone, address, logo, compFavicon, planExpiryDate, status, existing.id);
          targetCompId = existing.id;
        } else {
          // Guarantee unique code
          let finalCode = rawCode;
          let codeConflict = db.prepare('SELECT id FROM companies WHERE LOWER(code) = LOWER(?)').get(finalCode);
          let codeSuffix = 1;
          while (codeConflict) {
            finalCode = `${rawCode}_${codeSuffix++}`;
            codeConflict = db.prepare('SELECT id FROM companies WHERE LOWER(code) = LOWER(?)').get(finalCode);
          }

          let canUseCompId = (!isNaN(targetCompId) && targetCompId > 0 && !claimedCompanyIds.has(targetCompId));
          if (canUseCompId) {
            const occupied = db.prepare('SELECT id FROM companies WHERE id = ?').get(targetCompId);
            if (occupied) canUseCompId = false;
          }

          if (canUseCompId) {
            try {
              db.prepare(`
                INSERT INTO companies (id, name, portal_name, code, email, phone, address, logo, favicon, plan_expiry_date, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(targetCompId, name, portalName, finalCode, email, phone, address, logo, compFavicon, planExpiryDate, status);
            } catch (err) {
              const insRes = db.prepare(`
                INSERT INTO companies (name, portal_name, code, email, phone, address, logo, favicon, plan_expiry_date, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(name, portalName, finalCode, email, phone, address, logo, compFavicon, planExpiryDate, status);
              targetCompId = insRes.lastInsertRowid;
            }
          } else {
            const insRes = db.prepare(`
              INSERT INTO companies (name, portal_name, code, email, phone, address, logo, favicon, plan_expiry_date, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(name, portalName, finalCode, email, phone, address, logo, compFavicon, planExpiryDate, status);
            targetCompId = insRes.lastInsertRowid;
          }
        }

        claimedCompanyIds.add(targetCompId);
        companyIdMap.set(String(docKey), targetCompId);
        if (c.id) companyIdMap.set(String(c.id), targetCompId);
        companyIdMap.set(String(targetCompId), targetCompId);

        // Settings & Modules restored directly from Firebase if present, or fallback defaults
        const s = settingsMap.get(String(targetCompId)) || settingsMap.get(String(docKey)) || (c.id ? settingsMap.get(String(c.id)) : null);
        const timezone = s?.timezone || 'Asia/Kolkata';
        const workingHours = Number(s?.workingHoursPerDay || s?.working_hours_per_day || 8.0);
        const halfDayMin = Number(s?.halfDayMinHours || s?.half_day_min_hours || 4.0);
        const fullDayMin = Number(s?.fullDayMinHours || s?.full_day_min_hours || 8.0);
        const branding = s?.showBrandingMode || s?.show_branding_mode || 'both';
        const geofencePol = s?.geofencePolicy || s?.geofence_policy || 'strict';
        const websiteTitle = s?.websiteTitle || s?.website_title || '';
        const contactInfo = s?.contactInfo || s?.contact_info || '';

        const existingSettings = db.prepare('SELECT id FROM company_settings WHERE company_id = ?').get(targetCompId);
        if (existingSettings) {
          db.prepare(`
            UPDATE company_settings SET timezone = ?, working_hours_per_day = ?, half_day_min_hours = ?, full_day_min_hours = ?, show_branding_mode = ?, geofence_policy = ?, website_title = ?, contact_info = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(timezone, workingHours, halfDayMin, fullDayMin, branding, geofencePol, websiteTitle, contactInfo, existingSettings.id);
        } else {
          db.prepare(`
            INSERT INTO company_settings (company_id, timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours, show_branding_mode, geofence_policy, website_title, contact_info)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(targetCompId, timezone, workingHours, halfDayMin, fullDayMin, branding, geofencePol, websiteTitle, contactInfo);
        }

        const mObj = modulesMap.get(String(targetCompId)) || modulesMap.get(String(docKey)) || (c.id ? modulesMap.get(String(c.id)) : null);
        const mods = mObj?.modules || mObj || {};
        const allModules = ['geofencing', 'live_tracking', 'leave_management', 'payroll', 'support_tickets', 'dynamic_forms'];
        for (const m of allModules) {
          const isEnabled = (mods[m] !== undefined) ? (mods[m] ? 1 : 0) : 1;
          const existingMod = db.prepare('SELECT id FROM company_modules WHERE company_id = ? AND module_name = ?').get(targetCompId, m);
          if (existingMod) {
            db.prepare('UPDATE company_modules SET is_enabled = ? WHERE id = ?').run(isEnabled, existingMod.id);
          } else {
            db.prepare('INSERT INTO company_modules (company_id, module_name, is_enabled) VALUES (?, ?, ?)').run(targetCompId, m, isEnabled);
          }
        }

        // Store company's designated admin username and password from company metadata (DO NOT insert into users yet!)
        let rawAdminUname = String(c.adminUsername || c.admin_username || '').trim();
        if (rawAdminUname.match(/^(.+)_1$/)) {
          const base = rawAdminUname.match(/^(.+)_1$/)[1];
          if (base) rawAdminUname = base;
        }
        if (rawAdminUname) {
          companyAdminUsernameMap.set(targetCompId, rawAdminUname);
        }
        if (c.adminPassword || c.admin_password) {
          companyAdminPasswordMap.set(targetCompId, c.adminPassword || c.admin_password);
        }
        if (c.adminEmail || c.admin_email || email) {
          companyAdminEmailMap.set(targetCompId, c.adminEmail || c.admin_email || email);
        }

        restoredCompanies++;
      }

      // Phase 2: Restore Users (Parent to Employees, Company Admins, and Support Tickets)
      for (const [docKey, u] of usersMap) {
        let rawUserId = Number(u.id);
        let baseUsername = (u.username || u.name || '').trim();
        if (!baseUsername) {
          baseUsername = (u.email ? u.email.split('@')[0] : (u.mobile ? `user_${u.mobile}` : `user_${docKey}`)).trim();
        }
        const originalUsername = baseUsername;
        const email = u.email || '';
        const mobile = u.mobile || '';
        const roleName = (u.role || u.role_name || 'employee').toLowerCase().trim();
        const roleId = roleMap[roleName] || roleMap['employee'];

        let rawCompId = u.companyId || u.company_id;
        let compId = null;
        if (rawCompId) {
          const mappedCompId = companyIdMap.get(String(rawCompId)) || Number(rawCompId);
          if (mappedCompId && !isNaN(mappedCompId) && claimedCompanyIds.has(mappedCompId)) {
            compId = mappedCompId;
          }
        }
        // If this is a tenant user but their company does not exist in Firebase, do not restore them!
        if (!compId && (roleName === 'company_admin' || roleName === 'manager' || roleName === 'employee')) {
          continue;
        }

        // Check if username is adminn (Super Admin) - never alter Super Admin credentials or role
        if (baseUsername.toLowerCase() === 'adminn') {
          const existingAdmin = db.prepare("SELECT id FROM users WHERE LOWER(username) = 'adminn'").get();
          if (existingAdmin) {
            userIdMap.set(String(docKey), existingAdmin.id);
            if (u.id) userIdMap.set(String(u.id), existingAdmin.id);
            userIdMap.set('adminn', existingAdmin.id);
            claimedUserIds.add(existingAdmin.id);
            continue;
          }
        }

        // Normalize any artifact suffixed usernames (e.g. 'b_1' -> 'b') for company admins
        if (roleName === 'company_admin' && compId) {
          const designatedAdmin = companyAdminUsernameMap.get(compId);
          if (designatedAdmin) {
            if (baseUsername.toLowerCase() === designatedAdmin.toLowerCase()) {
              baseUsername = designatedAdmin;
            } else if (baseUsername.match(new RegExp(`^${designatedAdmin}_\\d+$`, 'i'))) {
              baseUsername = designatedAdmin;
            }
          }
        }

        let status = (u.status || 'active').toLowerCase().trim();
        if (status === 'suspended' || status === 'inactive') status = 'disabled';
        if (status === 'block' || status === 'blocked') status = 'banned';
        if (!['active', 'disabled', 'banned', 'deleted'].includes(status)) status = 'active';

        let finalHash = u.password_hash || u.passwordHash;
        if (!finalHash && u.password) {
          finalHash = bcrypt.hashSync(String(u.password).trim(), 10);
        }
        if (!finalHash) {
          const existingUser = db.prepare('SELECT password_hash FROM users WHERE LOWER(username) = LOWER(?)').get(baseUsername);
          if (existingUser && existingUser.password_hash) {
            finalHash = existingUser.password_hash;
          } else {
            const designatedPass = compId ? companyAdminPasswordMap.get(compId) : null;
            const defaultPass = designatedPass || (roleName === 'super_admin' ? 'Admin@88' : (roleName === 'support' ? 'Support@123' : (roleName === 'company_admin' ? 'Admin@123' : (roleName === 'manager' ? 'Manager@123' : 'Employee@123'))));
            finalHash = bcrypt.hashSync(defaultPass, 10);
          }
        }

        // Check if user with this username ALREADY exists in database
        const existingByName = db.prepare('SELECT id, username, role_id, password_hash FROM users WHERE LOWER(username) = LOWER(?)').get(baseUsername);
        let targetUserId = null;

        if (existingByName) {
          // Update the existing user WITHOUT changing their unique username. Zero suffixing!
          db.prepare(`
            UPDATE users SET
              password_hash = COALESCE(?, password_hash),
              email = COALESCE(NULLIF(?, ''), email),
              mobile = COALESCE(NULLIF(?, ''), mobile),
              role_id = COALESCE(?, role_id),
              company_id = COALESCE(?, company_id),
              status = ?,
              is_deleted = 0,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(finalHash, email, mobile, roleId, compId, status, existingByName.id);
          targetUserId = existingByName.id;
        } else {
          // Insert new user with EXACT username - zero suffixing!
          let canUseId = (!isNaN(rawUserId) && rawUserId > 0 && !claimedUserIds.has(rawUserId));
          if (canUseId) {
            const idOccupied = db.prepare('SELECT id FROM users WHERE id = ?').get(rawUserId);
            if (idOccupied) canUseId = false;
          }

          if (canUseId) {
            try {
              db.prepare(`
                INSERT INTO users (id, username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(rawUserId, baseUsername, finalHash, email, mobile, roleId, compId, status);
              targetUserId = rawUserId;
            } catch (err) {
              const uRes = db.prepare(`
                INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(baseUsername, finalHash, email, mobile, roleId, compId, status);
              targetUserId = uRes.lastInsertRowid;
            }
          } else {
            const uRes = db.prepare(`
              INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(baseUsername, finalHash, email, mobile, roleId, compId, status);
            targetUserId = uRes.lastInsertRowid;
          }
        }

        claimedUserIds.add(targetUserId);
        userIdMap.set(String(docKey), targetUserId);
        if (u.id) userIdMap.set(String(u.id), targetUserId);
        userIdMap.set(baseUsername.toLowerCase(), targetUserId);
        if (originalUsername.toLowerCase() !== baseUsername.toLowerCase()) {
          userIdMap.set(originalUsername.toLowerCase(), targetUserId);
        }
        userIdMap.set(String(targetUserId), targetUserId);

        if (roleName === 'super_admin') {
          const existingAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(targetUserId);
          if (!existingAdmin) {
            db.prepare(`
              INSERT INTO super_admins (user_id, full_name)
              VALUES (?, 'Global Super Administrator')
            `).run(targetUserId);
          }
        } else if (roleName === 'support') {
          const existingSupport = db.prepare('SELECT id FROM support_users WHERE user_id = ?').get(targetUserId);
          if (existingSupport) {
            db.prepare('UPDATE support_users SET permission_level = 4 WHERE id = ?').run(existingSupport.id);
          } else {
            db.prepare(`
              INSERT INTO support_users (user_id, full_name, permission_level)
              VALUES (?, 'Technical Support Specialist', 4)
            `).run(targetUserId);
          }
        }

        restoredUsers++;
      }

      // Guarantee every restored company has its designated admin user
      for (const [_, c] of companiesMap) {
        let compId = companyIdMap.get(String(c.id)) || Number(c.id);
        if (!compId || !claimedCompanyIds.has(compId)) continue;

        let rawAdminUname = companyAdminUsernameMap.get(compId) || String(c.adminUsername || c.admin_username || '').trim();
        if (rawAdminUname.match(/^(.+)_1$/)) {
          const base = rawAdminUname.match(/^(.+)_1$/)[1];
          if (base) rawAdminUname = base;
        }
        if (!rawAdminUname) continue;

        const existingAdmin = db.prepare("SELECT id FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin')").get(compId);
        if (!existingAdmin) {
          const byUname = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(rawAdminUname);
          if (byUname) {
            db.prepare("UPDATE users SET company_id = ?, role_id = (SELECT id FROM roles WHERE name = 'company_admin'), is_deleted = 0 WHERE id = ?").run(compId, byUname.id);
            userIdMap.set(rawAdminUname.toLowerCase(), byUname.id);
            claimedUserIds.add(byUname.id);
          } else {
            const aPass = companyAdminPasswordMap.get(compId) || c.adminPassword || c.admin_password || 'Admin@123';
            const aHash = bcrypt.hashSync(String(aPass).trim(), 10);
            const aEmail = companyAdminEmailMap.get(compId) || c.email || '';
            const aPhone = c.phone || '';
            const roleCompAdmin = roleMap['company_admin'];

            const insAdmin = db.prepare(`
              INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted)
              VALUES (?, ?, ?, ?, ?, ?, 'active', 0)
            `).run(rawAdminUname, aHash, aEmail, aPhone, roleCompAdmin, compId);

            userIdMap.set(rawAdminUname.toLowerCase(), insAdmin.lastInsertRowid);
            claimedUserIds.add(insAdmin.lastInsertRowid);
            restoredUsers++;
          }
        }
      }

      // Phase 3: Restore Shifts & Weekly Off Settings (ONLY for companies present in Firebase!)
      for (const [docKey, s] of shiftsMap) {
        let rawCompId = s.companyId || s.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (compId && claimedCompanyIds.has(compId) && s.name) {
          const sName = String(s.name).trim();
          const sStart = s.startTime || s.start_time || '09:00';
          const sEnd = s.endTime || s.end_time || '18:00';
          const sHours = Number(s.workingHours || s.working_hours || 8.0);
          const sGrace = Number(s.graceTimeMins || s.grace_time_mins || 15);
          const sBreak = Number(s.breakTimeMins || s.break_time_mins || 60);
          const sRot = s.isRotational ? 1 : 0;
          const sStatus = s.status || 'active';

          let targetShiftId = (!isNaN(Number(s.id)) && Number(s.id) > 0) ? Number(s.id) : null;
          const existingShift = db.prepare('SELECT id FROM shifts WHERE company_id = ? AND LOWER(name) = LOWER(?)').get(compId, sName);
          if (existingShift) {
            db.prepare(`
              UPDATE shifts SET start_time = ?, end_time = ?, working_hours = ?, grace_time_mins = ?, break_time_mins = ?, is_rotational = ?, status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(sStart, sEnd, sHours, sGrace, sBreak, sRot, sStatus, existingShift.id);
            targetShiftId = existingShift.id;
          } else {
            let canUseId = (targetShiftId && !db.prepare('SELECT id FROM shifts WHERE id = ?').get(targetShiftId));
            if (canUseId) {
              try {
                db.prepare(`
                  INSERT INTO shifts (id, company_id, name, start_time, end_time, working_hours, grace_time_mins, break_time_mins, is_rotational, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(targetShiftId, compId, sName, sStart, sEnd, sHours, sGrace, sBreak, sRot, sStatus);
              } catch (e) {
                const ins = db.prepare(`
                  INSERT INTO shifts (company_id, name, start_time, end_time, working_hours, grace_time_mins, break_time_mins, is_rotational, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(compId, sName, sStart, sEnd, sHours, sGrace, sBreak, sRot, sStatus);
                targetShiftId = ins.lastInsertRowid;
              }
            } else {
              const ins = db.prepare(`
                INSERT INTO shifts (company_id, name, start_time, end_time, working_hours, grace_time_mins, break_time_mins, is_rotational, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(compId, sName, sStart, sEnd, sHours, sGrace, sBreak, sRot, sStatus);
              targetShiftId = ins.lastInsertRowid;
            }
          }
          shiftIdMap.set(String(docKey), targetShiftId);
          if (s.id) shiftIdMap.set(String(s.id), targetShiftId);
          shiftIdMap.set(String(targetShiftId), targetShiftId);
        }
      }

      for (const [docKey, w] of weeklyOffsMap) {
        let rawCompId = w.companyId || w.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (compId && claimedCompanyIds.has(compId) && w.name) {
          const wName = String(w.name).trim();
          const wOffDays = typeof w.offDaysJson === 'string' ? w.offDaysJson : (typeof w.off_days_json === 'string' ? w.off_days_json : JSON.stringify(w.offDays || w.off_days || ['Sunday']));
          const wDefault = (w.isDefault || w.is_default) ? 1 : 0;

          let targetWoffId = (!isNaN(Number(w.id)) && Number(w.id) > 0) ? Number(w.id) : null;
          const existingWoff = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? AND LOWER(name) = LOWER(?)').get(compId, wName);
          if (existingWoff) {
            db.prepare(`
              UPDATE weekly_off_settings SET off_days_json = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(wOffDays, wDefault, existingWoff.id);
            targetWoffId = existingWoff.id;
          } else {
            let canUseId = (targetWoffId && !db.prepare('SELECT id FROM weekly_off_settings WHERE id = ?').get(targetWoffId));
            if (canUseId) {
              try {
                db.prepare(`
                  INSERT INTO weekly_off_settings (id, company_id, name, off_days_json, is_default)
                  VALUES (?, ?, ?, ?, ?)
                `).run(targetWoffId, compId, wName, wOffDays, wDefault);
              } catch (e) {
                const ins = db.prepare(`
                  INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
                  VALUES (?, ?, ?, ?)
                `).run(compId, wName, wOffDays, wDefault);
                targetWoffId = ins.lastInsertRowid;
              }
            } else {
              const ins = db.prepare(`
                INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
                VALUES (?, ?, ?, ?)
              `).run(compId, wName, wOffDays, wDefault);
              targetWoffId = ins.lastInsertRowid;
            }
          }
          weeklyOffIdMap.set(String(docKey), targetWoffId);
          if (w.id) weeklyOffIdMap.set(String(w.id), targetWoffId);
          weeklyOffIdMap.set(String(targetWoffId), targetWoffId);
        }
      }

      // Phase 4: Restore Holidays & Geofences (ONLY for companies present in Firebase!)
      for (const [_, h] of holidaysMap) {
        let rawCompId = h.companyId || h.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        const hDate = h.holidayDate || h.holiday_date;
        if (compId && claimedCompanyIds.has(compId) && h.name && hDate) {
          const hName = String(h.name).trim();
          const hOpt = (h.isOptional || h.is_optional) ? 1 : 0;
          const hApp = h.appliesTo || h.applies_to || 'all';

          const existingHoliday = db.prepare('SELECT id FROM holidays WHERE company_id = ? AND holiday_date = ?').get(compId, hDate);
          if (existingHoliday) {
            db.prepare(`
              UPDATE holidays SET name = ?, is_optional = ?, applies_to = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(hName, hOpt, hApp, existingHoliday.id);
          } else {
            db.prepare(`
              INSERT INTO holidays (company_id, name, holiday_date, is_optional, applies_to)
              VALUES (?, ?, ?, ?, ?)
            `).run(compId, hName, hDate, hOpt, hApp);
          }
        }
      }

      for (const [docKey, g] of geofencesMap) {
        let rawCompId = g.companyId || g.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        const locName = (g.locationName || g.location_name || g.name || '').trim();
        if (compId && claimedCompanyIds.has(compId) && locName && g.latitude !== undefined && g.longitude !== undefined) {
          const gLat = parseFloat(g.latitude);
          const gLng = parseFloat(g.longitude);
          const gRadius = parseFloat(g.radius || 100);
          const gStatus = (g.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';

          let targetGeoId = (!isNaN(Number(g.id)) && Number(g.id) > 0) ? Number(g.id) : null;
          const existingGeo = db.prepare('SELECT id FROM geofences WHERE company_id = ? AND LOWER(location_name) = LOWER(?)').get(compId, locName);
          if (existingGeo) {
            db.prepare(`
              UPDATE geofences SET latitude = ?, longitude = ?, radius = ?, status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(gLat, gLng, gRadius, gStatus, existingGeo.id);
            targetGeoId = existingGeo.id;
          } else {
            let canUseId = (targetGeoId && !db.prepare('SELECT id FROM geofences WHERE id = ?').get(targetGeoId));
            if (canUseId) {
              try {
                db.prepare(`
                  INSERT INTO geofences (id, company_id, location_name, latitude, longitude, radius, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(targetGeoId, compId, locName, gLat, gLng, gRadius, gStatus);
              } catch (e) {
                const ins = db.prepare(`
                  INSERT INTO geofences (company_id, location_name, latitude, longitude, radius, status)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(compId, locName, gLat, gLng, gRadius, gStatus);
                targetGeoId = ins.lastInsertRowid;
              }
            } else {
              const ins = db.prepare(`
                INSERT INTO geofences (company_id, location_name, latitude, longitude, radius, status)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(compId, locName, gLat, gLng, gRadius, gStatus);
              targetGeoId = ins.lastInsertRowid;
            }
          }
          geofenceIdMap.set(String(docKey), targetGeoId);
          if (g.id) geofenceIdMap.set(String(g.id), targetGeoId);
          geofenceIdMap.set(String(targetGeoId), targetGeoId);
        }
      }

      // Phase 5: Restore Leave Types (ONLY for companies present in Firebase!)
      for (const [docKey, lt] of leaveTypesMap) {
        let rawCompId = lt.companyId || lt.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (compId && claimedCompanyIds.has(compId) && lt.name) {
          const ltName = String(lt.name).trim();
          const quota = Number(lt.defaultYearlyQuota || lt.default_yearly_quota || 12.0);
          const accrual = Number(lt.monthlyAccrualRate || lt.monthly_accrual_rate || 1.0);

          let targetLtId = (!isNaN(Number(lt.id)) && Number(lt.id) > 0) ? Number(lt.id) : null;
          const existingLt = db.prepare('SELECT id FROM leave_types WHERE company_id = ? AND LOWER(name) = LOWER(?)').get(compId, ltName);
          if (existingLt) {
            db.prepare(`
              UPDATE leave_types SET default_yearly_quota = ?, monthly_accrual_rate = ?
              WHERE id = ?
            `).run(quota, accrual, existingLt.id);
            targetLtId = existingLt.id;
          } else {
            let canUseId = (targetLtId && !db.prepare('SELECT id FROM leave_types WHERE id = ?').get(targetLtId));
            if (canUseId) {
              try {
                db.prepare(`
                  INSERT INTO leave_types (id, company_id, name, default_yearly_quota, monthly_accrual_rate)
                  VALUES (?, ?, ?, ?, ?)
                `).run(targetLtId, compId, ltName, quota, accrual);
              } catch (e) {
                const ins = db.prepare(`
                  INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate)
                  VALUES (?, ?, ?, ?)
                `).run(compId, ltName, quota, accrual);
                targetLtId = ins.lastInsertRowid;
              }
            } else {
              const ins = db.prepare(`
                INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate)
                VALUES (?, ?, ?, ?)
              `).run(compId, ltName, quota, accrual);
              targetLtId = ins.lastInsertRowid;
            }
          }
          leaveTypeIdMap.set(String(docKey), targetLtId);
          if (lt.id) leaveTypeIdMap.set(String(lt.id), targetLtId);
          leaveTypeIdMap.set(String(targetLtId), targetLtId);
        }
      }

      // Phase 6: Restore Employees (Linking to Valid Users, Shifts, Weekly Offs, and Geofences)
      for (const [docKey, emp] of employeesMap) {
        let rawEmpId = Number(emp.id);
        let rawCompId = emp.companyId || emp.company_id;
        let compId = null;
        if (rawCompId) {
          const mappedComp = companyIdMap.get(String(rawCompId)) || Number(rawCompId);
          if (mappedComp && !isNaN(mappedComp) && claimedCompanyIds.has(mappedComp)) {
            compId = mappedComp;
          }
        }
        // If employee belongs to an unrecovered company, skip! Zero dummy companies.
        if (!compId || !claimedCompanyIds.has(compId)) continue;

        const rawCode = (emp.employeeCode || emp.employee_id || (!isNaN(rawEmpId) && rawEmpId > 0 ? `EMP${rawEmpId}` : `EMP_${Date.now()}`)).trim();
        const fullName = (emp.fullName || emp.full_name || emp.username || `Employee ${rawCode}`).trim();
        const email = emp.email || '';
        const mobile = emp.mobile || '';
        const department = emp.department || 'General';
        const designation = emp.designation || 'Staff';
        const city = emp.city || '';
        const reportsToAdmin = emp.reportsToAdmin ? 1 : 0;

        let status = (emp.status || 'active').toLowerCase().trim();
        if (status === 'suspended' || status === 'inactive') status = 'disabled';
        if (status === 'block' || status === 'blocked') status = 'banned';
        if (!['active', 'disabled', 'banned', 'deleted'].includes(status)) status = 'active';

        // Shift ID: Only set if actually defined in recovered shifts for this company
        let shiftId = null;
        if (emp.shiftId || emp.shift_id) {
          const rawShift = shiftIdMap.get(String(emp.shiftId || emp.shift_id)) || Number(emp.shiftId || emp.shift_id);
          const s = db.prepare('SELECT id FROM shifts WHERE id = ? AND company_id = ?').get(rawShift, compId);
          if (s) shiftId = s.id;
        }

        // Weekly Off ID: Only set if actually defined in recovered weekly offs for this company
        let weeklyOffId = null;
        if (emp.weeklyOffId || emp.weekly_off_id) {
          const rawWoff = weeklyOffIdMap.get(String(emp.weeklyOffId || emp.weekly_off_id)) || Number(emp.weeklyOffId || emp.weekly_off_id);
          const w = db.prepare('SELECT id FROM weekly_off_settings WHERE id = ? AND company_id = ?').get(rawWoff, compId);
          if (w) weeklyOffId = w.id;
        }

        // Geofence ID: Only set if actually defined in recovered geofences for this company
        let geofenceId = null;
        if (emp.geofenceId || emp.geofence_id) {
          const rawGeo = geofenceIdMap.get(String(emp.geofenceId || emp.geofence_id)) || Number(emp.geofenceId || emp.geofence_id);
          const g = db.prepare('SELECT id FROM geofences WHERE id = ? AND company_id = ?').get(rawGeo, compId);
          if (g) geofenceId = g.id;
        }

        let geoMode = (emp.geofenceMode || emp.geofence_mode || 'company').toLowerCase().trim();
        if (!['company', 'custom', 'none'].includes(geoMode)) geoMode = 'company';

        // Target Employee lookup
        let targetEmpId = (!isNaN(rawEmpId) && rawEmpId > 0 && !claimedEmployeeIds.has(rawEmpId)) ? rawEmpId : null;
        let existingEmp = null;
        if (targetEmpId) {
          existingEmp = db.prepare('SELECT id FROM employees WHERE id = ?').get(targetEmpId);
        }
        if (!existingEmp && rawCode) {
          const byCode = db.prepare('SELECT id FROM employees WHERE company_id = ? AND LOWER(employee_id) = LOWER(?)').get(compId, rawCode);
          if (byCode) {
            existingEmp = byCode;
            targetEmpId = existingEmp.id;
          }
        }

        if (targetEmpId && claimedEmployeeIds.has(targetEmpId)) {
          employeeIdMap.set(String(docKey), targetEmpId);
          if (emp.id) employeeIdMap.set(String(emp.id), targetEmpId);
          continue;
        }

        // Linked User ID: Must be UNIQUE per employee and point to valid users(id)
        let rawUserId = emp.userId || emp.user_id;
        let linkedUserId = null;
        if (rawUserId) {
          const mappedUId = userIdMap.get(String(rawUserId)) || Number(rawUserId);
          if (mappedUId && !isNaN(mappedUId)) {
            const uExists = db.prepare('SELECT id FROM users WHERE id = ?').get(mappedUId);
            if (uExists) linkedUserId = uExists.id;
          }
        }

        if (linkedUserId) {
          const userAlreadyUsed = db.prepare('SELECT id FROM employees WHERE user_id = ? AND (? IS NULL OR id != ?)').get(linkedUserId, targetEmpId, targetEmpId);
          if (userAlreadyUsed) {
            linkedUserId = null;
          }
        }

        if (!linkedUserId && emp.username) {
          const empUsername = String(emp.username).trim();
          const existingUserByName = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(empUsername);
          if (existingUserByName) {
            const used = db.prepare('SELECT id FROM employees WHERE user_id = ? AND (? IS NULL OR id != ?)').get(existingUserByName.id, targetEmpId, targetEmpId);
            if (!used) {
              linkedUserId = existingUserByName.id;
            }
          }
        }

        if (!linkedUserId) {
          const roleName = emp.role || 'employee';
          const roleId = roleMap[roleName] || roleMap['employee'];
          const defPass = roleName === 'manager' ? 'Manager@123' : 'Employee@123';
          const passHash = (emp.password ? bcrypt.hashSync(String(emp.password).trim(), 10) : bcrypt.hashSync(defPass, 10));

          const baseUsername = String(emp.username || emp.employeeCode || emp.employee_id || `emp_${emp.id || Date.now()}`).trim();
          const existingUserByName = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(baseUsername);
          if (existingUserByName) {
            linkedUserId = existingUserByName.id;
          } else {
            const resU = db.prepare(`
              INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            `).run(baseUsername, passHash, email, mobile, roleId, compId, status);
            linkedUserId = resU.lastInsertRowid;
          }
          userIdMap.set(baseUsername.toLowerCase(), linkedUserId);
          if (emp.username && !userIdMap.has(String(emp.username).toLowerCase())) {
            userIdMap.set(String(emp.username).toLowerCase(), linkedUserId);
          }
        }

        // Manager ID (will be fully cross-linked in Phase 7)
        let managerId = null;
        if (emp.managerId || emp.manager_id) {
          const rawMgr = Number(emp.managerId || emp.manager_id);
          if (!isNaN(rawMgr) && rawMgr > 0) {
            const mExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(rawMgr);
            if (mExists && mExists.id !== targetEmpId) managerId = mExists.id;
          }
        }

        // Ensure finalEmpCode is unique within this company
        let finalEmpCode = rawCode;
        let empCodeConflict = db.prepare('SELECT id FROM employees WHERE company_id = ? AND LOWER(employee_id) = LOWER(?) AND (? IS NULL OR id != ?)').get(compId, finalEmpCode, existingEmp?.id, existingEmp?.id);
        let empCodeSuffix = 1;
        while (empCodeConflict) {
          finalEmpCode = `${rawCode}_${empCodeSuffix++}`;
          empCodeConflict = db.prepare('SELECT id FROM employees WHERE company_id = ? AND LOWER(employee_id) = LOWER(?) AND (? IS NULL OR id != ?)').get(compId, finalEmpCode, existingEmp?.id, existingEmp?.id);
        }

        const empStartDate = emp.employment_start_date || emp.employmentStartDate || null;
        const empEndDate = emp.employment_end_date || emp.employmentEndDate || null;

        if (existingEmp) {
          db.prepare(`
            UPDATE employees SET company_id = ?, user_id = ?, employee_id = ?, full_name = ?, mobile = ?, email = ?, department = ?, designation = ?, city = ?, manager_id = ?, shift_id = ?, weekly_off_id = ?, geofence_id = ?, geofence_mode = ?, employment_start_date = COALESCE(?, employment_start_date), employment_end_date = COALESCE(?, employment_end_date), status = ?, is_deleted = 0, reports_to_admin = ?
            WHERE id = ?
          `).run(compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, geofenceId, geoMode, empStartDate, empEndDate, status, reportsToAdmin, existingEmp.id);
          targetEmpId = existingEmp.id;
        } else {
          let canUseEmpId = (!isNaN(targetEmpId) && targetEmpId > 0 && !claimedEmployeeIds.has(targetEmpId));
          if (canUseEmpId) {
            const occupied = db.prepare('SELECT id FROM employees WHERE id = ?').get(targetEmpId);
            if (occupied) canUseEmpId = false;
          }

          if (canUseEmpId) {
            try {
              db.prepare(`
                INSERT INTO employees (id, company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, geofence_id, geofence_mode, employment_start_date, employment_end_date, status, is_deleted, reports_to_admin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
              `).run(targetEmpId, compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, geofenceId, geoMode, empStartDate, empEndDate, status, reportsToAdmin);
            } catch (err) {
              const insE = db.prepare(`
                INSERT INTO employees (company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, geofence_id, geofence_mode, employment_start_date, employment_end_date, status, is_deleted, reports_to_admin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
              `).run(compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, geofenceId, geoMode, empStartDate, empEndDate, status, reportsToAdmin);
              targetEmpId = insE.lastInsertRowid;
            }
          } else {
            const insE = db.prepare(`
              INSERT INTO employees (company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, geofence_id, geofence_mode, employment_start_date, employment_end_date, status, is_deleted, reports_to_admin)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, geofenceId, geoMode, empStartDate, empEndDate, status, reportsToAdmin);
            targetEmpId = insE.lastInsertRowid;
          }
        }

        claimedEmployeeIds.add(targetEmpId);
        employeeIdMap.set(String(docKey), targetEmpId);
        if (emp.id) employeeIdMap.set(String(emp.id), targetEmpId);
        employeeIdMap.set(String(targetEmpId), targetEmpId);

        restoredEmployees++;
      }

      // Phase 7: Restore Employee Mappings & Cross-linking
      for (const [_, m] of mappingsMap) {
        let rawCompId = m.companyId || m.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (!compId || !claimedCompanyIds.has(compId)) continue;
        let mgrId = m.managerId || m.manager_id || m.supervisorId || m.supervisor_id;
        if (mgrId) mgrId = employeeIdMap.get(String(mgrId)) || Number(mgrId);
        let empId = m.employeeId || m.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);
        const mapType = m.mappingType || m.mapping_type || 'manager';

        if (mgrId && empId && mgrId !== empId && claimedEmployeeIds.has(mgrId) && claimedEmployeeIds.has(empId)) {
          const mgrExists = db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(mgrId, compId);
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(empId, compId);
          if (mgrExists && empExists) {
            const existingMap = db.prepare('SELECT id FROM employee_mappings WHERE manager_id = ? AND employee_id = ? AND mapping_type = ?').get(mgrId, empId, mapType);
            if (!existingMap) {
              db.prepare(`
                INSERT INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
                VALUES (?, ?, ?, ?, NULL)
              `).run(compId, mgrId, empId, mapType);
            }
            db.prepare('UPDATE employees SET manager_id = ? WHERE id = ?').run(mgrId, empId);
          }
        }
      }

      // Cross-link employee managerId & hrId from employee documents now that all employees exist
      for (const [_, emp] of employeesMap) {
        let empId = emp.id ? (employeeIdMap.get(String(emp.id)) || Number(emp.id)) : null;
        if (empId && claimedEmployeeIds.has(empId)) {
          if (emp.managerId || emp.manager_id) {
            const rawM = emp.managerId || emp.manager_id;
            const mappedM = employeeIdMap.get(String(rawM)) || Number(rawM);
            if (mappedM && mappedM !== empId && claimedEmployeeIds.has(mappedM)) {
              db.prepare('UPDATE employees SET manager_id = ? WHERE id = ?').run(mappedM, empId);
            }
          }
          if (emp.hrId || emp.hr_id) {
            const rawH = emp.hrId || emp.hr_id;
            const mappedH = employeeIdMap.get(String(rawH)) || Number(rawH);
            if (mappedH && mappedH !== empId && claimedEmployeeIds.has(mappedH)) {
              db.prepare('UPDATE employees SET hr_id = ? WHERE id = ?').run(mappedH, empId);
            }
          }
        }
      }

      // Phase 8: Restore Leave Balances & Leave Requests
      const currentYear = new Date().getFullYear();
      for (const [_, lb] of leaveBalancesMap) {
        let rawCompId = lb.companyId || lb.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (!compId || !claimedCompanyIds.has(compId)) continue;
        let empId = lb.employeeId || lb.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);
        let ltId = lb.leaveTypeId || lb.leave_type_id;
        if (ltId) ltId = leaveTypeIdMap.get(String(ltId)) || Number(ltId);

        if (empId && ltId && claimedEmployeeIds.has(empId)) {
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(empId, compId);
          const ltExists = db.prepare('SELECT id FROM leave_types WHERE id = ? AND company_id = ?').get(ltId, compId);
          if (empExists && ltExists) {
            const yr = Number(lb.year || currentYear);
            const opening = Number(lb.opening_balance || lb.openingBalance || lb.allocated || 0);
            const accrued = Number(lb.accrued || 0);
            const used = Number(lb.used || 0);
            const bal = Number(lb.balance !== undefined ? lb.balance : (opening + accrued - used));

            const existingBal = db.prepare('SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?').get(empId, ltId, yr);
            if (existingBal) {
              db.prepare(`
                UPDATE leave_balances SET opening_balance = ?, accrued = ?, used = ?, balance = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(opening, accrued, used, bal, existingBal.id);
            } else {
              db.prepare(`
                INSERT INTO leave_balances (employee_id, leave_type_id, year, opening_balance, accrued, used, balance)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(empId, ltId, yr, opening, accrued, used, bal);
            }
          }
        }
      }

      for (const [_, lr] of leaveRequestsMap) {
        let rawCompId = lr.companyId || lr.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (!compId || !claimedCompanyIds.has(compId)) continue;
        let empId = lr.employeeId || lr.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);
        let ltId = lr.leaveTypeId || lr.leave_type_id;
        if (ltId) ltId = leaveTypeIdMap.get(String(ltId)) || Number(ltId);

        if (empId && ltId && (lr.startDate || lr.start_date) && claimedEmployeeIds.has(empId)) {
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(empId, compId);
          const ltExists = db.prepare('SELECT id FROM leave_types WHERE id = ? AND company_id = ?').get(ltId, compId);
          if (empExists && ltExists) {
            const sDate = lr.startDate || lr.start_date;
            const eDate = lr.endDate || lr.end_date || sDate;
            let lrStatus = lr.status || 'pending';
            if (!['pending', 'approved', 'rejected', 'cancelled'].includes(lrStatus)) lrStatus = 'pending';
            db.prepare(`
              INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(compId, empId, ltId, sDate, eDate, lr.totalDays || lr.total_days || 1.0, lr.reason || 'Leave application', lrStatus);
          }
        }
      }

      // Phase 9: Restore Attendance Corrections & Attendance Records
      for (const [_, cr] of correctionsMap) {
        let rawCompId = cr.companyId || cr.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (!compId || !claimedCompanyIds.has(compId)) continue;
        let empId = cr.employeeId || cr.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);

        if (empId && cr.date && claimedEmployeeIds.has(empId)) {
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(empId, compId);
          if (empExists) {
            let crStatus = cr.status || 'pending';
            if (!['pending', 'approved', 'rejected', 'cancelled'].includes(crStatus)) crStatus = 'pending';
            db.prepare(`
              INSERT INTO attendance_correction_requests (company_id, employee_id, date, correction_type, requested_punch_in, requested_punch_out, requested_status, reason, status, review_notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(compId, empId, cr.date, cr.correctionType || cr.correction_type || 'both', cr.requestedPunchIn || cr.requested_punch_in || null, cr.requestedPunchOut || cr.requested_punch_out || null, cr.requestedStatus || cr.requested_status || 'Present', cr.reason || 'Attendance punch correction', crStatus, cr.reviewNotes || cr.review_notes || cr.reviewerNotes || cr.reviewer_notes || null);
          }
        }
      }

      for (const [_, att] of attendanceMap) {
        let rawCompId = att.companyId || att.company_id;
        let rawEmpId = att.employeeId || att.employee_id;
        let date = att.date;

        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        let empId = rawEmpId ? (employeeIdMap.get(String(rawEmpId)) || Number(rawEmpId)) : null;

        if (compId && empId && date && claimedCompanyIds.has(compId) && claimedEmployeeIds.has(empId)) {
          const compExists = db.prepare('SELECT id FROM companies WHERE id = ?').get(compId);
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ? AND company_id = ?').get(empId, compId);

          if (compExists && empExists) {
            let attStatus = att.status || 'Present';
            const allowedStatuses = ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekly Off', 'Missing Punch In', 'Missing Punch Out'];
            if (!allowedStatuses.includes(attStatus)) {
              if (attStatus.toLowerCase().includes('half')) attStatus = 'Half Day';
              else if (attStatus.toLowerCase().includes('leave')) attStatus = 'Leave';
              else if (attStatus.toLowerCase().includes('absent')) attStatus = 'Absent';
              else attStatus = 'Present';
            }

            const pIn = att.punchInTime || att.punch_in_time || null;
            const pOut = att.punchOutTime || att.punch_out_time || null;
            const tHours = Number(att.totalHours || att.total_hours || 8.0);
            const existingAtt = db.prepare('SELECT id FROM attendance_records WHERE company_id = ? AND employee_id = ? AND date = ?').get(compId, empId, date);

            if (existingAtt) {
              db.prepare(`
                UPDATE attendance_records SET
                  punch_in_time = COALESCE(?, punch_in_time),
                  punch_out_time = COALESCE(?, punch_out_time),
                  status = COALESCE(?, status),
                  total_hours = COALESCE(?, total_hours),
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(pIn, pOut, attStatus, tHours, existingAtt.id);
            } else {
              db.prepare(`
                INSERT INTO attendance_records (company_id, employee_id, date, punch_in_time, punch_out_time, status, total_hours)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(compId, empId, date, pIn, pOut, attStatus, tHours);
            }
            restoredAttendances++;
          }
        }
      }

      // Phase 10: Restore Support Tickets
      for (const [_, st] of ticketsMap) {
        let rawCompId = st.companyId || st.company_id;
        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        if (compId && !claimedCompanyIds.has(compId)) {
          compId = null;
        }

        let uId = st.userId || st.user_id || st.createdByUserId || st.created_by_user_id;
        if (uId) uId = userIdMap.get(String(uId)) || Number(uId);

        const subject = (st.subject || st.title || '').trim();
        if (subject) {
          const tktNum = (st.ticketNumber || st.ticket_number || `TKT-${Math.floor(100000 + Math.random() * 900000)}`).trim();
          let tktStatus = (st.status || 'open').toLowerCase().trim();
          if (!['open', 'in_progress', 'resolved', 'closed'].includes(tktStatus)) tktStatus = 'open';
          const priority = (st.priority || 'medium').toLowerCase().trim();
          const validPriority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
          const category = st.category || 'General';
          const description = st.description || subject;

          let authorId = uId;
          if (!authorId || !db.prepare('SELECT id FROM users WHERE id = ?').get(authorId)) {
            authorId = db.prepare("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'super_admin') OR username = 'adminn' LIMIT 1").get()?.id || 1;
          }

          const existingTkt = db.prepare('SELECT id FROM support_tickets WHERE ticket_number = ?').get(tktNum);
          if (existingTkt) {
            db.prepare(`
              UPDATE support_tickets SET status = ?, priority = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(tktStatus, validPriority, category, description, existingTkt.id);
          } else {
            db.prepare(`
              INSERT INTO support_tickets (ticket_number, company_id, created_by_user_id, category, subject, description, priority, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(tktNum, compId || null, authorId, category, subject, description, validPriority, tktStatus);
          }
        }
      }
    });

    db.pragma('foreign_keys = OFF');
    let restoreError = null;
    try {
      restoreTransaction();
    } catch (err) {
      restoreError = err;
    } finally {
      db.pragma('foreign_keys = ON');
    }
    if (restoreError) throw restoreError;

    // Run database sanitation to guarantee clean relational integrity (safeguards Super Admin and Support)
    try {
      const { sanitizeDatabase } = require('./sanitize');
      sanitizeDatabase();
    } catch (e) {
      console.warn('Post-restore database sanitation notice:', e.message);
    }

    return {
      success: true,
      restoredCompanies,
      restoredUsers,
      restoredEmployees,
      restoredAttendances,
      message: `Successfully recovered all data from Firebase: ${restoredCompanies} companies, ${restoredEmployees} employees, ${restoredUsers} user accounts, and ${restoredAttendances} attendance records. All data is restored to the website and accounts can immediately log in!`
    };
  } catch (err) {
    console.error('fetchAllFromFirebaseAndRestoreToDb error:', err);
    return {
      success: false,
      error: `Failed to fetch and restore data from Firebase: ${err.message}`
    };
  }
}

module.exports = {
  initFirebase,
  getFirebaseStatus: () => firebaseStatus,
  syncGpsLocation,
  syncTicketMessage,
  syncAttendancePunch,
  syncAttendanceCorrection,
  syncEmployeeMapping,
  deleteEmployeeMapping,
  syncLeaveType,
  syncLeaveBalance,
  syncLeaveRequest,
  syncHoliday,
  syncWeeklyOff,
  syncShift,
  syncGeofence,
  syncCompanySettings,
  syncCompanyModules,
  syncSupportTicket,
  syncAuditLog,
  syncCompany,
  syncEmployee,
  syncUser,
  deleteFromFirebase,
  syncCompanyReports,
  syncAllDatabaseToFirebase,
  fetchAllFromFirebaseAndRestoreToDb,
  resetFirebaseConfig,
  wipeAllCompanyDataFromDb,
  testFirebaseConnection,
  saveFirebaseConfig: async ({ projectId, serviceAccountJson, databaseUrl }) => {
    if (projectId !== undefined) {
      setAppSetting('firebase_project_id', (projectId || '').trim(), 'Firebase Project ID');
    }
    if (serviceAccountJson) {
      setAppSetting('firebase_service_account_json', typeof serviceAccountJson === 'string' ? serviceAccountJson : JSON.stringify(serviceAccountJson), 'Firebase Service Account JSON Credentials');
    }
    if (databaseUrl !== undefined) {
      setAppSetting('firebase_database_url', (databaseUrl || '').trim(), 'Firebase Realtime Database URL');
    }
    const ok = initFirebase();
    if (ok) {
      try {
        const compCount = db.prepare('SELECT COUNT(*) as count FROM companies WHERE is_deleted = 0').get()?.count || 0;
        if (compCount === 0) {
          console.log('[FirebaseConfig] 0 companies found locally. Auto-restoring from Firebase...');
          await fetchAllFromFirebaseAndRestoreToDb();
        }
      } catch (e) {
        console.warn('Auto restore on config notice:', e.message);
      }
    }
    return ok;
  }
};
