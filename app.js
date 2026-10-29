require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const db = require('./config/db');
const { requireAuth } = require('./middleware/authMiddleware');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const MySQLStore = MySQLStoreFactory(session);
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production requires a SESSION_SECRET with at least 32 characters.');
}
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'faculty_workload',
  createDatabaseTable: true,
  clearExpired: true,
  checkExpirationInterval: 900000
});
app.locals.sessionStore = sessionStore;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'faculty.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-me',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/faculty', requireAuth, facultyRoutes);
app.use('/api/departments', requireAuth, departmentRoutes);
app.use('/api/subjects', requireAuth, subjectRoutes);
app.use('/api/allocations', requireAuth, allocationRoutes);
app.use('/api/timetable', requireAuth, timetableRoutes);
app.use('/api/reports', requireAuth, reportRoutes);

app.get('/api/health', async (req, res, next) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok' } });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((req, res) => res.status(404).json({ success: false, error: { message: 'Route not found.' } }));
app.use(errorHandler);

module.exports = app;
