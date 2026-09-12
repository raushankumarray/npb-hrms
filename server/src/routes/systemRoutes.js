const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { verifyAuth, generateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');
const { getFirebaseStatus, saveFirebaseConfig, testFirebaseConnection, syncAllDatabaseToFirebase } = require('../services/firebase');

// Helper to get or insert an application setting
function getSetting(key, defaultValue = '') {
  try {
    const row = db.prepare('SELECT setting_value FROM application_settings WHERE setting_key = ?').get(key);
    return row ? row.setting_value : defaultValue;
  } catch (err) {
    return defaultValue;
  }
}

function setSetting(key, value, description = '') {
  db.prepare(`
    INSERT INTO application_settings (setting_key, setting_value, description, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = CURRENT_TIMESTAMP
  `).run(key, String(value), description);
}

// 1. GET /api/system/settings - Public/Authenticated System Settings
router.get('/settings', (req, res) => {
  try {
    const platformName = getSetting('platform_name', 'NPB HRMS');
    const platformLogo = getSetting('platform_logo', null);
    const browserFavicon = getSetting('browser_favicon', null);
    const showBrandingMode = getSetting('show_branding_mode', 'both');

    res.json({
      settings: {
        platform_name: platformName,
        platform_logo: platformLogo,
        browser_favicon: browserFavicon,
        show_branding_mode: showBrandingMode
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve system settings: ' + err.message });
  }
});

// 2. PUT /api/system/settings - Update Platform Branding, Logo & Favicon (Super Admin only)
router.put('/settings', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { platform_name, platform_logo, browser_favicon, show_branding_mode } = req.body;

  try {
    const oldValues = {
      platform_name: getSetting('platform_name', 'NPB HRMS'),
      platform_logo: getSetting('platform_logo', null),
      browser_favicon: getSetting('browser_favicon', null)
    };

    if (platform_name !== undefined) {
      setSetting('platform_name', platform_name.trim(), 'Platform brand and company name');
    }
    if (platform_logo !== undefined) {
      setSetting('platform_logo', platform_logo, 'Platform system brand logo');
    }
    if (browser_favicon !== undefined) {
      setSetting('browser_favicon', browser_favicon, 'Browser tab favicon icon');
    }
    if (show_branding_mode !== undefined) {
      setSetting('show_branding_mode', show_branding_mode, 'Branding display mode');
    }

    // Dispatch audit log
    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin System Settings',
      action: 'SYSTEM_SETTINGS_UPDATED',
      targetEntity: 'application_settings',
      oldValues,
      newValues: { platform_name, has_logo: !!platform_logo, has_favicon: !!browser_favicon },
      reason: 'Super Admin updated platform branding, logo, or favicon'
    });

    // Notify Super Admin
    try {
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'System Branding Updated', ?, 'system')
      `).run(
        req.user.id,
        `Platform settings updated: Name="${platform_name || oldValues.platform_name}", logo & favicon synchronized.`
      );
    } catch (e) {}

    res.json({
      success: true,
      message: 'System settings, company logo, and browser favicon updated successfully.',
      settings: {
        platform_name: platform_name !== undefined ? platform_name.trim() : oldValues.platform_name,
        platform_logo: platform_logo !== undefined ? platform_logo : oldValues.platform_logo,
        browser_favicon: browser_favicon !== undefined ? browser_favicon : oldValues.browser_favicon,
        show_branding_mode: show_branding_mode || 'both'
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update system settings: ' + err.message });
  }
});

// 3. PUT /api/system/superadmin/account - Update Super Admin Username & Password (Super Admin only)
router.put('/superadmin/account', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { username, password, full_name } = req.body;

  if (!username && !password && !full_name) {
    return res.status(400).json({ error: 'At least one field (username, password, full_name) must be provided.' });
  }

  try {
    const currentSuperAdmin = db.prepare('SELECT id, username, password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!currentSuperAdmin) {
      return res.status(404).json({ error: 'Super Admin account not found.' });
    }

    const updates = [];
    const params = [];
    let updatedUsername = currentSuperAdmin.username;

    if (username && username.trim() !== currentSuperAdmin.username) {
      const cleanUsername = username.trim();
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(cleanUsername, req.user.id);
      if (existing) {
        return res.status(400).json({ error: `Username "${cleanUsername}" is already taken by another account.` });
      }
      updates.push('username = ?');
      params.push(cleanUsername);
      updatedUsername = cleanUsername;
    }

    if (password && password.trim()) {
      if (password.trim().length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters long.' });
      }
      const passHash = bcrypt.hashSync(password.trim(), 10);
      updates.push('password_hash = ?');
      params.push(passHash);
    }

    const transaction = db.transaction(() => {
      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.user.id);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      if (full_name && full_name.trim()) {
        db.prepare(`
          INSERT INTO super_admins (user_id, full_name)
          VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET full_name = excluded.full_name
        `).run(req.user.id, full_name.trim());
      }

      logAudit({
        userId: req.user.id,
        userName: updatedUsername,
        role: 'super_admin',
        panel: 'Super Admin Settings',
        action: 'SUPER_ADMIN_ACCOUNT_UPDATED',
        targetEntity: 'users',
        targetId: req.user.id,
        reason: 'Super Admin modified username, password, or display name'
      });

      // Insert notification
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Account Credentials Updated', 'Your Super Admin credentials have been successfully updated.', 'system')
      `).run(req.user.id);
    });

    transaction();

    // Generate refreshed token with new username
    const refreshedToken = generateToken({
      id: req.user.id,
      username: updatedUsername,
      role_name: 'super_admin',
      company_id: null
    });

    res.json({
      success: true,
      message: 'Super Admin credentials updated successfully.',
      token: refreshedToken,
      user: {
        id: req.user.id,
        username: updatedUsername,
        fullName: full_name ? full_name.trim() : req.user.fullName || 'Super Admin',
        role: 'super_admin'
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Super Admin account: ' + err.message });
  }
});

// 4. GET /api/system/firebase-status - Retrieve Firebase connection status
router.get('/firebase-status', (req, res) => {
  res.json({ status: getFirebaseStatus() });
});

// 5. POST /api/system/firebase-config - Update Firebase project credentials (Super Admin only)
router.post('/firebase-config', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { projectId, serviceAccountJson, databaseUrl } = req.body;

  try {
    const success = saveFirebaseConfig({ projectId, serviceAccountJson, databaseUrl });
    const status = getFirebaseStatus();

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Firebase Config',
      action: 'FIREBASE_CONFIG_UPDATED',
      targetEntity: 'application_settings',
      newValues: { projectId: status.projectId, databaseUrl: status.databaseUrl, connected: status.connected },
      reason: 'Super Admin updated Firebase configuration credentials'
    });

    res.json({
      success,
      message: status.connected
        ? `Firebase successfully connected to project "${status.projectId}".`
        : 'Firebase credentials saved. Awaiting valid project keys.',
      status
    });
  } catch (err) {
    res.status(400).json({ error: 'Failed to configure Firebase: ' + err.message });
  }
});

// 6. POST /api/system/firebase-test - Test Live Connection (Super Admin only)
router.post('/firebase-test', verifyAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const result = await testFirebaseConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/system/firebase-sync-all - Force full sync of all accounts, companies, employees, and reports to Firebase (Super Admin only)
router.post('/firebase-sync-all', verifyAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const result = await syncAllDatabaseToFirebase();
    if (!result.success) {
      return res.status(400).json(result);
    }
    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Super Admin Firebase Config',
      action: 'FIREBASE_FULL_SYNC',
      targetEntity: 'firebase_sync',
      newValues: result,
      reason: 'Super Admin triggered manual full database sync to Firebase'
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
