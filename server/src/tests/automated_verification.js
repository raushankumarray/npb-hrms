const assert = require('assert');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { calculateDistanceMeters, validateGeofence } = require('../services/geofence');
const { checkAndBindDevice, unbindUserDevice } = require('../services/deviceBinding');
const { generateEmployeeTemplate, validateEmployeeImport } = require('../services/excelService');

async function runTests() {
  console.log('=== STARTING AUTOMATED BACKEND VERIFICATION ===\n');

  // Test 1: Super Admin Credential Check
  console.log('Test 1: Verifying Super Admin account in database...');
  const adminUser = db.prepare("SELECT * FROM users WHERE username = 'adminn'").get();
  assert(adminUser, 'Super Admin user "adminn" must exist in database');
  const passMatches = bcrypt.compareSync('Admin@88', adminUser.password_hash);
  assert(passMatches, 'Password hash must verify "Admin@88"');
  console.log('✔ PASS: Super Admin (adminn / Admin@88) properly seeded and securely hashed.\n');

  // Test 2: Haversine Geofence Distance Calculation
  console.log('Test 2: Verifying Haversine distance & geofence validation...');
  // Cyber City Office: 28.4950, 77.0890, radius 250m
  // Point A: very close (inside ~20m): 28.4951, 77.0891
  const distInside = calculateDistanceMeters(28.4950, 77.0890, 28.4951, 77.0891);
  assert(distInside < 250, `Distance ${distInside} should be inside 250m radius`);

  // Point B: outside (Connaught Place ~20km away): 28.6304, 77.2177
  const distOutside = calculateDistanceMeters(28.4950, 77.0890, 28.6304, 77.2177);
  assert(distOutside > 15000, `Distance ${distOutside} should be > 15km away`);

  const emp = db.prepare("SELECT id, company_id FROM employees WHERE employee_id = 'NPB101'").get();
  const insideValidation = validateGeofence({
    companyId: emp.company_id,
    employeeId: emp.id,
    latitude: 28.4951,
    longitude: 77.0891,
    accuracy: 10
  });
  assert(insideValidation.allowed === true, 'Geofence inside point should be allowed');

  const outsideValidation = validateGeofence({
    companyId: emp.company_id,
    employeeId: emp.id,
    latitude: 28.6304,
    longitude: 77.2177,
    accuracy: 10
  });
  assert(outsideValidation.allowed === false, 'Geofence outside point should be blocked');
  console.log(`✔ PASS: Geofencing correctly allows within radius and blocks outside (${Math.round(distOutside)}m).\n`);

  // Test 3: Device Binding & Support Unbinding
  console.log('Test 3: Verifying Device Binding & Support Unbinding Workflow...');
  const testEmpUser = db.prepare("SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'employee' LIMIT 1").get();
  // Clear any existing binding for this test
  db.prepare("DELETE FROM employee_devices WHERE user_id = ?").run(testEmpUser.id);

  // Device 1 login -> should bind
  const bind1 = checkAndBindDevice({
    userId: testEmpUser.id,
    roleName: 'employee',
    deviceId: 'test_device_alpha_123',
    deviceType: 'Chrome on Windows',
    deviceName: 'Primary Work Laptop',
    ipAddress: '192.168.1.50'
  });
  assert(bind1.allowed === true, 'First device should be bound successfully');

  // Device 2 login -> should be blocked!
  const bind2 = checkAndBindDevice({
    userId: testEmpUser.id,
    roleName: 'employee',
    deviceId: 'test_device_beta_999',
    deviceType: 'Safari on iPhone',
    deviceName: 'Secondary Phone',
    ipAddress: '192.168.1.51'
  });
  assert(bind2.allowed === false, 'Second device should be BLOCKED');
  assert(bind2.message.includes('already bound'), 'Blocked message should explain device lock');

  // Support unbinds device
  const unbindRes = unbindUserDevice({
    userId: testEmpUser.id,
    authorizedUserId: adminUser.id,
    authorizerName: 'adminn',
    authorizerRole: 'super_admin',
    reason: 'Employee changed phone'
  });
  assert(unbindRes.success === true, 'Support should successfully unbind device');

  // Device 2 login again -> now allowed!
  const bind3 = checkAndBindDevice({
    userId: testEmpUser.id,
    roleName: 'employee',
    deviceId: 'test_device_beta_999',
    deviceType: 'Safari on iPhone',
    deviceName: 'Secondary Phone',
    ipAddress: '192.168.1.51'
  });
  assert(bind3.allowed === true, 'Device 2 should be allowed after Support unbinds');
  console.log('✔ PASS: Single-device lock, secondary device blocking, and support unbinding verified.\n');

  // Test 4: Excel Template Generation & Validation
  console.log('Test 4: Verifying Excel Template generation and validation...');
  const templateBuffer = generateEmployeeTemplate();
  assert(templateBuffer && templateBuffer.length > 100, 'Excel template buffer should be generated');

  const validationRes = validateEmployeeImport(templateBuffer, emp.company_id);
  assert(validationRes.summary.totalRows >= 2, 'Template sample rows should be parsed');
  assert(validationRes.summary.validRows >= 2, 'Template rows should be valid format');
  console.log(`✔ PASS: Excel template generated (${templateBuffer.length} bytes) and validated ${validationRes.summary.validRows} rows.\n`);

  console.log('====================================================');
  console.log('ALL AUTOMATED BACKEND VERIFICATION TESTS PASSED (4/4)!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
