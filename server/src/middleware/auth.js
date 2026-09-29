const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'npb-hrms-production-super-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role_name,
      company_id: user.company_id,
      support_level: user.support_level || null
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function verifyAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists and is active in database
    const user = db.prepare(`
      SELECT u.id, u.username, u.email, u.role_id, u.company_id, u.status, u.is_deleted,
             r.name as role_name,
             s.permission_level as support_level,
             s.assigned_companies,
             e.id as employee_id, e.employee_id as employee_code,
             COALESCE(e.full_name, sa.full_name, s.full_name, u.username) as full_name,
             COALESCE(e.mobile, u.mobile, '') as mobile,
             e.department, e.designation, e.manager_id,
             e.employment_start_date, e.employment_end_date,
             c.name as company_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN support_users s ON u.id = s.user_id
      LEFT JOIN super_admins sa ON u.id = sa.user_id
      LEFT JOIN employees e ON u.id = e.user_id
      LEFT JOIN companies c ON u.company_id = c.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (!user || user.is_deleted) {
      return res.status(401).json({ error: 'User account not found or deleted.' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Your account has been temporarily disabled. Contact your administrator.' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Your account has been banned. Access denied.' });
    }

    // Check company status if user belongs to a company
    if (user.company_id) {
      const company = db.prepare('SELECT status FROM companies WHERE id = ?').get(user.company_id);
      if (!company || company.status === 'deleted') {
        return res.status(403).json({ error: 'Company portal does not exist.' });
      }
      if (company.status === 'disabled' || company.status === 'banned') {
        return res.status(403).json({ error: `Company access is currently ${company.status}. Please contact Super Admin.` });
      }
    }

    if (user && user.role_name === 'support') {
      try {
        const sRow = db.prepare("SELECT enable_ai_assistant, assigned_companies FROM support_users WHERE user_id = ?").get(user.id);
        user.enable_ai_assistant = sRow ? (sRow.enable_ai_assistant === 1) : false;
        user.assigned_companies = sRow ? (sRow.assigned_companies || 'all') : (user.assigned_companies || 'all');
        user.assignedCompanies = user.assigned_companies;
      } catch (e) {
        user.enable_ai_assistant = false;
        user.assigned_companies = user.assigned_companies || 'all';
        user.assignedCompanies = user.assigned_companies;
      }
    } else if (user) {
      user.enable_ai_assistant = undefined;
      user.assigned_companies = user.assigned_companies || 'all';
      user.assignedCompanies = user.assigned_companies;
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyAuth
};
