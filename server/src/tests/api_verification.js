const assert = require('assert');
const http = require('http');
const app = require('../index');

// Note: index.js starts the server on PORT 5000. Let's make HTTP calls to http://127.0.0.1:5000
function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function testApis() {
  console.log('Testing live API endpoints...\n');

  // Wait 500ms for server to be ready
  await new Promise(r => setTimeout(r, 500));

  // 1. Health check
  const health = await request('/api/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.zero_payroll_compliance, true);
  console.log('✔ PASS: Health check endpoint working. Zero payroll compliance confirmed.');

  // 2. Super Admin Login
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: 'adminn',
    password: 'Admin@88'
  });

  assert.strictEqual(loginRes.status, 200);
  assert(loginRes.body.token, 'Must return JWT token');
  assert.strictEqual(loginRes.body.user.role, 'super_admin');
  console.log('✔ PASS: Super Admin authenticated via /api/auth/login.');

  const adminToken = loginRes.body.token;

  // 3. Authenticated /api/auth/me
  const meRes = await request('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.user.username, 'adminn');
  console.log('✔ PASS: /api/auth/me token session verified.');

  // 4. Multi-tenant company listing
  const compRes = await request('/api/companies', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(compRes.status, 200);
  assert(compRes.body.companies.length >= 3, 'Should list seeded companies (NPB, BSES, MANNULLY)');
  console.log(`✔ PASS: Companies retrieved (${compRes.body.companies.length} tenants isolated).`);

  // 5. Attendance listing
  const attRes = await request('/api/attendance/list', {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(attRes.status, 200);
  assert(Array.isArray(attRes.body.records), 'Should return attendance records array');
  console.log(`✔ PASS: Attendance list retrieved (${attRes.body.records.length} records).`);

  console.log('\n====================================================');
  console.log('ALL API TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

testApis().catch(err => {
  console.error('API Test Failed:', err);
  process.exit(1);
});
