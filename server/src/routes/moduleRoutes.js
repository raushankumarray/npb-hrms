const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { logAudit } = require('../services/audit');
const { syncCompanyModules } = require('../services/firebase');

// 1. GET /api/modules - List all system modules with company adoption statistics
router.get('/', verifyAuth, (req, res) => {
  try {
    const modules = db.prepare(`
      SELECT id, module_key, name, description, category, is_core, is_active, created_at, updated_at
      FROM system_modules
      ORDER BY is_core DESC, id ASC
    `).all();

    // Fetch active non-deleted companies
    const companies = db.prepare(`
      SELECT id, name, code, status
      FROM companies
      WHERE is_deleted = 0
        AND UPPER(code) NOT IN ('NPB01', 'BSES01', 'MAN01')
        AND LOWER(name) NOT IN ('attendance', 'employees', 'leave_balances', 'modules', 'reports', 'users')
        AND code NOT LIKE 'COMP_1790610485%'
      ORDER BY name ASC
    `).all();

    // Fetch all company module mappings
    const allCompMods = db.prepare(`SELECT company_id, module_name, is_enabled FROM company_modules`).all();
    const modCompanyMap = {}; // module_name -> Map of company_id -> is_enabled
    allCompMods.forEach(cm => {
      if (!modCompanyMap[cm.module_name]) modCompanyMap[cm.module_name] = {};
      modCompanyMap[cm.module_name][cm.company_id] = cm.is_enabled === 1;
    });

    const enrichedModules = modules.map(m => {
      const compMap = modCompanyMap[m.module_key] || {};
      const companyAccess = companies.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
        status: c.status,
        // If not explicitly set in company_modules, core modules might default to on, but custom modules default to OFF
        is_enabled: compMap[c.id] !== undefined ? compMap[c.id] : (m.is_core ? true : false)
      }));

      const enabledCount = companyAccess.filter(c => c.is_enabled).length;

      return {
        ...m,
        total_companies: companies.length,
        enabled_companies: enabledCount,
        disabled_companies: companies.length - enabledCount,
        company_access: companyAccess
      };
    });

    res.json({
      success: true,
      modules: enrichedModules,
      companiesCount: companies.length,
      companies
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch modules: ' + err.message });
  }
});

