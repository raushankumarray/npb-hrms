const { initializeApp, cert, deleteApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');
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

    // Auto-sync existing SQLite records into Firebase in the background
    setTimeout(() => {
      syncAllDatabaseToFirebase().then(res => {
        if (res.success) {
          console.log(`🚀 Firebase Auto-Sync Complete: ${res.companiesCount} companies, ${res.employeesCount} employees, ${res.usersCount} users synced.`);
        }
      }).catch(err => {
        console.warn('Firebase auto-sync notice:', err.message);
      });
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
      companyName: companyName,
      employeeCode: employee.employee_id || '',
      fullName: employee.full_name,
      username: username,
      email: employee.email || '',
      mobile: employee.mobile || '',
      department: employee.department || '',
      designation: employee.designation || '',
      city: employee.city || '',
      role: employee.role_name || extra.role || 'employee',
      managerId: employee.manager_id || null,
      reportsToAdmin: employee.reports_to_admin ? 1 : 0,
      status: employee.status || 'active',
      shiftId: employee.shift_id || null,
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
      role: roleName,
      companyId: user.company_id || null,
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
      employeeId,
      date: today,
      punchInTime: punchData.punch_in_time || null,
      punchOutTime: punchData.punch_out_time || null,
      status: punchData.status || 'Present',
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
    // 1. Sync all active companies
    const companies = db.prepare('SELECT * FROM companies WHERE is_deleted = 0').all();
    let companiesCount = 0;
    for (const c of companies) {
      const adminUser = db.prepare("SELECT username, email FROM users WHERE company_id = ? AND role_id = (SELECT id FROM roles WHERE name = 'company_admin') LIMIT 1").get(c.id);
      await syncCompany(c, adminUser);
      companiesCount++;
    }

    // 2. Sync all active users
    const users = db.prepare('SELECT u.id, u.username, u.email, u.company_id, u.status, u.last_login_at, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.is_deleted = 0').all();
    let usersCount = 0;
    for (const u of users) {
      await syncUser(u);
      usersCount++;
    }

    // 3. Sync all active employees
    const employees = db.prepare('SELECT e.*, u.username, c.name as company_name FROM employees e JOIN users u ON e.user_id = u.id JOIN companies c ON e.company_id = c.id WHERE e.is_deleted = 0').all();
    let employeesCount = 0;
    for (const emp of employees) {
      await syncEmployee(emp);
      employeesCount++;
    }

    // 4. Sync recent attendance punches (past 30 days)
    const recentAttendances = db.prepare("SELECT * FROM attendance_records WHERE date >= date('now', '-30 days')").all();
    let attendancesCount = 0;
    for (const att of recentAttendances) {
      await syncAttendancePunch(att.company_id, att.employee_id, {
        date: att.date,
        punch_in_time: att.punch_in_time,
        punch_out_time: att.punch_out_time,
        status: att.status
      });
      attendancesCount++;
    }

    // 5. Sync company attendance summary reports
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
      message: `Successfully synchronized ${companiesCount} companies, ${employeesCount} employees, ${usersCount} user accounts, ${attendancesCount} attendance records, and ${reportsCount} reports to Firebase!`
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

module.exports = {
  initFirebase,
  getFirebaseStatus: () => firebaseStatus,
  syncGpsLocation,
  syncTicketMessage,
  syncAttendancePunch,
  syncCompany,
  syncEmployee,
  syncUser,
  deleteFromFirebase,
  syncCompanyReports,
  syncAllDatabaseToFirebase,
  testFirebaseConnection,
  saveFirebaseConfig: ({ projectId, serviceAccountJson, databaseUrl }) => {
    if (projectId !== undefined) {
      setAppSetting('firebase_project_id', (projectId || '').trim(), 'Firebase Project ID');
    }
    if (serviceAccountJson) {
      setAppSetting('firebase_service_account_json', typeof serviceAccountJson === 'string' ? serviceAccountJson : JSON.stringify(serviceAccountJson), 'Firebase Service Account JSON Credentials');
    }
    if (databaseUrl !== undefined) {
      setAppSetting('firebase_database_url', (databaseUrl || '').trim(), 'Firebase Realtime Database URL');
    }
    return initFirebase();
  }
};
