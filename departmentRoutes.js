const express = require('express');
const { body, param } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { sendSuccess, sendError } = require('../utils/http');

const router = express.Router();
const departmentRules = [
  body('name').trim().notEmpty().isLength({ max: 120 }),
  body('code').trim().notEmpty().isLength({ max: 20 })
];

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT d.id, d.name, d.code, COUNT(DISTINCT f.id) AS faculty_count,
      COUNT(DISTINCT s.id) AS subject_count
    FROM departments d
    LEFT JOIN faculty f ON f.department_id = d.id
    LEFT JOIN subjects s ON s.department_id = d.id
    GROUP BY d.id ORDER BY d.name
  `);
  return sendSuccess(res, rows);
}));

router.post('/', departmentRules, validate, asyncHandler(async (req, res) => {
  const [result] = await db.execute('INSERT INTO departments (name, code) VALUES (?, ?)', [req.body.name, req.body.code]);
  return sendSuccess(res, { id: result.insertId, name: req.body.name, code: req.body.code }, 201);
}));

router.put('/:id', [param('id').isInt({ min: 1 }), ...departmentRules, validate], asyncHandler(async (req, res) => {
  const [[existing]] = await db.execute('SELECT id FROM departments WHERE id = ?', [req.params.id]);
  if (!existing) return sendError(res, 'Department not found.', 404);
  const [result] = await db.execute(
    'UPDATE departments SET name = ?, code = ? WHERE id = ?',
    [req.body.name, req.body.code, req.params.id]
  );
  return sendSuccess(res, { id: Number(req.params.id), name: req.body.name, code: req.body.code });
}));

router.delete('/:id', [param('id').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const [result] = await db.execute('DELETE FROM departments WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return sendError(res, 'Department not found.', 404);
  return sendSuccess(res, { deleted: true });
}));

router.get('/classes', asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT c.*, d.name AS department, d.code AS department_code
    FROM classes c JOIN departments d ON d.id = c.department_id
    ORDER BY d.name, c.semester, c.section
  `);
  return sendSuccess(res, rows);
}));

router.post('/classes', [
  body('department_id').isInt({ min: 1 }),
  body('semester').isInt({ min: 1, max: 8 }),
  body('section').trim().notEmpty().isLength({ max: 20 }),
  body('academic_year').matches(/^\d{4}-\d{4}$/),
  validate
], asyncHandler(async (req, res) => {
  const { department_id, semester, section, academic_year } = req.body;
  const [result] = await db.execute(
    'INSERT INTO classes (department_id, semester, section, academic_year) VALUES (?, ?, ?, ?)',
    [department_id, semester, section, academic_year]
  );
  return sendSuccess(res, { id: result.insertId, department_id, semester, section, academic_year }, 201);
}));

router.put('/classes/:id', [
  param('id').isInt({ min: 1 }),
  body('department_id').isInt({ min: 1 }),
  body('semester').isInt({ min: 1, max: 8 }),
  body('section').trim().notEmpty().isLength({ max: 20 }),
  body('academic_year').matches(/^\d{4}-\d{4}$/),
  validate
], asyncHandler(async (req, res) => {
  const { department_id, semester, section, academic_year } = req.body;
  const [[existing]] = await db.execute('SELECT id, department_id FROM classes WHERE id = ?', [req.params.id]);
  if (!existing) return sendError(res, 'Class or section not found.', 404);
  if (Number(existing.department_id) !== Number(department_id)) {
    const [[usage]] = await db.execute('SELECT COUNT(*) AS count FROM subjects WHERE class_id = ?', [req.params.id]);
    if (Number(usage.count)) {
      return sendError(res, 'A class used by subjects cannot be moved to another department.', 409);
    }
  }
  const [result] = await db.execute(
    'UPDATE classes SET department_id = ?, semester = ?, section = ?, academic_year = ? WHERE id = ?',
    [department_id, semester, section, academic_year, req.params.id]
  );
  return sendSuccess(res, { id: Number(req.params.id), department_id, semester, section, academic_year });
}));

router.delete('/classes/:id', [param('id').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const [result] = await db.execute('DELETE FROM classes WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return sendError(res, 'Class or section not found.', 404);
  return sendSuccess(res, { deleted: true });
}));

module.exports = router;
