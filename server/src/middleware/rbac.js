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
      const rawLvl = req.user.permission_level ?? req.user.permissionLevel ?? req.user.support_level ?? req.user.supportLevel ?? 1;
      let userLvl = 1;
      if (typeof rawLvl === 'number') {
        userLvl = rawLvl;
      } else {
        const digits = String(rawLvl).replace(/\D/g, '');
        userLvl = digits ? parseInt(digits, 10) : 1;
      }
      if (userLvl >= minLevel) {
        return next();
      }
      return res.status(403).json({
        error: `Insufficient Support privileges. Required Level: ${minLevel}, your Level: ${userLvl}`
      });
    }

    return res.status(403).json({ error: 'Support or Super Admin access required.' });
  };
}

function parseSupportAssignedCompanies(user) {
  if (!user || user.role_name === 'super_admin') return 'all';
  if (user.role_name !== 'support') {
    return user.company_id ? [parseInt(user.company_id, 10)] : [];
  }
  const raw = user.assigned_companies || user.assignedCompanies;
  if (!raw || raw === 'all' || raw === '*' || raw === 'ALL') return 'all';
  if (Array.isArray(raw)) {
    const list = raw.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
    return list.length > 0 ? list : 'all';
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
        return list.length > 0 ? list : 'all';
      }
    } catch (e) {}
    const list = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    return list.length > 0 ? list : 'all';
  }
  return 'all';
}

function isCompanyAuthorized(user, companyId) {
  if (!user) return false;
  if (user.role_name === 'super_admin') return true;
  const auth = parseSupportAssignedCompanies(user);
  if (auth === 'all') return true;
  if (!companyId) return false;
  return auth.includes(parseInt(companyId, 10));
}

function getTenantCompanyId(req) {
  if (!req.user) return null;
  if (req.user.role_name === 'super_admin') {
    return req.query?.company_id || req.body?.company_id || req.params?.company_id || req.user.company_id || null;
  }
  if (req.user.role_name === 'support') {
    const auth = parseSupportAssignedCompanies(req.user);
    const requested = req.query?.company_id || req.body?.company_id || req.params?.company_id || null;
    if (requested && requested !== 'all') {
      const reqId = parseInt(requested, 10);
      if (auth !== 'all' && !auth.includes(reqId)) {
        return -999999; // Denied: return dummy non-existent ID
      }
      return reqId;
    }
    if (auth !== 'all' && Array.isArray(auth) && auth.length === 1) {
      return auth[0];
    }
    return null;
  }
  return req.user.company_id;
}

module.exports = {
  requireRole,
  requireSupportLevel,
  getTenantCompanyId,
  parseSupportAssignedCompanies,
  isCompanyAuthorized
};
