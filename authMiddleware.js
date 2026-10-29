const { sendError } = require('../utils/http');

function requireAuth(req, res, next) {
  if (!req.session.admin) return sendError(res, 'Administrator login required.', 401);
  next();
}

module.exports = { requireAuth };
