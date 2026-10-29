const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { sendSuccess, sendError } = require('../utils/http');
const { getWorkload } = require('../services/workloadService');

const router = express.Router();
const facultyRules = [
  body('faculty_code').trim().notEmpty().isLength({ max: 30 }),
  body('name').trim().notEmpty().isLength({ max: 120 }),
  body('email').trim().isEmail().isLength({ max: 190 }),
  body('department_id').isInt({ min: 1 }),
  body('designation').trim().notEmpty().isLength({ max: 100 }),
  body('specialization').trim().notEmpty().isLength({ max: 120 }),
  body('max_weekly_hours').isInt({ min: 1, max: 40 })
];

router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('department_id').optional().isInt({ min: 1 }),
  query('sort').optional().isIn(['name', 'faculty_code', 'department', 'assigned_hours', 'utilization']),
  query('order').optional().isIn(['asc', 'desc']),
  validate
], asyncHandler(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const offset = (page - 1) * limit;
  const search = `%${String(req.query.search || '').trim()}%`;
  const departmentId = req.query.department_id ? Number(req.query.department_id) : null;
  const sortColumns = {
    name: 'f.name',
    faculty_code: 'f.faculty_code',
    department: 'd.name',
    assigned_hours: 'COALESCE(w.assigned_hours, 0)',
    utilization: 'COALESCE(w.assigned_hours, 0) / f.max_weekly_hours'
  };
  const orderBy = sortColumns[req.query.sort] || sortColumns.name;
  const direction = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const [rows] = await db.execute(`
    SELECT f.*, d.name AS department,
      COALESCE(w.assigned_hours, 0) AS assigned_hours,
      f.max_weekly_hours - COALESCE(w.assigned_hours, 0) AS remaining_hours,
      ROUND(COALESCE(w.assigned_hours, 0) * 100 / f.max_weekly_hours, 1) AS utilization_percent
    FROM faculty f JOIN departments d ON d.id = f.department_id
    LEFT JOIN (SELECT faculty_id, SUM(assigned_hours) AS assigned_hours FROM allocations GROUP BY faculty_id) w
      ON w.faculty_id = f.id
    WHERE (f.name LIKE ? OR f.faculty_code LIKE ? OR f.email LIKE ? OR f.specialization LIKE ?)
      AND (? IS NULL OR f.department_id = ?)
    ORDER BY ${orderBy} ${direction}, f.id LIMIT ? OFFSET ?
  `, [search, search, search, search, departmentId, departmentId, limit, offset]);
  const [[{ total }]] = await db.execute(`
    SELECT COUNT(*) AS total FROM faculty f
    WHERE (f.name LIKE ? OR f.faculty_code LIKE ? OR f.email LIKE ? OR f.specialization LIKE ?)
      AND (? IS NULL OR f.department_id = ?)
  `, [search, search, search, search, departmentId, departmentId]);
  return sendSuccess(res, rows, 200, { page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get('/:id', [param('id').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const [rows] = await db.execute(`
    SELECT f.*, d.name AS department,
      COALESCE(SUM(a.assigned_hours), 0) AS assigned_hours,
      f.max_weekly_hours - COALESCE(SUM(a.assigned_hours), 0) AS remaining_hours
    FROM faculty f JOIN departments d ON d.id = f.department_id
    LEFT JOIN allocations a ON a.faculty_id = f.id
    WHERE f.id = ? GROUP BY f.id
  `, [req.params.id]);
  if (!rows[0]) return sendError(res, 'Faculty member not found.', 404);
  const [subjects] = await db.execute(`
    SELECT s.id, s.subject_code, s.name, a.assigned_hours
    FROM allocations a JOIN subjects s ON s.id = a.subject_id WHERE a.faculty_id = ?
  `, [req.params.id]);
  return sendSuccess(res, { ...rows[0], subjects });
}));

router.post('/', facultyRules, validate, asyncHandler(async (req, res) => {
  const { faculty_code, name, email, department_id, designation, specialization, max_weekly_hours } = req.body;
  const [result] = await db.execute(
    `INSERT INTO faculty (faculty_code, name, email, department_id, designation, specialization, max_weekly_hours)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [faculty_code, name, email.toLowerCase(), department_id, designation, specialization, max_weekly_hours]
  );
  const [created] = await db.execute('SELECT * FROM faculty WHERE id = ?', [result.insertId]);
  return sendSuccess(res, created[0], 201);
}));

router.put('/:id', [param('id').isInt({ min: 1 }), ...facultyRules, validate], asyncHandler(async (req, res) => {
  const { faculty_code, name, email, department_id, designation, specialization, max_weekly_hours } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[faculty]] = await connection.execute('SELECT id FROM faculty WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!faculty) {
      await connection.rollback();
      return sendError(res, 'Faculty member not found.', 404);
    }
    const [[load]] = await connection.execute(
      'SELECT COALESCE(SUM(assigned_hours), 0) AS assigned_hours FROM allocations WHERE faculty_id = ?',
      [req.params.id]
    );
    if (Number(max_weekly_hours) < Number(load.assigned_hours)) {
      await connection.rollback();
      return sendError(res, 'Maximum hours cannot be lower than this faculty member’s current assigned workload.', 409);
    }
    const [[incompatible]] = await connection.execute(`
      SELECT COUNT(*) AS count
      FROM allocations a JOIN subjects s ON s.id = a.subject_id
      WHERE a.faculty_id = ?
        AND (s.department_id <> ? OR LOWER(s.required_specialization) <> LOWER(?))
    `, [req.params.id, department_id, specialization]);
    if (Number(incompatible.count) > 0) {
      await connection.rollback();
      return sendError(res, 'Department or specialization cannot be changed while assigned subjects would become ineligible.', 409);
    }
    await connection.execute(
      `UPDATE faculty SET faculty_code = ?, name = ?, email = ?, department_id = ?,
        designation = ?, specialization = ?, max_weekly_hours = ? WHERE id = ?`,
      [faculty_code, name, email.toLowerCase(), department_id, designation, specialization, max_weekly_hours, req.params.id]
    );
    const [updated] = await connection.execute('SELECT * FROM faculty WHERE id = ?', [req.params.id]);
    await connection.commit();
    return sendSuccess(res, updated[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/:id', [param('id').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const [result] = await db.execute('DELETE FROM faculty WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return sendError(res, 'Faculty member not found.', 404);
  return sendSuccess(res, { deleted: true });
}));

router.get('/workload/summary', asyncHandler(async (req, res) => sendSuccess(res, await getWorkload())));

module.exports = router;