// 2. POST /api/modules - Create a new dynamic system module (Super Admin only)
// Note: When any module is created, it is initialized as OFF (disabled) for all company accounts by default!
router.post('/', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { key, name, description, category } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Module name is required.' });
  }

  const cleanKey = (key || name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!cleanKey || cleanKey.length < 2) {
    return res.status(400).json({ error: 'Valid module key (letters, numbers, underscores) is required.' });
  }

  // Check unique key
  const existing = db.prepare('SELECT id FROM system_modules WHERE module_key = ?').get(cleanKey);
  if (existing) {
    return res.status(400).json({ error: `A module with key "${cleanKey}" already exists.` });
  }

  try {
    const transaction = db.transaction(() => {
      // 1. Insert into master system_modules registry
      const insStmt = db.prepare(`
        INSERT INTO system_modules (module_key, name, description, category, is_core, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      const result = insStmt.run(
        cleanKey,
        name.trim(),
        (description || '').trim(),
        (category || 'Custom').trim()
      );

      // 2. Explicitly initialize this module as OFF (is_enabled = 0) for all existing companies
      const companies = db.prepare(`
        SELECT id FROM companies 
        WHERE is_deleted = 0
          AND code NOT LIKE 'COMP_1790610485%'
          AND UPPER(code) NOT IN ('NPB01', 'BSES01', 'MAN01')
      `).all();

      const insCompMod = db.prepare(`
        INSERT OR REPLACE INTO company_modules (company_id, module_name, is_enabled, created_at, updated_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      for (const comp of companies) {
        insCompMod.run(comp.id, cleanKey);
      }

      logAudit({
        userId: req.user.id,
        userName: req.user.username,
        role: req.user.role_name,
        panel: 'Module Management',
        action: 'MODULE_CREATED',
        targetEntity: 'system_modules',
        targetId: result.lastInsertRowid,
        newValues: { module_key: cleanKey, name: name.trim(), category: category || 'Custom', default_status: 'OFF' },
        reason: `Created new module "${name.trim()}" (${cleanKey}) initialized as default OFF across all companies.`
      });

      return result.lastInsertRowid;
    });

    const newId = transaction();
    const createdModule = db.prepare('SELECT * FROM system_modules WHERE id = ?').get(newId);

    res.status(201).json({
      success: true,
      module: createdModule,
      message: `Module "${createdModule.name}" created successfully. It is set to OFF by default across all company accounts until enabled.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create module: ' + err.message });
  }
});

// 3. PUT /api/modules/:key - Update module details (Super Admin only)
router.put('/:key', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const moduleKey = req.params.key;
  const { name, description, category, is_active } = req.body;

  const existing = db.prepare('SELECT * FROM system_modules WHERE module_key = ?').get(moduleKey);
  if (!existing) {
    return res.status(404).json({ error: 'Module not found.' });
  }

  try {
    db.prepare(`
      UPDATE system_modules SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE module_key = ?
    `).run(
      name ? name.trim() : null,
      description !== undefined ? description.trim() : null,
      category ? category.trim() : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      moduleKey
    );

    const updated = db.prepare('SELECT * FROM system_modules WHERE module_key = ?').get(moduleKey);
    res.json({ success: true, module: updated, message: `Module "${updated.name}" updated successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update module: ' + err.message });
  }
});

// 4. DELETE /api/modules/:key - Delete a custom module (Super Admin only)
router.delete('/:key', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const moduleKey = req.params.key;
  const existing = db.prepare('SELECT * FROM system_modules WHERE module_key = ?').get(moduleKey);

  if (!existing) {
    return res.status(404).json({ error: 'Module not found.' });
  }

  if (existing.is_core === 1) {
    return res.status(403).json({ error: 'Core platform modules cannot be deleted to ensure system stability.' });
  }

  try {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM company_modules WHERE module_name = ?').run(moduleKey);
      db.prepare('DELETE FROM system_modules WHERE module_key = ?').run(moduleKey);
    });

    transaction();
    res.json({ success: true, message: `Module "${existing.name}" removed from platform and all company accounts.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete module: ' + err.message });
  }
});

// 5. PUT /api/modules/:key/toggle-company - Grant or revoke company access to a module
router.put('/:key/toggle-company', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const moduleKey = req.params.key;
  const { company_id, is_enabled } = req.body;

  if (!company_id) {
    return res.status(400).json({ error: 'company_id is required.' });
  }

  const compId = Number(company_id);
  const company = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(compId);
  if (!company) {
    return res.status(404).json({ error: 'Company not found.' });
  }

  const moduleRow = db.prepare('SELECT * FROM system_modules WHERE module_key = ?').get(moduleKey);
  if (!moduleRow) {
    return res.status(404).json({ error: 'Module not found.' });
  }

  const enabledVal = is_enabled ? 1 : 0;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO company_modules (company_id, module_name, is_enabled, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(compId, moduleKey, enabledVal);

    // Sync updated modules map to Firebase for this company
    const allMods = db.prepare('SELECT module_name, is_enabled FROM company_modules WHERE company_id = ?').all(compId);
    const modMap = {};
    allMods.forEach(m => { modMap[m.module_name] = m.is_enabled === 1; });

    try {
      if (syncCompanyModules) {
        syncCompanyModules(compId, modMap).catch(() => {});
      }
    } catch (e) {}

    // Dispatch real-time push notification to Company Admin
    try {
      const { notifyCompanyAdmins } = require('../services/notificationService');
      notifyCompanyAdmins(compId, {
        title: `Module ${enabledVal === 1 ? 'Enabled' : 'Disabled'}: ${moduleRow.name}`,
        message: `Super Admin has ${enabledVal === 1 ? 'enabled' : 'disabled'} the "${moduleRow.name}" module for your organization.`,
        type: enabledVal === 1 ? 'success' : 'warning',
        link: '/modules'
      });
    } catch (e) {}

    res.json({
      success: true,
      company_id: compId,
      company_name: company.name,
      module_key: moduleKey,
      is_enabled: enabledVal === 1,
      message: `Module "${moduleRow.name}" is now ${enabledVal === 1 ? 'ENABLED (ON)' : 'DISABLED (OFF)'} for "${company.name}".`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle company module: ' + err.message });
  }
});


// 6. GET /api/modules/browser_notifications/status - Master notification control status
router.get('/browser_notifications/status', verifyAuth, (req, res) => {
  try {
    const supportSetting = db.prepare("SELECT setting_value FROM application_settings WHERE setting_key = 'support_browser_notifications'").get();
    const supportEnabled = supportSetting ? supportSetting.setting_value === 'true' : true;

    const companies = db.prepare(`
      SELECT id, name, code, status
      FROM companies
      WHERE is_deleted = 0
        AND UPPER(code) NOT IN ('NPB01', 'BSES01', 'MAN01')
        AND LOWER(name) NOT IN ('attendance', 'employees', 'leave_balances', 'modules', 'reports', 'users')
        AND code NOT LIKE 'COMP_1790610485%'
      ORDER BY name ASC
    `).all();

    const compMods = db.prepare("SELECT company_id, is_enabled FROM company_modules WHERE module_name = 'browser_notifications'").all();
    const compModMap = {};
    compMods.forEach(cm => { compModMap[cm.company_id] = cm.is_enabled === 1; });

    const companyAccess = companies.map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      status: c.status,
      is_enabled: compModMap[c.id] !== undefined ? compModMap[c.id] : true
    }));

    const enabledCount = companyAccess.filter(c => c.is_enabled).length;

    res.json({
      success: true,
      support_browser_notifications: supportEnabled,
      total_companies: companies.length,
      enabled_companies: enabledCount,
      disabled_companies: companies.length - enabledCount,
      companies: companyAccess
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch browser notification status: ' + err.message });
  }
});

// 7. PUT /api/modules/browser_notifications/batch-companies - Enable/Disable browser notifications for all companies
router.put('/browser_notifications/batch-companies', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { is_enabled } = req.body;
  const enabledVal = is_enabled ? 1 : 0;

  try {
    const companies = db.prepare(`
      SELECT id FROM companies
      WHERE is_deleted = 0
        AND UPPER(code) NOT IN ('NPB01', 'BSES01', 'MAN01')
        AND code NOT LIKE 'COMP_1790610485%'
    `).all();

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO company_modules (company_id, module_name, is_enabled, updated_at)
      VALUES (?, 'browser_notifications', ?, CURRENT_TIMESTAMP)
    `);

    const transaction = db.transaction(() => {
      for (const comp of companies) {
        upsert.run(comp.id, enabledVal);
      }
    });
    transaction();

    // Firebase sync
    try {
      if (syncCompanyModules) {
        for (const comp of companies) {
          const allMods = db.prepare('SELECT module_name, is_enabled FROM company_modules WHERE company_id = ?').all(comp.id);
          const modMap = {};
          allMods.forEach(m => { modMap[m.module_name] = m.is_enabled === 1; });
          syncCompanyModules(comp.id, modMap).catch(() => {});
        }
      }
    } catch (e) {}

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Module Management',
      action: 'BROWSER_NOTIFICATIONS_BATCH_UPDATED',
      targetEntity: 'company_modules',
      newValues: { browser_notifications: enabledVal === 1 },
      reason: `Browser push notifications for all company employees and managers set to ${enabledVal === 1 ? 'ENABLED (Phone push)' : 'DISABLED (Bell icon only)'}`
    });

    res.json({
      success: true,
      is_enabled: enabledVal === 1,
      total_companies: companies.length,
      message: enabledVal === 1
        ? 'Browser & Mobile push notifications ENABLED for all company accounts. Employees and managers can receive real-time alerts on their phones.'
        : 'Browser & Mobile push notifications DISABLED for all company accounts. Employees and managers will only receive alerts inside the in-app Bell icon after login.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to batch update company notifications: ' + err.message });
  }
});

