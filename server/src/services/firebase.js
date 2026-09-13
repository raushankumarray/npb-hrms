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
    db.prepare(`
      INSERT INTO application_settings (setting_key, setting_value, description, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, val, desc);
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
        const adminRow = db.prepare("SELECT username, email FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin') LIMIT 1").get(company.id);
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
      email: company.email || adminEmail || '',
      phone: company.phone || '',
      address: company.address || '',
      status: company.status || 'active',
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

async function deleteEmployeeMapping(mappingId, companyId, managerId, employeeId) {
  if (!firebaseStatus.connected) return null;
  try {
    const key = `${companyId}_${managerId}_${employeeId}`;
    if (firestoreDb) {
      await firestoreDb.collection('employee_mappings').doc(key).delete().catch(() => {});
      if (mappingId) await firestoreDb.collection('employee_mappings').doc(String(mappingId)).delete().catch(() => {});
    }
    if (realtimeDb) {
      await realtimeDb.ref(`employee_mappings/${companyId}/${managerId}_${employeeId}`).remove().catch(() => {});
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
      }
      if (realtimeDb) {
        await realtimeDb.ref(`companies/${strId}`).remove().catch(() => {});
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

    runWipe();

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
        db.prepare('INSERT INTO super_admins (user_id, full_name) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING').run(resU.lastInsertRowid, 'Global Super Administrator');
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
    }

    // 3. Upsert into SQLite in transaction
    let restoredCompanies = 0;
    let restoredUsers = 0;
    let restoredEmployees = 0;
    let restoredAttendances = 0;

    const companyIdMap = new Map();
    const userIdMap = new Map();
    const employeeIdMap = new Map();
    const claimedCompanyIds = new Set();
    const claimedEmployeeIds = new Set();

    const restoreTransaction = db.transaction(() => {
      // A. Restore Companies
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

        if (targetCompId && !claimedCompanyIds.has(targetCompId)) {
          existing = db.prepare('SELECT id, code FROM companies WHERE id = ?').get(targetCompId);
        }
        if (!existing && rawCode) {
          const byCode = db.prepare('SELECT id, code FROM companies WHERE LOWER(code) = LOWER(?)').get(rawCode);
          if (byCode && !claimedCompanyIds.has(byCode.id)) {
            existing = byCode;
            targetCompId = existing.id;
          }
        }

        // Guarantee unique code
        let finalCode = rawCode;
        let codeConflict = db.prepare('SELECT id FROM companies WHERE LOWER(code) = LOWER(?) AND (? IS NULL OR id != ?)').get(finalCode, existing?.id, existing?.id);
        let codeSuffix = 1;
        while (codeConflict) {
          finalCode = `${rawCode}_${codeSuffix++}`;
          codeConflict = db.prepare('SELECT id FROM companies WHERE LOWER(code) = LOWER(?) AND (? IS NULL OR id != ?)').get(finalCode, existing?.id, existing?.id);
        }

        if (existing) {
          db.prepare(`
            UPDATE companies SET name = ?, portal_name = ?, code = ?, email = ?, phone = ?, address = ?, logo = ?, status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(name, portalName, finalCode, email, phone, address, logo, status, existing.id);
          targetCompId = existing.id;
        } else {
          let canUseCompId = (!isNaN(targetCompId) && targetCompId > 0 && !claimedCompanyIds.has(targetCompId));
          if (canUseCompId) {
            const occupied = db.prepare('SELECT id FROM companies WHERE id = ?').get(targetCompId);
            if (occupied) canUseCompId = false;
          }

          if (canUseCompId) {
            try {
              db.prepare(`
                INSERT INTO companies (id, name, portal_name, code, email, phone, address, logo, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(targetCompId, name, portalName, finalCode, email, phone, address, logo, status);
            } catch (err) {
              const insRes = db.prepare(`
                INSERT INTO companies (name, portal_name, code, email, phone, address, logo, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(name, portalName, finalCode, email, phone, address, logo, status);
              targetCompId = insRes.lastInsertRowid;
            }
          } else {
            const insRes = db.prepare(`
              INSERT INTO companies (name, portal_name, code, email, phone, address, logo, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(name, portalName, finalCode, email, phone, address, logo, status);
            targetCompId = insRes.lastInsertRowid;
          }
        }

        claimedCompanyIds.add(targetCompId);
        companyIdMap.set(String(docKey), targetCompId);
        if (c.id) companyIdMap.set(String(c.id), targetCompId);
        companyIdMap.set(String(targetCompId), targetCompId);

        // Settings & Modules
        db.prepare(`
          INSERT INTO company_settings (company_id, timezone, working_hours_per_day, half_day_min_hours, full_day_min_hours, show_branding_mode)
          VALUES (?, 'Asia/Kolkata', 8.0, 4.0, 8.0, 'both')
          ON CONFLICT(company_id) DO NOTHING
        `).run(targetCompId);

        const modules = ['geofencing', 'live_tracking', 'leave_management', 'payroll', 'support_tickets', 'dynamic_forms'];
        for (const m of modules) {
          db.prepare(`
            INSERT INTO company_modules (company_id, module_name, is_enabled)
            VALUES (?, ?, 1)
            ON CONFLICT(company_id, module_name) DO NOTHING
          `).run(targetCompId, m);
        }

        // Ensure default Shift
        const existingShift = db.prepare('SELECT id FROM shifts WHERE company_id = ?').get(targetCompId);
        if (!existingShift) {
          db.prepare(`
            INSERT INTO shifts (company_id, name, start_time, end_time, working_hours, grace_time_mins, break_time_mins, status)
            VALUES (?, 'Standard Shift', '09:00', '18:00', 8.0, 15, 60, 'active')
          `).run(targetCompId);
        }

        // Ensure default Weekly Off Setting
        const existingWeeklyOff = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ?').get(targetCompId);
        if (!existingWeeklyOff) {
          db.prepare(`
            INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
            VALUES (?, 'Standard Weekly Off', '["Sunday"]', 1)
          `).run(targetCompId);
        }

        // Ensure company admin account is active / created if provided in company metadata
        if (c.adminUsername || c.admin_username) {
          const aUname = String(c.adminUsername || c.admin_username).trim();
          const aPass = c.adminPassword || c.admin_password || 'Admin@123';
          const aEmail = c.adminEmail || c.admin_email || email;
          const aHash = bcrypt.hashSync(String(aPass).trim(), 10);
          
          const existingAdmin = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(aUname);
          if (existingAdmin) {
            db.prepare('UPDATE users SET company_id = ?, password_hash = ?, status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(targetCompId, aHash, status, existingAdmin.id);
            userIdMap.set(aUname.toLowerCase(), existingAdmin.id);
          } else {
            let safeAdminUsername = aUname;
            let suffix = 1;
            while (db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(safeAdminUsername)) {
              safeAdminUsername = `${aUname}_${suffix++}`;
            }
            const insAdmin = db.prepare(`
              INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            `).run(safeAdminUsername, aHash, aEmail, phone, roleMap['company_admin'], targetCompId, status);
            userIdMap.set(safeAdminUsername.toLowerCase(), insAdmin.lastInsertRowid);
            userIdMap.set(aUname.toLowerCase(), insAdmin.lastInsertRowid);
          }
        }

        restoredCompanies++;
      }

      // First valid company fallback ID if needed
      const firstValidCompanyId = db.prepare('SELECT id FROM companies WHERE is_deleted = 0 ORDER BY id ASC LIMIT 1').get()?.id || null;

      // B. Restore Users
      for (const [docKey, u] of usersMap) {
        let rawUserId = Number(u.id);
        let baseUsername = (u.username || u.name || '').trim();
        if (!baseUsername) {
          baseUsername = (u.email ? u.email.split('@')[0] : (u.mobile ? `user_${u.mobile}` : `user_${docKey}`)).trim();
        }
        const username = baseUsername;
        const email = u.email || '';
        const mobile = u.mobile || '';
        const roleName = (u.role || u.role_name || 'employee').toLowerCase().trim();
        const roleId = roleMap[roleName] || roleMap['employee'];

        let rawCompId = u.companyId || u.company_id;
        let compId = null;
        if (rawCompId) {
          const mappedCompId = companyIdMap.get(String(rawCompId)) || Number(rawCompId);
          if (mappedCompId && !isNaN(mappedCompId)) {
            const compExists = db.prepare('SELECT id FROM companies WHERE id = ?').get(mappedCompId);
            if (compExists) compId = compExists.id;
          }
        }
        if (!compId && (roleName === 'company_admin' || roleName === 'manager' || roleName === 'employee')) {
          compId = firstValidCompanyId;
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
          const existingUser = db.prepare('SELECT password_hash FROM users WHERE LOWER(username) = LOWER(?)').get(username);
          if (existingUser && existingUser.password_hash) {
            finalHash = existingUser.password_hash;
          } else {
            const defaultPass = roleName === 'super_admin' ? 'Admin@88' : (roleName === 'support' ? 'Support@123' : (roleName === 'company_admin' ? 'Admin@123' : (roleName === 'manager' ? 'Manager@123' : 'Employee@123')));
            finalHash = bcrypt.hashSync(defaultPass, 10);
          }
        }

        // Check if user with this username ALREADY exists in database
        const existingByName = db.prepare('SELECT id, username, role_id FROM users WHERE LOWER(username) = LOWER(?)').get(username);
        let targetUserId = null;

        if (existingByName) {
          // Update the existing user WITHOUT changing their unique username (guarantees ZERO UNIQUE constraint collision)
          db.prepare(`
            UPDATE users SET password_hash = ?, email = COALESCE(NULLIF(?, ''), email), mobile = COALESCE(NULLIF(?, ''), mobile),
                             role_id = COALESCE(?, role_id), company_id = COALESCE(?, company_id), status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(finalHash, email, mobile, roleId, compId, status, existingByName.id);
          targetUserId = existingByName.id;
        } else {
          // Check if rawUserId is positive integer and NOT already taken by another user
          let canUseId = (!isNaN(rawUserId) && rawUserId > 0);
          if (canUseId) {
            const idOccupied = db.prepare('SELECT id FROM users WHERE id = ?').get(rawUserId);
            if (idOccupied) canUseId = false;
          }

          if (canUseId) {
            try {
              db.prepare(`
                INSERT INTO users (id, username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(rawUserId, username, finalHash, email, mobile, roleId, compId, status);
              targetUserId = rawUserId;
            } catch (err) {
              const uRes = db.prepare(`
                INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).run(username, finalHash, email, mobile, roleId, compId, status);
              targetUserId = uRes.lastInsertRowid;
            }
          } else {
            const uRes = db.prepare(`
              INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(username, finalHash, email, mobile, roleId, compId, status);
            targetUserId = uRes.lastInsertRowid;
          }
        }

        userIdMap.set(String(docKey), targetUserId);
        if (u.id) userIdMap.set(String(u.id), targetUserId);
        userIdMap.set(username.toLowerCase(), targetUserId);
        userIdMap.set(String(targetUserId), targetUserId);

        if (roleName === 'super_admin') {
          db.prepare(`
            INSERT INTO super_admins (user_id, full_name)
            VALUES (?, 'Global Super Administrator')
            ON CONFLICT(user_id) DO NOTHING
          `).run(targetUserId);
        } else if (roleName === 'support') {
          db.prepare(`
            INSERT INTO support_users (user_id, full_name, permission_level)
            VALUES (?, 'Technical Support Specialist', 4)
            ON CONFLICT(user_id) DO UPDATE SET permission_level = 4
          `).run(targetUserId);
        }

        restoredUsers++;
      }

      // C. Restore Employees
      for (const [docKey, emp] of employeesMap) {
        let rawEmpId = Number(emp.id);
        let rawCompId = emp.companyId || emp.company_id;
        let compId = null;
        if (rawCompId) {
          const mappedComp = companyIdMap.get(String(rawCompId)) || Number(rawCompId);
          if (mappedComp && !isNaN(mappedComp)) {
            const exists = db.prepare('SELECT id FROM companies WHERE id = ?').get(mappedComp);
            if (exists) compId = exists.id;
          }
        }
        if (!compId) compId = firstValidCompanyId;

        if (!compId) {
          const defaultCompRes = db.prepare(`
            INSERT INTO companies (name, portal_name, code, status, is_deleted)
            VALUES ('Default Restored Company', 'Default Restored Company', 'RESTORED_CO', 'active', 0)
          `).run();
          compId = defaultCompRes.lastInsertRowid;
        }

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

        // Validate or resolve shift_id
        let shiftId = null;
        if (emp.shiftId || emp.shift_id) {
          const s = db.prepare('SELECT id FROM shifts WHERE id = ? AND company_id = ?').get(Number(emp.shiftId || emp.shift_id), compId);
          if (s) shiftId = s.id;
        }
        if (!shiftId) {
          const defShift = db.prepare('SELECT id FROM shifts WHERE company_id = ? LIMIT 1').get(compId);
          if (defShift) shiftId = defShift.id;
        }

        // Validate weekly_off_id
        let weeklyOffId = null;
        if (emp.weeklyOffId || emp.weekly_off_id) {
          const w = db.prepare('SELECT id FROM weekly_off_settings WHERE id = ? AND company_id = ?').get(Number(emp.weeklyOffId || emp.weekly_off_id), compId);
          if (w) weeklyOffId = w.id;
        }
        if (!weeklyOffId) {
          const defWoff = db.prepare('SELECT id FROM weekly_off_settings WHERE company_id = ? LIMIT 1').get(compId);
          if (defWoff) weeklyOffId = defWoff.id;
        }

        // Target Employee lookup
        let targetEmpId = (!isNaN(rawEmpId) && rawEmpId > 0 && !claimedEmployeeIds.has(rawEmpId)) ? rawEmpId : null;
        let existingEmp = null;
        if (targetEmpId) {
          existingEmp = db.prepare('SELECT id FROM employees WHERE id = ?').get(targetEmpId);
        }
        if (!existingEmp && rawCode) {
          const byCode = db.prepare('SELECT id FROM employees WHERE company_id = ? AND LOWER(employee_id) = LOWER(?)').get(compId, rawCode);
          if (byCode && !claimedEmployeeIds.has(byCode.id)) {
            existingEmp = byCode;
            targetEmpId = existingEmp.id;
          }
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

          const baseUsername = (emp.username || `${rawCode.toLowerCase()}_${Math.floor(Math.random() * 1000)}`).trim();
          let safeUsername = baseUsername;
          let suffix = 1;
          while (db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(safeUsername)) {
            safeUsername = `${baseUsername}_${suffix++}`;
          }

          const resU = db.prepare(`
            INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
          `).run(safeUsername, passHash, email, mobile, roleId, compId, status);
          linkedUserId = resU.lastInsertRowid;
          userIdMap.set(safeUsername.toLowerCase(), linkedUserId);
          if (emp.username && !userIdMap.has(String(emp.username).toLowerCase())) {
            userIdMap.set(String(emp.username).toLowerCase(), linkedUserId);
          }
        }

        // Determine manager_id safely (ensure target exists or set NULL)
        let managerId = null;
        if (emp.managerId || emp.manager_id) {
          const rawMgr = Number(emp.managerId || emp.manager_id);
          if (!isNaN(rawMgr) && rawMgr > 0) {
            const mExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(rawMgr);
            if (mExists) managerId = mExists.id;
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

        if (existingEmp) {
          db.prepare(`
            UPDATE employees SET company_id = ?, user_id = ?, employee_id = ?, full_name = ?, mobile = ?, email = ?, department = ?, designation = ?, city = ?, manager_id = ?, shift_id = ?, weekly_off_id = ?, status = ?, is_deleted = 0, reports_to_admin = ?
            WHERE id = ?
          `).run(compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin, existingEmp.id);
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
                INSERT INTO employees (id, company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, status, is_deleted, reports_to_admin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
              `).run(targetEmpId, compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin);
            } catch (err) {
              const insE = db.prepare(`
                INSERT INTO employees (company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, status, is_deleted, reports_to_admin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
              `).run(compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin);
              targetEmpId = insE.lastInsertRowid;
            }
          } else {
            const insE = db.prepare(`
              INSERT INTO employees (company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, status, is_deleted, reports_to_admin)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(compId, linkedUserId, finalEmpCode, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin);
            targetEmpId = insE.lastInsertRowid;
          }
        }

        claimedEmployeeIds.add(targetEmpId);
        employeeIdMap.set(String(docKey), targetEmpId);
        if (emp.id) employeeIdMap.set(String(emp.id), targetEmpId);
        employeeIdMap.set(String(targetEmpId), targetEmpId);

        restoredEmployees++;
      }

      // D. Restore Shifts, Weekly Offs, Holidays, Geofences
      for (const [_, s] of shiftsMap) {
        let compId = s.companyId || s.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        if (compId && s.name) {
          db.prepare(`
            INSERT INTO shifts (company_id, name, start_time, end_time, working_hours, grace_time_mins, break_time_mins, is_rotational, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, name) DO UPDATE SET
              start_time = excluded.start_time,
              end_time = excluded.end_time,
              working_hours = excluded.working_hours,
              grace_time_mins = excluded.grace_time_mins,
              break_time_mins = excluded.break_time_mins,
              status = excluded.status
          `).run(compId, s.name, s.startTime || s.start_time || '09:00', s.endTime || s.end_time || '18:00', s.workingHours || s.working_hours || 8.0, s.graceTimeMins || s.grace_time_mins || 15, s.breakTimeMins || s.break_time_mins || 60, s.isRotational ? 1 : 0, s.status || 'active');
        }
      }

      for (const [_, w] of weeklyOffsMap) {
        let compId = w.companyId || w.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        if (compId && w.name) {
          db.prepare(`
            INSERT INTO weekly_off_settings (company_id, name, off_days_json, is_default)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(company_id, name) DO UPDATE SET
              off_days_json = excluded.off_days_json,
              is_default = excluded.is_default
          `).run(compId, w.name, w.offDaysJson || w.off_days_json || '["Sunday"]', w.isDefault ? 1 : 0);
        }
      }

      for (const [_, h] of holidaysMap) {
        let compId = h.companyId || h.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        const hDate = h.holidayDate || h.holiday_date;
        if (compId && h.name && hDate) {
          db.prepare(`
            INSERT INTO holidays (company_id, name, holiday_date, is_optional, applies_to)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(company_id, holiday_date) DO UPDATE SET
              name = excluded.name,
              is_optional = excluded.is_optional,
              applies_to = excluded.applies_to
          `).run(compId, h.name, hDate, h.isOptional ? 1 : 0, h.appliesTo || h.applies_to || 'all');
        }
      }

      for (const [_, g] of geofencesMap) {
        let compId = g.companyId || g.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        const locName = g.locationName || g.location_name || g.name;
        if (compId && locName && g.latitude !== undefined && g.longitude !== undefined) {
          db.prepare(`
            INSERT INTO geofences (company_id, location_name, latitude, longitude, radius, address, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, location_name) DO UPDATE SET
              latitude = excluded.latitude,
              longitude = excluded.longitude,
              radius = excluded.radius,
              address = excluded.address,
              status = excluded.status
          `).run(compId, locName, parseFloat(g.latitude), parseFloat(g.longitude), parseFloat(g.radius || 100), g.address || '', g.status || 'active');
        }
      }

      // E. Restore Employee Mappings
      for (const [_, m] of mappingsMap) {
        let compId = m.companyId || m.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        let mgrId = m.managerId || m.manager_id || m.supervisorId || m.supervisor_id;
        if (mgrId) mgrId = employeeIdMap.get(String(mgrId)) || Number(mgrId);
        let empId = m.employeeId || m.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);

        if (compId && mgrId && empId && mgrId !== empId) {
          const mgrExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(mgrId);
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(empId);
          if (mgrExists && empExists) {
            db.prepare(`
              INSERT INTO employee_mappings (company_id, manager_id, employee_id, mapping_type, assigned_by)
              VALUES (?, ?, ?, ?, NULL)
              ON CONFLICT(company_id, manager_id, employee_id) DO NOTHING
            `).run(compId, mgrId, empId, m.mappingType || m.mapping_type || 'manager');
            db.prepare('UPDATE employees SET manager_id = ? WHERE id = ?').run(mgrId, empId);
          }
        }
      }

      // F. Restore Leave Types, Balances, and Requests
      for (const [_, lt] of leaveTypesMap) {
        let compId = lt.companyId || lt.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        if (compId && lt.name) {
          db.prepare(`
            INSERT INTO leave_types (company_id, name, default_yearly_quota, monthly_accrual_rate)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(company_id, name) DO UPDATE SET
              default_yearly_quota = excluded.default_yearly_quota,
              monthly_accrual_rate = excluded.monthly_accrual_rate
          `).run(compId, lt.name, lt.defaultYearlyQuota || lt.default_yearly_quota || 12.0, lt.monthlyAccrualRate || lt.monthly_accrual_rate || 1.0);
        }
      }

      for (const [_, lb] of leaveBalancesMap) {
        let compId = lb.companyId || lb.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        let empId = lb.employeeId || lb.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);
        let ltId = lb.leaveTypeId || lb.leave_type_id;

        if (compId && empId && ltId) {
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(empId);
          const ltExists = db.prepare('SELECT id FROM leave_types WHERE id = ?').get(ltId);
          if (empExists && ltExists) {
            db.prepare(`
              INSERT INTO leave_balances (company_id, employee_id, leave_type_id, allocated, used, balance)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(employee_id, leave_type_id) DO UPDATE SET
                allocated = excluded.allocated,
                used = excluded.used,
                balance = excluded.balance
            `).run(compId, empId, ltId, lb.allocated || 0, lb.used || 0, lb.balance || 0);
          }
        }
      }

      for (const [_, lr] of leaveRequestsMap) {
        let compId = lr.companyId || lr.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        let empId = lr.employeeId || lr.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);
        let ltId = lr.leaveTypeId || lr.leave_type_id;

        if (compId && empId && (lr.startDate || lr.start_date)) {
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(empId);
          if (empExists) {
            let finalLtId = ltId;
            const ltExists = finalLtId ? db.prepare('SELECT id FROM leave_types WHERE id = ?').get(finalLtId) : null;
            if (!ltExists) {
              const defLt = db.prepare('SELECT id FROM leave_types WHERE company_id = ? LIMIT 1').get(compId);
              if (defLt) finalLtId = defLt.id;
            }
            if (finalLtId) {
              const sDate = lr.startDate || lr.start_date;
              const eDate = lr.endDate || lr.end_date || sDate;
              let lrStatus = lr.status || 'pending';
              if (!['pending', 'approved', 'rejected', 'cancelled'].includes(lrStatus)) lrStatus = 'pending';
              db.prepare(`
                INSERT INTO leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, total_days, reason, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(compId, empId, finalLtId, sDate, eDate, lr.totalDays || lr.total_days || 1.0, lr.reason || 'Leave application', lrStatus);
            }
          }
        }
      }

      // G. Restore Attendance Corrections
      for (const [_, cr] of correctionsMap) {
        let compId = cr.companyId || cr.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        if (!compId) compId = firstValidCompanyId;
        let empId = cr.employeeId || cr.employee_id;
        if (empId) empId = employeeIdMap.get(String(empId)) || Number(empId);

        if (compId && empId && cr.date) {
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(empId);
          if (empExists) {
            let crStatus = cr.status || 'pending';
            if (!['pending', 'approved', 'rejected', 'cancelled'].includes(crStatus)) crStatus = 'pending';
            db.prepare(`
              INSERT INTO attendance_correction_requests (company_id, employee_id, date, correction_type, requested_punch_in, requested_punch_out, requested_status, reason, status, reviewer_notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(compId, empId, cr.date, cr.correctionType || cr.correction_type || 'both', cr.requestedPunchIn || cr.requested_punch_in || null, cr.requestedPunchOut || cr.requested_punch_out || null, cr.requestedStatus || cr.requested_status || 'Present', cr.reason || 'Attendance punch correction', crStatus, cr.reviewerNotes || cr.reviewer_notes || null);
          }
        }
      }

      // H. Restore Attendance Records
      for (const [_, att] of attendanceMap) {
        let rawCompId = att.companyId || att.company_id;
        let rawEmpId = att.employeeId || att.employee_id;
        let date = att.date;

        let compId = rawCompId ? (companyIdMap.get(String(rawCompId)) || Number(rawCompId)) : null;
        let empId = rawEmpId ? (employeeIdMap.get(String(rawEmpId)) || Number(rawEmpId)) : null;

        if (compId && empId && date && !isNaN(compId) && !isNaN(empId)) {
          const compExists = db.prepare('SELECT id FROM companies WHERE id = ?').get(compId);
          const empExists = db.prepare('SELECT id FROM employees WHERE id = ?').get(empId);

          if (compExists && empExists) {
            let attStatus = att.status || 'Present';
            const allowedStatuses = ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekly Off', 'Missing Punch In', 'Missing Punch Out'];
            if (!allowedStatuses.includes(attStatus)) {
              if (attStatus.toLowerCase().includes('half')) attStatus = 'Half Day';
              else if (attStatus.toLowerCase().includes('leave')) attStatus = 'Leave';
              else if (attStatus.toLowerCase().includes('absent')) attStatus = 'Absent';
              else attStatus = 'Present';
            }

            db.prepare(`
              INSERT INTO attendance_records (company_id, employee_id, date, punch_in_time, punch_out_time, status, total_hours)
              VALUES (?, ?, ?, ?, ?, ?, 8.0)
              ON CONFLICT(company_id, employee_id, date) DO UPDATE SET
                punch_in_time = COALESCE(excluded.punch_in_time, punch_in_time),
                punch_out_time = COALESCE(excluded.punch_out_time, punch_out_time),
                status = COALESCE(excluded.status, status)
            `).run(compId, empId, date, att.punchInTime || att.punch_in_time || null, att.punchOutTime || att.punch_out_time || null, attStatus);
            restoredAttendances++;
          }
        }
      }

      // I. Restore Support Tickets
      for (const [_, st] of ticketsMap) {
        let compId = st.companyId || st.company_id;
        if (compId) compId = companyIdMap.get(String(compId)) || Number(compId);
        let uId = st.userId || st.user_id;
        if (uId) uId = userIdMap.get(String(uId)) || Number(uId);

        if (st.title) {
          const tktNum = st.ticketNumber || st.ticket_number || `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
          let tktStatus = st.status || 'open';
          if (!['open', 'in_progress', 'resolved', 'closed'].includes(tktStatus)) tktStatus = 'open';
          db.prepare(`
            INSERT INTO support_tickets (ticket_number, company_id, user_id, title, description, category, priority, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ticket_number) DO UPDATE SET
              status = excluded.status,
              priority = excluded.priority
          `).run(tktNum, compId, uId || null, st.title, st.description || '', st.category || 'General', st.priority || 'medium', tktStatus);
        }
      }
    });

    restoreTransaction();

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
