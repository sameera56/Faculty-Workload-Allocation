const express = require('express');
const { body, param } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { sendSuccess, sendError } = require('../utils/http');
const { planAllocations } = require('../services/allocationService');

const router = express.Router();

async function loadPlanInput(connection, lock = false) {
  if (lock) {
    await connection.query('SELECT id FROM faculty FOR UPDATE');
  }
  const lockSql = lock ? ' FOR UPDATE' : '';
  const [subjects] = await connection.query(`
    SELECT s.id, s.subject_code, s.name, s.department_id, s.required_specialization, s.weekly_hours,
      s.class_id
    FROM subjects s ORDER BY s.id${lockSql}
  `);
  const [faculty] = await connection.query(`
    SELECT f.id, f.name, f.department_id, f.specialization, f.max_weekly_hours,
      COALESCE(SUM(a.assigned_hours), 0) AS assigned_hours
    FROM faculty f LEFT JOIN allocations a ON a.faculty_id = f.id
    GROUP BY f.id ORDER BY f.id
  `);
  const [existingAllocations] = await connection.query('SELECT subject_id, faculty_id FROM allocations');
  const [timetable] = await connection.query('SELECT faculty_id, day_of_week, period FROM timetable_slots');
  const [availability] = await connection.query('SELECT faculty_id, day_of_week, period FROM faculty_availability');
  let slots = [];
  if (subjects.length) {
    const placeholders = subjects.map(() => '?').join(', ');
    [slots] = await connection.execute(
      `SELECT subject_id, day_of_week, period FROM subject_slots WHERE subject_id IN (${placeholders}) ORDER BY day_of_week, period`,
      subjects.map((subject) => subject.id)
    );
  }
  const slotsBySubject = new Map(subjects.map((subject) => [Number(subject.id), []]));
  for (const slot of slots) slotsBySubject.get(Number(slot.subject_id)).push(slot);
  return {
    subjects: subjects.map((subject) => ({ ...subject, slots: slotsBySubject.get(Number(subject.id)) })),
    faculty,
    existingAllocations,
    timetable,
    availability
  };
}

router.post('/preview', asyncHandler(async (req, res) => {
  const input = await loadPlanInput(db);
  return sendSuccess(res, { ...planAllocations(input), saved: false });
}));