// 8. PUT /api/modules/browser_notifications/support - Toggle browser notifications for Support team
router.put('/browser_notifications/support', verifyAuth, requireRole(['super_admin']), (req, res) => {
  const { is_enabled } = req.body;
  const enabledVal = is_enabled ? 'true' : 'false';

  try {
    db.prepare(`
      INSERT INTO application_settings (setting_key, setting_value, description, updated_at)
      VALUES ('support_browser_notifications', ?, 'Allow browser push notifications for Support team', CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `).run(enabledVal);

    logAudit({
      userId: req.user.id,
      userName: req.user.username,
      role: 'super_admin',
      panel: 'Module Management',
      action: 'SUPPORT_BROWSER_NOTIFICATIONS_TOGGLED',
      targetEntity: 'application_settings',
      newValues: { support_browser_notifications: enabledVal === 'true' },
      reason: `Support team browser push notifications set to ${enabledVal === 'true' ? 'ENABLED (Phone/Web push)' : 'DISABLED (Bell icon only)'}`
    });

    res.json({
      success: true,
      is_enabled: enabledVal === 'true',
      message: enabledVal === 'true'
        ? 'Browser & Mobile push notifications ENABLED for Support Team accounts.'
        : 'Browser & Mobile push notifications DISABLED for Support Team accounts. Alerts will show only inside the in-app Bell icon after login.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update support notification setting: ' + err.message });
  }
});

module.exports = router;
