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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists and is active in database
    const user = db.prepare(`
      SELECT u.id, u.username, u.email, u.role_id, u.company_id, u.status, u.is_deleted,
             r.name as role_name,
             s.permission_level as support_level,
             e.id as employee_id, e.employee_id as employee_code,
             COALESCE(e.full_name, sa.full_name, s.full_name, u.username) as full_name,
             COALESCE(e.mobile, u.mobile, '') as mobile,
             e.department, e.designation, e.manager_id,
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
