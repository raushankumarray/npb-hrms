const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, verifyAuth } = require('../middleware/auth');
const { checkAndBindDevice } = require('../services/deviceBinding');
const { logAudit } = require('../services/audit');

// Unified generic Login endpoint for ALL user roles
router.post('/login', (req, res) => {
  const { username, password, device_id, mac_address, device_type, device_name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.password_hash, u.email, u.role_id, u.company_id, u.status, u.is_deleted,
           r.name as role_name,
           s.permission_level as support_level,
           e.id as employee_id, e.employee_id as employee_code, e.full_name, e.manager_id
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN support_users s ON u.id = s.user_id
    LEFT JOIN employees e ON u.id = e.user_id
    WHERE u.username = ?
  `).get(username.trim());

  if (!user || user.is_deleted) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (user.status === 'disabled') {
    return res.status(403).json({ error: 'Account has been disabled. Please contact Support/Admin.' });
  }

  if (user.status === 'banned') {
    return res.status(403).json({ error: 'Account has been banned. Access denied.' });
  }

  const passwordValid = bcrypt.compareSync(password, user.password_hash);
  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Check company status if user is tied to a company
  let companyInfo = null;
  if (user.company_id) {
    const comp = db.prepare('SELECT id, name, portal_name, code, logo, status FROM companies WHERE id = ?').get(user.company_id);
    if (!comp || comp.status === 'deleted') {
      return res.status(403).json({ error: 'Company account does not exist.' });
    }
    if (comp.status === 'disabled' || comp.status === 'banned') {
      return res.status(403).json({ error: `Company access is ${comp.status}. Please contact Super Admin.` });
    }

    const settings = db.prepare('SELECT * FROM company_settings WHERE company_id = ?').get(user.company_id);
    const modules = db.prepare('SELECT module_name, is_enabled FROM company_modules WHERE company_id = ?').all(user.company_id);

    companyInfo = {
      id: comp.id,
      name: comp.name,
      portalName: comp.portal_name,
      code: comp.code,
      logo: comp.logo,
      settings: settings || {},
      modules: modules.reduce((acc, m) => {
        acc[m.module_name] = !!m.is_enabled;
        return acc;
      }, {})
    };
  }

  // Device Binding enforcement for employee accounts
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const deviceCheck = checkAndBindDevice({
    userId: user.id,
    roleName: user.role_name,
    deviceId: device_id,
    macAddress: mac_address,
    deviceType: device_type,
    deviceName: device_name,
    ipAddress
  });

  if (!deviceCheck.allowed) {
    return res.status(403).json({
      error: deviceCheck.message,
      code: 'DEVICE_BOUND_ANOTHER',
      registeredDevice: deviceCheck.registeredDevice,
      currentDevice: deviceCheck.currentDevice
    });
  }

  // Update last login
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

  // Generate JWT Token
  const token = generateToken(user);

  // Log successful login
  logAudit({
    companyId: user.company_id,
    userId: user.id,
    userName: user.username,
    role: user.role_name,
    panel: 'Auth Login',
    action: 'USER_LOGIN',
    targetEntity: 'users',
    targetId: user.id,
    reason: 'Successful user authentication',
    ipAddress
  });

  let boundDevice = null;
  if (user.role_name === 'employee') {
    boundDevice = db.prepare('SELECT * FROM employee_devices WHERE user_id = ?').get(user.id) || null;
  }

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name,
      supportLevel: user.support_level,
      companyId: user.company_id,
      employeeId: user.employee_id,
      employeeCode: user.employee_code,
      fullName: user.full_name || (user.role_name === 'super_admin' ? 'Super Admin' : user.username),
      registeredDevice: boundDevice
    },
    company: companyInfo
  });
});

// Verify current session and retrieve fresh user state & dynamic branding
router.get('/me', verifyAuth, (req, res) => {
  let companyInfo = null;
  if (req.user.company_id) {
    const comp = db.prepare('SELECT id, name, portal_name, code, logo, status FROM companies WHERE id = ?').get(req.user.company_id);
    const settings = db.prepare('SELECT * FROM company_settings WHERE company_id = ?').get(req.user.company_id);
    const modules = db.prepare('SELECT module_name, is_enabled FROM company_modules WHERE company_id = ?').all(req.user.company_id);

    companyInfo = {
      id: comp.id,
      name: comp.name,
      portalName: comp.portal_name,
      code: comp.code,
      logo: comp.logo,
      settings: settings || {},
      modules: modules.reduce((acc, m) => {
        acc[m.module_name] = !!m.is_enabled;
        return acc;
      }, {})
    };
  }

  let boundDevice = null;
  if (req.user.role_name === 'employee') {
    boundDevice = db.prepare('SELECT * FROM employee_devices WHERE user_id = ?').get(req.user.id) || null;
  }

  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      mobile: req.user.mobile || '',
      role: req.user.role_name,
      supportLevel: req.user.support_level,
      companyId: req.user.company_id,
      companyName: req.user.company_name || (companyInfo?.name) || '',
      employeeId: req.user.employee_id,
      employeeCode: req.user.employee_code,
      department: req.user.department || '',
      designation: req.user.designation || '',
      fullName: req.user.full_name || (req.user.role_name === 'super_admin' ? 'Super Admin' : req.user.username),
      registeredDevice: boundDevice
    },
    company: companyInfo
  });
});

// Retrieve active employee's registered device details
router.get('/my-device', verifyAuth, (req, res) => {
  const device = db.prepare('SELECT * FROM employee_devices WHERE user_id = ?').get(req.user.id);
  res.json({ device: device || null });
});

// Universal Profile Update for All User Roles (Super Admin, Support, Company Admin, HR, Manager, Employee)
router.put('/profile', verifyAuth, (req, res) => {
  const { full_name, username, email, mobile, password, new_password, current_password } = req.body;
  const targetPassword = new_password || password;

  try {
    const userId = req.user.id;
    const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    let updatedUsername = currentUser.username;
    const userUpdates = [];
    const userParams = [];

    // 1. Username update with uniqueness check
    if (username && username.trim() !== currentUser.username) {
      if (req.user.role_name === 'employee' || req.user.role_name === 'manager') {
        return res.status(403).json({ error: 'Managers and employees cannot change their username. Only Company Administrator can update credentials.' });
      }
      const cleanUsername = username.trim();
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, userId);
      if (existing) {
        return res.status(400).json({ error: `Username "${cleanUsername}" is already taken.` });
      }
      userUpdates.push('username = ?');
      userParams.push(cleanUsername);
      updatedUsername = cleanUsername;
    }

    // 2. Email update
    if (email !== undefined) {
      userUpdates.push('email = ?');
      userParams.push(email ? email.trim() : null);
    }

    // 2b. Mobile update
    if (mobile !== undefined) {
      userUpdates.push('mobile = ?');
      userParams.push(mobile ? mobile.trim() : null);
    }

    // 3. Password update
    if (targetPassword && targetPassword.trim()) {
      if (targetPassword.trim().length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
      }
      if (current_password) {
        const isCurrentValid = bcrypt.compareSync(current_password, currentUser.password_hash);
        if (!isCurrentValid) {
          return res.status(400).json({ error: 'Current password does not match.' });
        }
      }
      const passHash = bcrypt.hashSync(targetPassword.trim(), 10);
      userUpdates.push('password_hash = ?');
      userParams.push(passHash);
    }

    const transaction = db.transaction(() => {
      if (userUpdates.length > 0) {
        userUpdates.push('updated_at = CURRENT_TIMESTAMP');
        userParams.push(userId);
        db.prepare(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`).run(...userParams);
      }

      // Update role-specific entity
      const role = req.user.role_name;
      if (role === 'super_admin') {
        if (full_name && full_name.trim()) {
          db.prepare(`
            INSERT INTO super_admins (user_id, full_name)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET full_name = excluded.full_name
          `).run(userId, full_name.trim());
        }
      } else if (role === 'support') {
        if (full_name && full_name.trim()) {
          db.prepare('UPDATE support_users SET full_name = ? WHERE user_id = ?').run(full_name.trim(), userId);
        }
      } else {
        // Employee, Manager, HR, Company Admin
        const emp = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(userId);
        if (emp) {
          const empUpdates = [];
          const empParams = [];
          if (full_name && full_name.trim()) {
            empUpdates.push('full_name = ?');
            empParams.push(full_name.trim());
          }
          if (email !== undefined) {
            empUpdates.push('email = ?');
            empParams.push(email ? email.trim() : null);
          }
          if (mobile !== undefined) {
            empUpdates.push('mobile = ?');
            empParams.push(mobile ? mobile.trim() : null);
          }
          if (empUpdates.length > 0) {
            empUpdates.push('updated_at = CURRENT_TIMESTAMP');
            empParams.push(emp.id);
            db.prepare(`UPDATE employees SET ${empUpdates.join(', ')} WHERE id = ?`).run(...empParams);
          }
        }
      }

      // Audit log
      logAudit({
        companyId: req.user.company_id,
        userId,
        userName: updatedUsername,
        role: req.user.role_name,
        panel: 'User Profile',
        action: 'PROFILE_UPDATED',
        targetEntity: 'users',
        targetId: userId,
        reason: 'User self profile details update'
      });

      // Insert instant notification
      try {
        db.prepare(`
          INSERT INTO notifications (user_id, company_id, title, message, type)
          VALUES (?, ?, 'Profile Updated', 'Your profile details and credentials were saved successfully.', 'system')
        `).run(userId, req.user.company_id || null);
      } catch (e) {}
    });

    transaction();

    // Generate refreshed token
    const token = generateToken({
      id: userId,
      username: updatedUsername,
      role_name: req.user.role_name,
      company_id: req.user.company_id,
      support_level: req.user.support_level
    });

    res.json({
      success: true,
      message: 'Profile details updated successfully.',
      token,
      user: {
        id: userId,
        username: updatedUsername,
        email: email !== undefined ? email : req.user.email,
        mobile: mobile !== undefined ? mobile : req.user.mobile,
        fullName: full_name ? full_name.trim() : req.user.full_name || updatedUsername,
        role: req.user.role_name,
        companyId: req.user.company_id,
        companyName: req.user.company_name
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

// Change Password
router.post('/change-password', verifyAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const userRecord = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const isValid = bcrypt.compareSync(currentPassword, userRecord.password_hash);
  if (!isValid) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, req.user.id);

  logAudit({
    companyId: req.user.company_id,
    userId: req.user.id,
    userName: req.user.username,
    role: req.user.role_name,
    panel: 'User Settings',
    action: 'PASSWORD_CHANGED',
    targetEntity: 'users',
    targetId: req.user.id,
    reason: 'User self password change'
  });

  res.json({ success: true, message: 'Password changed successfully.' });
});

// Forgot Password - Creates a service request / ticket for Admin/Support to process
router.post('/forgot-password', (req, res) => {
  const { username, description } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Please enter your username.' });
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.company_id, e.id as emp_id, e.full_name
    FROM users u
    LEFT JOIN employees e ON u.id = e.user_id
    WHERE u.username = ? AND u.is_deleted = 0
  `).get(username.trim());

  if (!user) {
    // Return friendly generic message for security
    return res.json({
      success: true,
      message: 'If an active account with that username exists, a Password Reset request has been submitted to your Support/Admin team.'
    });
  }

  const ticketNo = `TKT-PW-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO support_tickets (
      ticket_number, company_id, created_by_user_id, category, subject, description, priority, status
    ) VALUES (?, ?, ?, 'Password Reset', ?, ?, 'high', 'open')
  `).run(
    ticketNo,
    user.company_id,
    user.id,
    `Password Reset Request for ${user.username}`,
    description || `User ${user.username} requested a password reset from the login page.`
  );

  res.json({
    success: true,
    ticketNumber: ticketNo,
    message: `Password reset request submitted successfully (Ticket #${ticketNo}). Authorized Support or your Company Administrator will process it.`
  });
});

module.exports = router;
