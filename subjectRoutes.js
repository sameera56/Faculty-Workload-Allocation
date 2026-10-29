const express = require('express');
const { body, param } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { sendSuccess, sendError } = require('../utils/http');

const router = express.Router();
const subjectRules = [
  body('subject_code').trim().notEmpty().isLength({ max: 30 }),
  body('name').trim().notEmpty().isLength({ max: 160 }),
  body('department_id').isInt({ min: 1 }),
  body('class_id').isInt({ min: 1 }),
  body('required_specialization').trim().notEmpty().isLength({ max: 120 }),
  body('weekly_hours').isInt({ min: 1, max: 20 })
];
const slotRules = [
  body('slots').isArray({ max: 20 }),
  body('slots.*.day_of_week').isInt({ min: 1, max: 5 }),
  body('slots.*.period').isInt({ min: 1, max: 8 })
];

router.get('/', asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT s.*, d.name AS department, c.semester, c.section, c.academic_year,
      f.name AS faculty_name, a.assigned_hours
    FROM subjects s JOIN departments d ON d.id = s.department_id
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN allocations a ON a.subject_id = s.id
    LEFT JOIN faculty f ON f.id = a.faculty_id
    ORDER BY c.semester, s.subject_code
  `);
  const slotsBySubject = new Map(rows.map((row) => [Number(row.id), []]));
  if (rows.length) {
    const placeholders = rows.map(() => '?').join(', ');
    const [slots] = await db.execute(
      `SELECT subject_id, day_of_week, period FROM subject_slots WHERE subject_id IN (${placeholders}) ORDER BY day_of_week, period`,
      rows.map((row) => row.id)
    );
    for (const slot of slots) slotsBySubject.get(Number(slot.subject_id)).push(slot);
  }
  return sendSuccess(res, rows.map((row) => ({ ...row, slots: slotsBySubject.get(Number(row.id)) })));
}));

router.get('/:id/eligible', [param('id').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const [[subject]] = await db.execute(`
    SELECT s.id, s.department_id, s.required_specialization, s.weekly_hours
    FROM subjects s WHERE s.id = ?
  `, [req.params.id]);
  if (!subject) return sendError(res, 'Subject not found.', 404);
  const [slots] = await db.execute(
    'SELECT day_of_week, period FROM subject_slots WHERE subject_id = ? ORDER BY day_of_week, period',
    [req.params.id]
  );
  const [faculty] = await db.execute(`
    SELECT f.id, f.name, f.designation, f.specialization, f.max_weekly_hours,
      COALESCE(SUM(CASE WHEN a.subject_id <> ? THEN a.assigned_hours ELSE 0 END), 0) AS assigned_hours
    FROM faculty f LEFT JOIN allocations a ON a.faculty_id = f.id
    WHERE f.department_id = ? AND LOWER(f.specialization) = LOWER(?)
    GROUP BY f.id ORDER BY f.name
  `, [req.params.id, subject.department_id, subject.required_specialization]);
  const candidates = [];
  for (const person of faculty) {
    let reason = null;
    if (Number(person.max_weekly_hours) - Number(person.assigned_hours) < Number(subject.weekly_hours)) {
      reason = 'Would exceed maximum weekly hours.';
    }
    if (!reason && slots.length) {
      for (const slot of slots) {
        const [[available]] = await db.execute(
          'SELECT id FROM faculty_availability WHERE faculty_id = ? AND day_of_week = ? AND period = ?',
          [person.id, slot.day_of_week, slot.period]
        );
        if (!available) {
          reason = `Unavailable on day ${slot.day_of_week}, period ${slot.period}.`;
          break;
        }
        const [[conflict]] = await db.execute(`
          SELECT id FROM timetable_slots
          WHERE day_of_week = ? AND period = ? AND subject_id <> ?
            AND (faculty_id = ? OR class_id = (SELECT class_id FROM subjects WHERE id = ?))
          LIMIT 1
        `, [slot.day_of_week, slot.period, req.params.id, person.id, req.params.id]);
        if (conflict) {
          reason = `Timetable conflict on day ${slot.day_of_week}, period ${slot.period}.`;
          break;
        }
      }
    }
    candidates.push({
      ...person,
      remaining_hours: Number(person.max_weekly_hours) - Number(person.assigned_hours),
      utilization_percent: Math.round(Number(person.assigned_hours) * 1000 / Number(person.max_weekly_hours)) / 10,
      eligible: !reason,
      reason
    });
  }
  return sendSuccess(res, candidates);
}));

router.post('/', subjectRules, validate, asyncHandler(async (req, res) => {
  const { subject_code, name, department_id, class_id, required_specialization, weekly_hours } = req.body;
  const [[classRecord]] = await db.execute('SELECT department_id FROM classes WHERE id = ?', [class_id]);
  if (!classRecord || Number(classRecord.department_id) !== Number(department_id)) {
    return sendError(res, 'The selected class must belong to the selected department.', 422);
  }
  const [result] = await db.execute(
    `INSERT INTO subjects (subject_code, name, department_id, class_id, required_specialization, weekly_hours)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [subject_code, name, department_id, class_id, required_specialization, weekly_hours]
  );
  return sendSuccess(res, { id: result.insertId, ...req.body }, 201);
}));

