function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Authentication required.' });
    }

    if (allowedRoles.includes(req.user.role_name)) {
      return next();
    }

    return res.status(403).json({
      error: `Access Denied: Role '${req.user.role_name}' is not authorized to access this resource.`
    });
  };
}

function requireSupportLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    if (req.user.role_name === 'super_admin') {
      return next();
    }

    if (req.user.role_name === 'support') {
      if ((req.user.support_level || 0) >= minLevel) {
        return next();
      }
      return res.status(403).json({
        error: `Insufficient Support privileges. Required Level: ${minLevel}, your Level: ${req.user.support_level || 1}`
      });
    }

    return res.status(403).json({ error: 'Support or Super Admin access required.' });
  };
}

function getTenantCompanyId(req) {
  if (!req.user) return null;
  if (req.user.role_name === 'super_admin' || req.user.role_name === 'support') {
    return req.query?.company_id || req.body?.company_id || req.params?.company_id || req.user.company_id || null;
  }
  return req.user.company_id;
}

module.exports = {
  requireRole,
  requireSupportLevel,
  getTenantCompanyId
};
