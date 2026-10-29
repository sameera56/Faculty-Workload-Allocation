const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/http');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return sendError(res, 'Email and password are required.', 422);
  }
  const [admins] = await db.execute(
    'SELECT id, name, email, password_hash FROM admins WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()]
  );
  const admin = admins[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    return sendError(res, 'Invalid email or password.', 401);
  }
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.admin = { id: admin.id, name: admin.name, email: admin.email };
  return sendSuccess(res, req.session.admin);
}));

router.get('/me', (req, res) => {
  if (!req.session.admin) return sendError(res, 'Administrator login required.', 401);
  return sendSuccess(res, req.session.admin);
});

router.post('/logout', (req, res, next) => {
  if (!req.session) return sendSuccess(res, { logged_out: true });
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('faculty.sid', { httpOnly: true, sameSite: 'lax' });
    return sendSuccess(res, { logged_out: true });
  });
});

module.exports = router;