router.put('/:id', [param('id').isInt({ min: 1 }), ...subjectRules, validate], asyncHandler(async (req, res) => {
  const { subject_code, name, department_id, class_id, required_specialization, weekly_hours } = req.body;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[currentSubject]] = await connection.execute(
      'SELECT department_id, required_specialization, class_id FROM subjects WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!currentSubject) {
      await connection.rollback();
      return sendError(res, 'Subject not found.', 404);
    }
    const [[classRecord]] = await connection.execute('SELECT department_id FROM classes WHERE id = ?', [class_id]);
    if (!classRecord || Number(classRecord.department_id) !== Number(department_id)) {
      await connection.rollback();
      return sendError(res, 'The selected class must belong to the selected department.', 422);
    }
    const [[allocation]] = await connection.execute(
      'SELECT assigned_hours FROM allocations WHERE subject_id = ? FOR UPDATE',
      [req.params.id]
    );
    if (allocation && (
      Number(weekly_hours) !== Number(allocation.assigned_hours)
      || Number(department_id) !== Number(currentSubject.department_id)
      || String(required_specialization).trim().toLowerCase() !== String(currentSubject.required_specialization).trim().toLowerCase()
      || Number(class_id) !== Number(currentSubject.class_id)
    )) {
      await connection.rollback();
      return sendError(res, 'Unassign this subject before changing its hours, department, specialization, or class.', 409);
    }
    await connection.execute(
      `UPDATE subjects SET subject_code = ?, name = ?, department_id = ?, class_id = ?,
        required_specialization = ?, weekly_hours = ? WHERE id = ?`,
      [subject_code, name, department_id, class_id, required_specialization, weekly_hours, req.params.id]
    );
    await connection.commit();
    return sendSuccess(res, { id: Number(req.params.id), ...req.body });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/:id', [param('id').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const [result] = await db.execute('DELETE FROM subjects WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return sendError(res, 'Subject not found.', 404);
  return sendSuccess(res, { deleted: true });
}));

router.put('/:id/slots', [param('id').isInt({ min: 1 }), ...slotRules, validate], asyncHandler(async (req, res) => {
  const subjectId = Number(req.params.id);
  const slots = req.body.slots;
  const keys = slots.map((slot) => `${slot.day_of_week}:${slot.period}`);
  if (new Set(keys).size !== keys.length) return sendError(res, 'Timetable slots must not be duplicated.', 422);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[subject]] = await connection.execute('SELECT id, class_id, weekly_hours FROM subjects WHERE id = ? FOR UPDATE', [subjectId]);
    if (!subject) {
      await connection.rollback();
      return sendError(res, 'Subject not found.', 404);
    }
    const [[allocated]] = await connection.execute('SELECT id FROM allocations WHERE subject_id = ?', [subjectId]);
    if (allocated) {
      await connection.rollback();
      return sendError(res, 'Unassign this subject before changing its timetable slots.', 409);
    }
    if (slots.length && slots.length !== Number(subject.weekly_hours)) {
      await connection.rollback();
      return sendError(res, 'Choose either no timetable slots or one slot for each weekly teaching hour.', 422);
    }
    await connection.execute('SELECT id FROM classes WHERE id = ? FOR UPDATE', [subject.class_id]);
    for (const slot of slots) {
      const [[conflict]] = await connection.execute(`
        SELECT s.id FROM subject_slots ss JOIN subjects s ON s.id = ss.subject_id
        WHERE s.class_id = ? AND ss.day_of_week = ? AND ss.period = ? AND s.id <> ? LIMIT 1
      `, [subject.class_id, slot.day_of_week, slot.period, subjectId]);
      if (conflict) {
        await connection.rollback();
        return sendError(res, `That class already has a subject in day ${slot.day_of_week}, period ${slot.period}.`, 409);
      }
    }
    await connection.execute('DELETE FROM subject_slots WHERE subject_id = ?', [subjectId]);
    for (const slot of slots) {
      await connection.execute(
        'INSERT INTO subject_slots (subject_id, day_of_week, period) VALUES (?, ?, ?)',
        [subjectId, slot.day_of_week, slot.period]
      );
    }
    await connection.commit();
    return sendSuccess(res, { subject_id: subjectId, slots });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;
