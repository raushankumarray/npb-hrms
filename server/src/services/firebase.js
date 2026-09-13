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
      }

      if (realtimeDb) {
        try {
          await realtimeDb.ref('companies').remove();
          await realtimeDb.ref('employees').remove();
          await realtimeDb.ref('company_employees').remove();
          await realtimeDb.ref('company_attendance').remove();
          await realtimeDb.ref('attendance_punches').remove();
          await realtimeDb.ref('live_locations').remove();
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

    // 1. Fetch from Firestore if available
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('companies').get();
        snap.forEach(doc => {
          const d = doc.data();
          companiesMap.set(String(d.id || doc.id), { id: Number(d.id || doc.id), ...d });
        });
      } catch (e) {
        console.warn('Firestore fetch companies notice:', e.message);
      }

      try {
        const snap = await firestoreDb.collection('users').get();
        snap.forEach(doc => {
          const d = doc.data();
          usersMap.set(String(d.id || doc.id), { id: Number(d.id || doc.id), ...d });
        });
      } catch (e) {
        console.warn('Firestore fetch users notice:', e.message);
      }

      try {
        const snap = await firestoreDb.collection('employees').get();
        snap.forEach(doc => {
          const d = doc.data();
          employeesMap.set(String(d.id || doc.id), { id: Number(d.id || doc.id), ...d });
        });
      } catch (e) {
        console.warn('Firestore fetch employees notice:', e.message);
      }

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
      try {
        const compSnap = await realtimeDb.ref('companies').once('value');
        const compVal = compSnap.val();
        if (compVal) {
          Object.entries(compVal).forEach(([k, v]) => {
            if (v && typeof v === 'object') {
              const id = String(v.id || k);
              if (!companiesMap.has(id)) {
                companiesMap.set(id, { id: Number(id), ...v });
              }
            }
          });
        }
      } catch (e) {}

      try {
        const userSnap = await realtimeDb.ref('users').once('value');
        const userVal = userSnap.val();
        if (userVal) {
          Object.entries(userVal).forEach(([k, v]) => {
            if (v && typeof v === 'object') {
              const id = String(v.id || k);
              if (!usersMap.has(id)) {
                usersMap.set(id, { id: Number(id), ...v });
              }
            }
          });
        }
      } catch (e) {}

      try {
        const empSnap = await realtimeDb.ref('employees').once('value');
        const empVal = empSnap.val();
        if (empVal) {
          Object.entries(empVal).forEach(([k, v]) => {
            if (v && typeof v === 'object') {
              const id = String(v.id || k);
              if (!employeesMap.has(id)) {
                employeesMap.set(id, { id: Number(id), ...v });
              }
            }
          });
        }
      } catch (e) {}
    }

    // 3. Upsert into SQLite in transaction
    let restoredCompanies = 0;
    let restoredUsers = 0;
    let restoredEmployees = 0;
    let restoredAttendances = 0;

    const companyIdMap = new Map();
    const userIdMap = new Map();
    const employeeIdMap = new Map();

    const restoreTransaction = db.transaction(() => {
      // A. Restore Companies
      for (const [docKey, c] of companiesMap) {
        let rawId = Number(c.id);
        const code = (c.code || (!isNaN(rawId) && rawId > 0 ? `COMP${rawId}` : `COMP_${Date.now()}_${Math.floor(Math.random() * 1000)}`)).trim().toUpperCase();
        const name = (c.name || c.portalName || c.portal_name || code || 'Company').trim();
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
          existing = db.prepare('SELECT id FROM companies WHERE id = ?').get(targetCompId);
        }
        if (!existing && code) {
          existing = db.prepare('SELECT id FROM companies WHERE code = ?').get(code);
          if (existing) targetCompId = existing.id;
        }

        if (existing) {
          db.prepare(`
            UPDATE companies SET name = ?, portal_name = ?, code = ?, email = ?, phone = ?, address = ?, logo = ?, status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(name, portalName, code, email, phone, address, logo, status, existing.id);
          targetCompId = existing.id;
        } else {
          if (targetCompId) {
            db.prepare(`
              INSERT INTO companies (id, name, portal_name, code, email, phone, address, logo, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(targetCompId, name, portalName, code, email, phone, address, logo, status);
          } else {
            const insRes = db.prepare(`
              INSERT INTO companies (name, portal_name, code, email, phone, address, logo, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(name, portalName, code, email, phone, address, logo, status);
            targetCompId = insRes.lastInsertRowid;
          }
        }

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

        // Ensure at least one default Shift
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
          const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(aUname);
          if (existingAdmin) {
            db.prepare('UPDATE users SET company_id = ?, password_hash = ?, status = ?, is_deleted = 0 WHERE id = ?')
              .run(targetCompId, aHash, status, existingAdmin.id);
          } else {
            db.prepare(`
              INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            `).run(aUname, aHash, aEmail, phone, roleMap['company_admin'], targetCompId, status);
          }
        }

        restoredCompanies++;
      }

      // First valid company fallback ID if needed
      const firstValidCompanyId = db.prepare('SELECT id FROM companies WHERE is_deleted = 0 ORDER BY id ASC LIMIT 1').get()?.id || null;

      // B. Restore Users
      for (const [docKey, u] of usersMap) {
        let rawUserId = Number(u.id);
        const username = (u.username || `user_${docKey}`).trim();
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
          const existingUser = db.prepare('SELECT password_hash FROM users WHERE id = ? OR username = ?').get(rawUserId, username);
          if (existingUser && existingUser.password_hash) {
            finalHash = existingUser.password_hash;
          } else {
            const defaultPass = roleName === 'super_admin' ? 'Admin@88' : (roleName === 'support' ? 'Support@123' : (roleName === 'company_admin' ? 'Admin@123' : (roleName === 'manager' ? 'Manager@123' : 'Employee@123')));
            finalHash = bcrypt.hashSync(defaultPass, 10);
          }
        }

        let targetUserId = (!isNaN(rawUserId) && rawUserId > 0) ? rawUserId : null;
        let existingById = targetUserId ? db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId) : null;
        let existingByName = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

        if (existingById) {
          db.prepare(`
            UPDATE users SET username = ?, password_hash = ?, email = ?, mobile = ?, role_id = ?, company_id = ?, status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(username, finalHash, email, mobile, roleId, compId, status, existingById.id);
          targetUserId = existingById.id;
        } else if (existingByName) {
          db.prepare(`
            UPDATE users SET password_hash = ?, email = ?, mobile = ?, role_id = ?, company_id = ?, status = ?, is_deleted = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(finalHash, email, mobile, roleId, compId, status, existingByName.id);
          targetUserId = existingByName.id;
        } else {
          if (targetUserId) {
            db.prepare(`
              INSERT INTO users (id, username, password_hash, email, mobile, role_id, company_id, status, is_deleted, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(targetUserId, username, finalHash, email, mobile, roleId, compId, status);
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

        const code = (emp.employeeCode || emp.employee_id || (!isNaN(rawEmpId) && rawEmpId > 0 ? `EMP${rawEmpId}` : `EMP_${Date.now()}`)).trim();
        const fullName = (emp.fullName || emp.full_name || emp.username || `Employee ${code}`).trim();
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
          const userAlreadyUsed = db.prepare('SELECT id FROM employees WHERE user_id = ? AND (? IS NULL OR id != ?)').get(linkedUserId, rawEmpId, rawEmpId);
          if (userAlreadyUsed) {
            linkedUserId = null;
          }
        }

        if (!linkedUserId) {
          const empUsername = (emp.username || code.toLowerCase()).trim();
          const existingUserByName = db.prepare('SELECT id FROM users WHERE username = ?').get(empUsername);
          if (existingUserByName) {
            const used = db.prepare('SELECT id FROM employees WHERE user_id = ? AND (? IS NULL OR id != ?)').get(existingUserByName.id, rawEmpId, rawEmpId);
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
          const newUsername = (emp.username || `${code.toLowerCase()}_${Math.floor(Math.random() * 1000)}`).trim();

          const resU = db.prepare(`
            INSERT INTO users (username, password_hash, email, mobile, role_id, company_id, status, is_deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
          `).run(newUsername, passHash, email, mobile, roleId, compId, status);
          linkedUserId = resU.lastInsertRowid;
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

        let targetEmpId = (!isNaN(rawEmpId) && rawEmpId > 0) ? rawEmpId : null;
        let existingEmp = null;
        if (targetEmpId) {
          existingEmp = db.prepare('SELECT id FROM employees WHERE id = ?').get(targetEmpId);
        }
        if (!existingEmp && code) {
          existingEmp = db.prepare('SELECT id FROM employees WHERE company_id = ? AND employee_id = ?').get(compId, code);
          if (existingEmp) targetEmpId = existingEmp.id;
        }

        if (existingEmp) {
          db.prepare(`
            UPDATE employees SET company_id = ?, user_id = ?, employee_id = ?, full_name = ?, mobile = ?, email = ?, department = ?, designation = ?, city = ?, manager_id = ?, shift_id = ?, weekly_off_id = ?, status = ?, is_deleted = 0, reports_to_admin = ?
            WHERE id = ?
          `).run(compId, linkedUserId, code, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin, existingEmp.id);
          targetEmpId = existingEmp.id;
        } else {
          if (targetEmpId) {
            db.prepare(`
              INSERT INTO employees (id, company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, status, is_deleted, reports_to_admin)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(targetEmpId, compId, linkedUserId, code, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin);
          } else {
            const insE = db.prepare(`
              INSERT INTO employees (company_id, user_id, employee_id, full_name, mobile, email, department, designation, city, manager_id, shift_id, weekly_off_id, status, is_deleted, reports_to_admin)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).run(compId, linkedUserId, code, fullName, mobile, email, department, designation, city, managerId, shiftId, weeklyOffId, status, reportsToAdmin);
            targetEmpId = insE.lastInsertRowid;
          }
        }

        employeeIdMap.set(String(docKey), targetEmpId);
        if (emp.id) employeeIdMap.set(String(emp.id), targetEmpId);
        employeeIdMap.set(String(targetEmpId), targetEmpId);

        restoredEmployees++;
      }

      // D. Restore Attendance Records
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
    });

    restoreTransaction();

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
