const fs = require('fs');

async function testAllFeatures() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE VERIFICATION OF ALL 9 NEW FEATURES 🧪');
  console.log('================================================================\n');

  // STEP 0: Login as Company Admin
  console.log('Step 0: Authenticating Company Admin...');
  const adminLoginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'npb_admin',
      password: 'Company@123',
      device_id: 'DEV-ADMIN-AUTO-VERIFY'
    })
  });
  const adminLoginData = await adminLoginRes.json();
  if (!adminLoginRes.ok) throw new Error(`Admin login failed: ${JSON.stringify(adminLoginData)}`);
  const adminToken = adminLoginData.token;
  const adminHeaders = { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
  const companyId = adminLoginData.user.companyId || 1;
  console.log(`✓ Admin logged in. Company ID: ${companyId}`);

  // FEATURE 1: Optional Employee Code Auto-Generation
  console.log('\n--- FEATURE 1: Optional Employee Code Auto-Generation ---');
  const autoEmpRes = await fetch('http://localhost:5000/api/employees', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      employee_id: '', // Leave empty to trigger auto-generation
      full_name: 'Auto Code Verification Staff',
      username: `autocode_${Date.now()}`,
      password: 'User@12345',
      email: `autocode_${Date.now()}@npbhrms.com`,
      mobile: '+91 9111222333',
      department: 'Technology',
      designation: 'Software Engineer',
      role: 'employee'
    })
  });
  const autoEmpData = await autoEmpRes.json();
  console.log('Response:', autoEmpRes.status, autoEmpData);
  if (!autoEmpRes.ok || !autoEmpData.employeeCode || !autoEmpData.employeeCode.startsWith('EMP')) {
    throw new Error('Auto code generation failed or invalid code returned');
  }
  const createdEmployeeId = autoEmpData.employeeId;
  const createdEmployeeCode = autoEmpData.employeeCode;
  console.log(`✓ Feature 1 Passed! Auto-generated clean employee code: ${createdEmployeeCode}`);

  // FEATURE 2: Employee Mapping Feature (Company -> HR or Manager -> Employee)
  console.log('\n--- FEATURE 2: Hierarchical Employee Mapping ---');
  // First, get a manager
  const mgrListRes = await fetch('http://localhost:5000/api/employees?role=manager', { headers: adminHeaders });
  const mgrList = await mgrListRes.json();
  const targetManager = mgrList.employees?.[0];
  if (!targetManager) throw new Error('No manager available for mapping test');

  // Map employee to manager
  const mapRes = await fetch('http://localhost:5000/api/employees/mapping', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      supervisor_id: targetManager.id,
      role_type: 'manager',
      employee_ids: [createdEmployeeId]
    })
  });
  const mapData = await mapRes.json();
  console.log('Mapping Response:', mapRes.status, mapData);
  if (!mapRes.ok) throw new Error('Failed to create employee mapping');

  // Verify mapping retrieval
  const getMapRes = await fetch('http://localhost:5000/api/employees/mappings', { headers: adminHeaders });
  const getMapData = await getMapRes.json();
  const verifyMapping = getMapData.mappings.find(m => m.employee_id === createdEmployeeId);
  if (!verifyMapping) throw new Error('Created mapping not found in /mappings list');
  console.log(`✓ Feature 2 Passed! Mapped employee (${createdEmployeeCode}) to Manager "${targetManager.full_name}" (Mapping ID: ${verifyMapping.id})`);

  // FEATURE 3: Universal Account Editing
  console.log('\n--- FEATURE 3: Universal Account Editing Across Panels ---');
  const updateRes = await fetch(`http://localhost:5000/api/employees/${createdEmployeeId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      full_name: 'Auto Code Staff (UPDATED TITLE)',
      department: 'Core Operations',
      designation: 'Principal Operations Specialist',
      role: 'employee',
      status: 'active'
    })
  });
  const updateData = await updateRes.json();
  console.log('Edit Response:', updateRes.status, updateData);
  if (!updateRes.ok) throw new Error('Failed to edit employee account');

  // Verify updated data
  const verifyEmpRes = await fetch(`http://localhost:5000/api/employees?search=${createdEmployeeCode}`, { headers: adminHeaders });
  const verifyEmpData = await verifyEmpRes.json();
  const updatedEmp = verifyEmpData.employees?.[0];
  if (!updatedEmp || updatedEmp.designation !== 'Principal Operations Specialist') {
    throw new Error('Updated designation did not persist in database');
  }
  console.log(`✓ Feature 3 Passed! Successfully updated account: ${updatedEmp.full_name} (${updatedEmp.designation})`);

  // FEATURE 4: Calendar Data for All Panels
  console.log('\n--- FEATURE 4: Interactive Calendar API for All Panels ---');
  const calendarRes = await fetch('http://localhost:5000/api/attendance/calendar?year=2026&month=9', { headers: adminHeaders });
  const calendarData = await calendarRes.json();
  console.log(`Calendar month: ${calendarData.month}/${calendarData.year}, Holidays: ${calendarData.holidays.length}, Off days: ${JSON.stringify(calendarData.offDays)}, Records: ${calendarData.records.length}`);
  if (!Array.isArray(calendarData.holidays) || !Array.isArray(calendarData.records) || !Array.isArray(calendarData.offDays)) {
    throw new Error('Calendar endpoint returned invalid structure');
  }
  console.log('✓ Feature 4 Passed! Calendar returns holidays, weekly offs, and attendance records');

  // FEATURE 5: Geofencing Enforcement on Attendance Punch
  console.log('\n--- FEATURE 5: Geofencing Punch Verification & Block ---');
  // Login as the created employee
  const empLoginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: updatedEmp.username,
      password: 'User@12345',
      device_id: `DEV-EMP-${createdEmployeeId}`
    })
  });
  const empLoginData = await empLoginRes.json();
  if (!empLoginRes.ok) throw new Error(`Employee login failed: ${JSON.stringify(empLoginData)}`);
  const empHeaders = { 'Authorization': `Bearer ${empLoginData.token}`, 'Content-Type': 'application/json' };

  // 5a: Attempt punch outside geofence (London coordinates: lat 51.5074, lng -0.1278)
  console.log('5a. Testing punch outside geofence (London GPS coords)...');
  const outsidePunchRes = await fetch('http://localhost:5000/api/attendance/punch-in', {
    method: 'POST',
    headers: empHeaders,
    body: JSON.stringify({
      latitude: 51.5074,
      longitude: -0.1278,
      accuracy: 15,
      location_name: 'Far Outside London Site'
    })
  });
  const outsidePunchData = await outsidePunchRes.json();
  console.log('Outside punch response:', outsidePunchRes.status, outsidePunchData.error || outsidePunchData.message);
  if (outsidePunchRes.status !== 403 || !outsidePunchData.geofenceFailed) {
    throw new Error(`Expected HTTP 403 geofence block, but received status ${outsidePunchRes.status}`);
  }
  console.log(`✓ 5a Passed: Punch successfully BLOCKED with HTTP 403 (${outsidePunchData.distance}m outside allowed radius ${outsidePunchData.allowedRadius}m)`);

  // 5b: Attempt punch inside geofence (Gurugram office: lat 28.4950, lng 77.0890)
  console.log('5b. Testing punch inside geofence (Gurugram HQ coords)...');
  const insidePunchRes = await fetch('http://localhost:5000/api/attendance/punch-in', {
    method: 'POST',
    headers: empHeaders,
    body: JSON.stringify({
      latitude: 28.4950,
      longitude: 77.0890,
      accuracy: 10,
      location_name: 'Inside Gurugram HQ Office'
    })
  });
  const insidePunchData = await insidePunchRes.json();
  console.log('Inside punch response:', insidePunchRes.status, insidePunchData.message || insidePunchData.error);
  if (!insidePunchRes.ok) {
    throw new Error(`Inside geofence punch failed: ${JSON.stringify(insidePunchData)}`);
  }
  console.log('✓ 5b Passed: Punch successfully AUTHORIZED inside geofence!');

  // FEATURE 6: Helpdesk to Solve Tickets
  console.log('\n--- FEATURE 6: Helpdesk Ticket Submission & Resolution Workflow ---');
  // Employee submits service ticket
  const ticketRes = await fetch('http://localhost:5000/api/tickets/service-request', {
    method: 'POST',
    headers: empHeaders,
    body: JSON.stringify({
      request_type: 'missing_punch',
      title: 'Missing Punch In - Power Outage Verification',
      description: 'Office router was offline during morning shift, requesting audit correction.',
      punch_date: new Date().toISOString().split('T')[0],
      suggested_punch_in: '09:15:00',
      suggested_punch_out: '18:15:00'
    })
  });
  const ticketData = await ticketRes.json();
  console.log('Submit Ticket Response:', ticketRes.status, ticketData);
  if (!ticketRes.ok) throw new Error('Ticket submission failed');
  const createdTicketId = ticketData.request?.id || ticketData.requestId;

  // Admin/HR resolves ticket
  const resolveRes = await fetch(`http://localhost:5000/api/tickets/service-requests/${createdTicketId}/resolve`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      status: 'resolved',
      resolution_notes: 'Verified against building security logbook. Corrected with audit trail.'
    })
  });
  const resolveData = await resolveRes.json();
  console.log('Resolve Ticket Response:', resolveRes.status, resolveData);
  if (!resolveRes.ok) throw new Error('Ticket resolution failed');
  console.log(`✓ Feature 6 Passed! Ticket #${createdTicketId} successfully raised by employee and resolved by Helpdesk`);

  // FEATURE 7: Live Employee Tracking with Map Attendance Data
  console.log('\n--- FEATURE 7: Live Employee Map with Punch Times & Attendance Status ---');
  const liveMapRes = await fetch('http://localhost:5000/api/tracking/live', { headers: adminHeaders });
  const liveMapData = await liveMapRes.json();
  const markers = liveMapData.positions || liveMapData.locations || [];
  console.log(`Total Live Markers Returned: ${markers.length}`);
  const empMarker = markers.find(m => m.employee_id === createdEmployeeId);
  if (!empMarker) {
    throw new Error('Created employee marker not found in /tracking/live');
  }
  console.log(`Marker Details: ${empMarker.full_name} (${empMarker.employee_code}) - Status: "${empMarker.attendance_status}", Punch In: "${empMarker.punch_in_time}"`);
  if (!empMarker.attendance_status || !empMarker.punch_in_time) {
    throw new Error('Marker missing required attendance status or punch in time');
  }
  console.log('✓ Feature 7 Passed! Map markers enrich coordinates with live punch times and status');

  // FEATURE 8: Monthly Earned Leave Accrual & Manual Quota Credit (Zero-Payroll Compliant)
  console.log('\n--- FEATURE 8: Monthly EL Accrual & Manual Quota Credit ---');
  // 8a. Monthly Accrual
  const accrualRes = await fetch('http://localhost:5000/api/leave/accrual/monthly', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ force: true })
  });
  const accrualData = await accrualRes.json();
  console.log('Monthly Accrual Response:', accrualRes.status, accrualData.message);
  if (!accrualRes.ok) throw new Error('Monthly accrual execution failed');

  // 8b. Manual Leave Quota Credit
  const leaveTypesRes = await fetch('http://localhost:5000/api/leave/types', { headers: adminHeaders });
  const leaveTypesData = await leaveTypesRes.json();
  const elType = leaveTypesData.leaveTypes.find(lt => lt.code === 'EL') || leaveTypesData.leaveTypes[0];

  const manualCreditRes = await fetch('http://localhost:5000/api/leave/manual-credit', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      leave_type_id: elType.id,
      apply_to_all: true,
      days: 1.25,
      reason: 'Automated Quota Adjustment Verification'
    })
  });
  const manualCreditData = await manualCreditRes.json();
  console.log('Manual Credit Response:', manualCreditRes.status, manualCreditData.message);
  if (!manualCreditRes.ok) throw new Error('Manual leave credit failed');

  // 8c. Accrual History Check
  const historyRes = await fetch('http://localhost:5000/api/leave/accrual/history', { headers: adminHeaders });
  const historyData = await historyRes.json();
  console.log(`Accrual History Logs Count: ${historyData.logs.length}`);
  if (!Array.isArray(historyData.logs) || historyData.logs.length === 0) {
    throw new Error('Accrual history is empty');
  }
  console.log(`✓ Feature 8 Passed! Monthly EL auto-accrued, manual quota credited, and transaction logs verified (Zero Payroll Compliant)`);

  // FEATURE 9: Super Admin Company Edit, Change Password & Permanent Database Deletion
  console.log('\n--- FEATURE 9: Super Admin Company Edit, Change Password & Permanent Delete ---');
  // 9a: Authenticate Super Admin
  const saLoginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'adminn',
      password: 'Admin@88',
      device_id: 'DEV-SUPER-ADMIN-VERIFY'
    })
  });
  const saLoginData = await saLoginRes.json();
  if (!saLoginRes.ok) throw new Error(`Super Admin login failed: ${JSON.stringify(saLoginData)}`);
  const saHeaders = { 'Authorization': `Bearer ${saLoginData.token}`, 'Content-Type': 'application/json' };
  console.log('✓ Super Admin authenticated.');

  // 9b: Create a test company without portal_name
  const testCompCode = `TST${Math.floor(1000 + Math.random() * 9000)}`;
  const testAdminUser = `admin_${testCompCode.toLowerCase()}`;
  const createCompRes = await fetch('http://localhost:5000/api/companies', {
    method: 'POST',
    headers: saHeaders,
    body: JSON.stringify({
      name: `Test Tenant ${testCompCode}`,
      code: testCompCode,
      email: `contact@test${testCompCode}.com`,
      phone: '+91 9876543210',
      address: 'Test City, India',
      admin_username: testAdminUser,
      admin_password: 'InitialPassword@123'
    })
  });
  const createCompData = await createCompRes.json();
  console.log('Create Company Response:', createCompRes.status, createCompData);
  if (!createCompRes.ok) throw new Error('Super Admin create company failed');
  const testCompId = createCompData.companyId;

  // 9c: Edit Company Details & Admin Username
  const updatedCompName = `Test Tenant ${testCompCode} (EDITED)`;
  const updatedAdminUser = `${testAdminUser}_upd`;
  const editCompRes = await fetch(`http://localhost:5000/api/companies/${testCompId}`, {
    method: 'PUT',
    headers: saHeaders,
    body: JSON.stringify({
      name: updatedCompName,
      code: testCompCode,
      email: `updated@test${testCompCode}.com`,
      phone: '+91 9999988888',
      address: 'Updated Business Hub, Floor 4',
      status: 'active',
      admin_username: updatedAdminUser,
      admin_password: 'UpdatedPassword@456'
    })
  });
  const editCompData = await editCompRes.json();
  console.log('Edit Company Response:', editCompRes.status, editCompData);
  if (!editCompRes.ok) throw new Error('Super Admin edit company failed');

  // Verify company details and admin user changed
  const getCompRes = await fetch(`http://localhost:5000/api/companies/${testCompId}`, { headers: saHeaders });
  const getCompData = await getCompRes.json();
  if (getCompData.company.name !== updatedCompName || getCompData.adminUser.username !== updatedAdminUser) {
    throw new Error('Edited company name or admin username did not match expected values');
  }
  console.log(`✓ 9b & 9c Passed: Company successfully edited (${getCompData.company.name}) with updated Admin username (${getCompData.adminUser.username})`);

  // 9d: Dedicated Change Admin Password Endpoint
  const changePassRes = await fetch(`http://localhost:5000/api/companies/${testCompId}/change-password`, {
    method: 'POST',
    headers: saHeaders,
    body: JSON.stringify({ new_password: 'BrandNewPassword@789' })
  });
  const changePassData = await changePassRes.json();
  console.log('Change Password Response:', changePassRes.status, changePassData.message);
  if (!changePassRes.ok) throw new Error('Change password endpoint failed');

  // Verify login with new password and updated username
  const testAdminLoginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: updatedAdminUser,
      password: 'BrandNewPassword@789',
      device_id: 'DEV-TEST-ADMIN-LOGIN'
    })
  });
  const testAdminLoginData = await testAdminLoginRes.json();
  if (!testAdminLoginRes.ok) throw new Error('Failed to login with newly updated admin credentials');
  console.log(`✓ 9d Passed: Company Admin logged in successfully with updated username & new password`);

  // 9e: Permanent Database Deletion
  const permDeleteRes = await fetch(`http://localhost:5000/api/companies/${testCompId}?permanent=true`, {
    method: 'DELETE',
    headers: saHeaders
  });
  const permDeleteData = await permDeleteRes.json();
  console.log('Permanent Delete Response:', permDeleteRes.status, permDeleteData.message);
  if (!permDeleteRes.ok) throw new Error('Permanent company deletion failed');

  // Verify company no longer exists in database
  const verifyDeletedRes = await fetch(`http://localhost:5000/api/companies/${testCompId}`, { headers: saHeaders });
  if (verifyDeletedRes.status !== 404) {
    throw new Error(`Expected HTTP 404 for deleted company, but got ${verifyDeletedRes.status}`);
  }
  console.log(`✓ 9e Passed: Company #${testCompId} permanently wiped from database, confirmed HTTP 404!`);

  console.log('\n================================================================');
  console.log('🏆 ALL REQUESTED CORE FEATURES & SUPER ADMIN CONTROLS VERIFIED! 🏆');
  console.log('================================================================\n');
}

testAllFeatures().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
