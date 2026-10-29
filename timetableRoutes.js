const express = require('express');
const { body, param } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { sendSuccess, sendError } = require('../utils/http');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT t.id, t.day_of_week, t.period, t.faculty_id, f.name AS faculty_name,
      t.subject_id, s.subject_code, s.name AS subject_name, t.class_id,
      c.semester, c.section, d.name AS department
    FROM timetable_slots t
    JOIN faculty f ON f.id = t.faculty_id
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes c ON c.id = t.class_id
    JOIN departments d ON d.id = c.department_id
    ORDER BY t.day_of_week, t.period, d.name
  `);
  const [availability] = await db.query(`
    SELECT fa.faculty_id, f.name AS faculty_name, fa.day_of_week, fa.period
    FROM faculty_availability fa JOIN faculty f ON f.id = fa.faculty_id
    ORDER BY f.name, fa.day_of_week, fa.period
  `);
  return sendSuccess(res, { assignments: rows, availability });
}));

router.put('/availability/:facultyId', [
  param('facultyId').isInt({ min: 1 }),
  body('slots').isArray({ max: 40 }),
  body('slots.*.day_of_week').isInt({ min: 1, max: 5 }),
  body('slots.*.period').isInt({ min: 1, max: 8 }),
  validate
], asyncHandler(async (req, res) => {
  const facultyId = Number(req.params.facultyId);
  const slots = req.body.slots;
  const keys = slots.map((slot) => `${slot.day_of_week}:${slot.period}`);
  if (new Set(keys).size !== keys.length) return sendError(res, 'Availability slots must not be duplicated.', 422);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[faculty]] = await connection.execute('SELECT id FROM faculty WHERE id = ? FOR UPDATE', [facultyId]);
    if (!faculty) {
      await connection.rollback();
      return sendError(res, 'Faculty member not found.', 404);
    }
    const [existingAssignments] = await connection.execute(`
      SELECT day_of_week, period FROM timetable_slots WHERE faculty_id = ?
    `, [facultyId]);
    const wanted = new Set(slots.map((slot) => `${slot.day_of_week}:${slot.period}`));
    const unavailableAssigned = existingAssignments.find((slot) => !wanted.has(`${slot.day_of_week}:${slot.period}`));
    if (unavailableAssigned) {
      await connection.rollback();
      return sendError(res, 'Availability cannot be removed while the faculty member is assigned in that period.', 409);
    }
    await connection.execute('DELETE FROM faculty_availability WHERE faculty_id = ?', [facultyId]);
    for (const slot of slots) {
      await connection.execute(
        'INSERT INTO faculty_availability (faculty_id, day_of_week, period) VALUES (?, ?, ?)',
        [facultyId, slot.day_of_week, slot.period]
      );
    }
    await connection.commit();
    return sendSuccess(res, { faculty_id: facultyId, slots });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;
