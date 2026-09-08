const http = require('http');
const db = require('../db');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://localhost:5000/api';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const postData = options.body ? JSON.stringify(options.body) : null;
    
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING AUTOMATED TEST: SUPPORT MANAGEMENT & TICKET CHAT ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Super Admin Login
    const saLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: 'adminn', password: 'Admin@88' }
    });
    assert(saLogin.status === 200 && saLogin.data.token, 'Super Admin logged in successfully');
    const saToken = saLogin.data.token;

    // 2. Create Support Account
    const uniqueNum = Date.now().toString().slice(-5);
    const testSupportUsername = `sup_agent_${uniqueNum}`;
    const createSup = await request('/support/users', {
      method: 'POST',
      token: saToken,
      body: {
        full_name: 'Test Support Staff',
        username: testSupportUsername,
        password: 'Password@123',
        email: `agent_${uniqueNum}@npbhrms.com`,
        permission_level: 2
      }
    });
    assert(createSup.status === 201 && createSup.data.supportId, 'Super Admin created Support staff account (Level 2)');

    // List support users to find the new user's user_id
    const listSup = await request('/support/users', { token: saToken });
    const createdUser = listSup.data.supportUsers.find(u => u.username === testSupportUsername);
    assert(createdUser && createdUser.user_id, `Found created support staff user_id: ${createdUser?.user_id}`);
    const supUserId = createdUser.user_id;

    // 3. Edit Support Account (change username, name, email, level)
    const updatedUsername = `sup_updated_${uniqueNum}`;
    const editSup = await request(`/support/users/${supUserId}`, {
      method: 'PUT',
      token: saToken,
      body: {
        username: updatedUsername,
        full_name: 'Test Support Senior',
        email: `senior_${uniqueNum}@npbhrms.com`,
        permission_level: 3,
        status: 'active'
      }
    });
    assert(editSup.status === 200 && editSup.data.success, 'Super Admin edited support staff details (username, name, email, level 3)');

    // Verify changes in DB via list
    const listSupAfterEdit = await request('/support/users', { token: saToken });
    const editedUser = listSupAfterEdit.data.supportUsers.find(u => u.user_id === supUserId);
    assert(editedUser.username === updatedUsername && editedUser.permission_level === 3, 'Support staff details verified in database');

    // 4. Update Support Password
    const newPassword = 'NewSecretPassword@999';
    const changePass = await request(`/support/users/${supUserId}/change-password`, {
      method: 'POST',
      token: saToken,
      body: { newPassword }
    });
    assert(changePass.status === 200 && changePass.data.success, 'Super Admin updated support staff password');

    // Verify login with new password
    const supLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: updatedUsername, password: newPassword }
    });
    assert(supLogin.status === 200 && supLogin.data.token, 'Support staff logged in successfully with new password');
    let supToken = supLogin.data.token;

    // 5. Suspend Support Account
    const suspendSup = await request(`/support/users/${supUserId}/status`, {
      method: 'PUT',
      token: saToken,
      body: { status: 'disabled' }
    });
    assert(suspendSup.status === 200 && suspendSup.data.success, 'Super Admin suspended support account (disabled)');

    // Verify disabled support account cannot log in
    const disabledLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: updatedUsername, password: newPassword }
    });
    assert(disabledLogin.status === 403, 'Disabled support account rejected on login (HTTP 403)');

    // Re-enable Support Account
    const enableSup = await request(`/support/users/${supUserId}/status`, {
      method: 'PUT',
      token: saToken,
      body: { status: 'active' }
    });
    assert(enableSup.status === 200 && enableSup.data.success, 'Super Admin re-enabled support account (active)');

    // Verify active support account logs in again
    const reEnabledLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: updatedUsername, password: newPassword }
    });
    assert(reEnabledLogin.status === 200, 'Re-enabled support account logged in successfully');
    supToken = reEnabledLogin.data.token;

    // 6. Test Support Multi-Company Data Access
    // Fetch companies list
    const compList = await request('/companies', { token: supToken });
    assert(compList.status === 200 && compList.data.companies && compList.data.companies.length > 0, `Support retrieved ${compList.data?.companies?.length} companies for multi-tenant switcher`);
    const targetCompId = compList.data.companies[0].id;

    // Support fetches company-wise devices
    const compDevices = await request(`/support/devices?company_id=${targetCompId}`, { token: supToken });
    assert(compDevices.status === 200 && Array.isArray(compDevices.data.devices), `Support filtered registered devices by company #${targetCompId}`);

    // Support fetches all devices (cross-tenant)
    const allDevices = await request('/support/devices', { token: supToken });
    assert(allDevices.status === 200 && Array.isArray(allDevices.data.devices), 'Support viewed all registered devices across all companies');

    // Support fetches company-wise tickets
    const compTickets = await request(`/tickets/service-requests?company_id=${targetCompId}`, { token: supToken });
    assert(compTickets.status === 200 && Array.isArray(compTickets.data.requests), `Support queried service tickets by company #${targetCompId}`);

    // 7. Test Ticket Chat Back-and-Forth on Same Ticket ID
    // Create a deterministic test employee in DB for targetCompId
    const testEmpUsername = `emp_chat_${uniqueNum}`;
    const empRole = db.prepare("SELECT id FROM roles WHERE name = 'employee'").get();
    const empPassHash = bcrypt.hashSync('EmpPass@123', 10);
    
    const empUserRes = db.prepare(`
      INSERT INTO users (username, password_hash, email, role_id, company_id, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(testEmpUsername, empPassHash, `${testEmpUsername}@test.com`, empRole.id, targetCompId);

    const empProfileRes = db.prepare(`
      INSERT INTO employees (user_id, company_id, employee_id, full_name, email, department, status)
      VALUES (?, ?, ?, 'Test Chat Employee', ?, 'Engineering', 'active')
    `).run(empUserRes.lastInsertRowid, targetCompId, `EMP${uniqueNum}`, `${testEmpUsername}@test.com`);

    // Log in as employee
    const empLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: testEmpUsername, password: 'EmpPass@123' }
    });
    assert(empLogin.status === 200 && empLogin.data.token, 'Test Employee logged in successfully');
    const empToken = empLogin.data.token;

    // Employee creates a service ticket
    const ticketCreate = await request('/tickets/service-request', {
      method: 'POST',
      token: empToken,
      body: {
        request_type: 'missing_punch',
        title: `Automated Chat Test Ticket ${uniqueNum}`,
        description: 'Forgot punch out due to offsite client audit at 6 PM',
        punch_date: '2026-03-01',
        suggested_punch_in: '09:00:00',
        suggested_punch_out: '18:00:00'
      }
    });
    assert(ticketCreate.status === 201 && ticketCreate.data.requestId, `Employee created service ticket #${ticketCreate.data.requestId}`);
    const ticketId = ticketCreate.data.requestId;

    // Employee sends first message in chat thread for this ticket
    const empMsg = await request(`/tickets/service-requests/${ticketId}/messages`, {
      method: 'POST',
      token: empToken,
      body: {
        message: 'Hello Support, please check my missing punch for client audit.'
      }
    });
    assert(empMsg.status === 201 && empMsg.data.messageId, `Employee sent chat message on ticket #${ticketId}`);

    // Support fetches ticket messages for this same ticket ID
    const supFetchMessages = await request(`/tickets/service-requests/${ticketId}/messages`, {
      token: supToken
    });
    assert(supFetchMessages.status === 200 && supFetchMessages.data.messages.length === 1, `Support viewed conversation thread for ticket #${ticketId} (1 message found)`);
    assert(supFetchMessages.data.messages[0].sender_role === 'employee', 'Message sender role correctly identified as employee');

    // Support replies on the exact same ticket ID
    const supReply = await request(`/tickets/service-requests/${ticketId}/messages`, {
      method: 'POST',
      token: supToken,
      body: {
        message: 'Understood. We verified your geofence logs and approved the punch out time at 18:00:00.',
        status: 'resolved'
      }
    });
    assert(supReply.status === 201 && supReply.data.messageId, `Support replied on the same ticket #${ticketId} and marked as resolved`);

    // Fetch conversation thread again - should have 2 messages now
    const threadAfterReply = await request(`/tickets/service-requests/${ticketId}/messages`, {
      token: empToken
    });
    assert(threadAfterReply.status === 200 && threadAfterReply.data.messages.length === 2, `Thread has 2 back-and-forth messages on Ticket #${ticketId}`);
    assert(threadAfterReply.data.ticket.status === 'resolved', `Ticket #${ticketId} status is now RESOLVED in chat metadata`);

    // Employee sends a thank you reply on the resolved ticket
    const empReply2 = await request(`/tickets/service-requests/${ticketId}/messages`, {
      method: 'POST',
      token: empToken,
      body: {
        message: 'Thank you for the quick resolution!'
      }
    });
    assert(empReply2.status === 201, `Employee sent follow-up message on ticket #${ticketId}`);

    // Final thread check
    const finalThread = await request(`/tickets/service-requests/${ticketId}/messages`, {
      token: supToken
    });
    assert(finalThread.data.messages.length === 3, `Complete chat thread has 3 messages strictly bound to Ticket ID #${ticketId}`);

    // 8. Super Admin Deletes Support Account Permanently
    const deleteSup = await request(`/support/users/${supUserId}`, {
      method: 'DELETE',
      token: saToken
    });
    assert(deleteSup.status === 200 && deleteSup.data.success, 'Super Admin permanently deleted support staff account');

    // Verify user is gone from list
    const listAfterDelete = await request('/support/users', { token: saToken });
    const checkDeleted = listAfterDelete.data.supportUsers.find(u => u.user_id === supUserId);
    assert(!checkDeleted, 'Support account verified removed from users & support_users tables');

    console.log('\n========================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Unhandled error during test run:', err);
    process.exit(1);
  }
}

runTests();