router.post('/confirm', asyncHandler(async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const input = await loadPlanInput(connection, true);
    const plan = planAllocations(input);
    for (const allocation of plan.proposed) {
      await connection.execute(
        'INSERT INTO allocations (subject_id, faculty_id, assigned_hours) VALUES (?, ?, ?)',
        [allocation.subject_id, allocation.faculty_id, allocation.assigned_hours]
      );
      for (const slot of allocation.slots) {
        await connection.execute(`
          INSERT INTO timetable_slots (subject_id, faculty_id, class_id, day_of_week, period)
          SELECT ?, ?, class_id, ?, ? FROM subjects WHERE id = ?
        `, [allocation.subject_id, allocation.faculty_id, slot.day_of_week, slot.period, allocation.subject_id]);
      }
      await connection.execute(
        `INSERT INTO allocation_history (subject_id, faculty_id, action, changed_by, details)
         VALUES (?, ?, 'assigned', ?, ?)`,
        [allocation.subject_id, allocation.faculty_id, req.session.admin.id, JSON.stringify({ source: 'automatic' })]
      );
    }
    await connection.commit();
    return sendSuccess(res, { ...plan, saved: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.post('/manual', [
  body('subject_id').isInt({ min: 1 }),
  body('faculty_id').isInt({ min: 1 }),
  validate
], asyncHandler(async (req, res) => {
  const subjectId = Number(req.body.subject_id);
  const facultyId = Number(req.body.faculty_id);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[faculty]] = await connection.execute('SELECT * FROM faculty WHERE id = ? FOR UPDATE', [facultyId]);
    const [[subject]] = await connection.execute('SELECT * FROM subjects WHERE id = ? FOR UPDATE', [subjectId]);
    if (!subject || !faculty) {
      await connection.rollback();
      return sendError(res, !subject ? 'Subject not found.' : 'Faculty member not found.', 404);
    }
    const [slots] = await connection.execute(
      'SELECT day_of_week, period FROM subject_slots WHERE subject_id = ? ORDER BY day_of_week, period',
      [subjectId]
    );
    const [[existing]] = await connection.execute(
      'SELECT id, faculty_id, assigned_hours FROM allocations WHERE subject_id = ? FOR UPDATE',
      [subjectId]
    );
    if (Number(faculty.department_id) !== Number(subject.department_id)
        || faculty.specialization.trim().toLowerCase() !== subject.required_specialization.trim().toLowerCase()) {
      await connection.rollback();
      return sendError(res, 'Faculty member does not match the subject department and required specialization.', 422);
    }
    const [[load]] = await connection.execute(
      'SELECT COALESCE(SUM(assigned_hours), 0) AS total FROM allocations WHERE faculty_id = ? AND subject_id <> ?',
      [facultyId, subjectId]
    );
    if (Number(load.total) + Number(subject.weekly_hours) > Number(faculty.max_weekly_hours)) {
      await connection.rollback();
      return sendError(res, 'Assignment would exceed this faculty member’s maximum weekly hours.', 409);
    }
    for (const slot of slots) {
      const [[available]] = await connection.execute(
        `SELECT id FROM faculty_availability WHERE faculty_id = ? AND day_of_week = ? AND period = ?`,
        [facultyId, slot.day_of_week, slot.period]
      );
      if (!available) {
        await connection.rollback();
        return sendError(res, `Faculty member is not available on day ${slot.day_of_week}, period ${slot.period}.`, 409);
      }
      const [[conflict]] = await connection.execute(`
        SELECT id FROM timetable_slots
        WHERE day_of_week = ? AND period = ? AND subject_id <> ?
          AND (faculty_id = ? OR class_id = ?)
        LIMIT 1
      `, [slot.day_of_week, slot.period, subjectId, facultyId, subject.class_id]);
      if (conflict) {
        await connection.rollback();
        return sendError(res, `Timetable conflict on day ${slot.day_of_week}, period ${slot.period}.`, 409);
      }
    }

    await connection.execute('DELETE FROM timetable_slots WHERE subject_id = ?', [subjectId]);
    await connection.execute('DELETE FROM allocations WHERE subject_id = ?', [subjectId]);
    await connection.execute(
      'INSERT INTO allocations (subject_id, faculty_id, assigned_hours) VALUES (?, ?, ?)',
      [subjectId, facultyId, subject.weekly_hours]
    );
    for (const slot of slots) {
      await connection.execute(
        `INSERT INTO timetable_slots (subject_id, faculty_id, class_id, day_of_week, period)
         VALUES (?, ?, ?, ?, ?)`,
        [subjectId, facultyId, subject.class_id, slot.day_of_week, slot.period]
      );
    }
    await connection.execute(
      `INSERT INTO allocation_history (subject_id, faculty_id, action, changed_by, details)
       VALUES (?, ?, ?, ?, ?)`,
      [subjectId, facultyId, existing ? 'reassigned' : 'assigned', req.session.admin.id, JSON.stringify({ source: 'manual' })]
    );
    await connection.commit();
    return sendSuccess(res, { subject_id: subjectId, faculty_id: facultyId, assigned_hours: Number(subject.weekly_hours) });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

router.delete('/:subjectId', [param('subjectId').isInt({ min: 1 }), validate], asyncHandler(async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[subject]] = await connection.execute('SELECT id FROM subjects WHERE id = ? FOR UPDATE', [req.params.subjectId]);
    if (!subject) {
      await connection.rollback();
      return sendError(res, 'Subject not found.', 404);
    }
    const [[allocation]] = await connection.execute(
      'SELECT faculty_id FROM allocations WHERE subject_id = ? FOR UPDATE',
      [req.params.subjectId]
    );
    if (!allocation) {
      await connection.rollback();
      return sendError(res, 'Subject is not currently assigned.', 404);
    }
    await connection.execute('DELETE FROM timetable_slots WHERE subject_id = ?', [req.params.subjectId]);
    await connection.execute('DELETE FROM allocations WHERE subject_id = ?', [req.params.subjectId]);
    await connection.execute(
      `INSERT INTO allocation_history (subject_id, faculty_id, action, changed_by, details)
       VALUES (?, NULL, 'unassigned', ?, ?)`,
      [req.params.subjectId, req.session.admin.id, JSON.stringify({ previous_faculty_id: allocation.faculty_id })]
    );
    await connection.commit();
    return sendSuccess(res, { unassigned: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

module.exports = router;
