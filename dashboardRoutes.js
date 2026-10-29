const express = require('express');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const { getWorkload } = require('../services/workloadService');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const [counts] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM faculty) AS total_faculty,
      (SELECT COUNT(*) FROM subjects) AS total_subjects,
      (SELECT COUNT(*) FROM departments) AS total_departments,
      (SELECT COALESCE(SUM(assigned_hours), 0) FROM allocations) AS assigned_hours,
      (SELECT COUNT(*) FROM subjects s LEFT JOIN allocations a ON a.subject_id = s.id WHERE a.id IS NULL) AS pending_subjects,
      (SELECT COUNT(*) FROM faculty f
        WHERE f.max_weekly_hours > COALESCE(
          (SELECT SUM(a.assigned_hours) FROM allocations a WHERE a.faculty_id = f.id), 0
        )) AS faculty_with_capacity,
      (SELECT COUNT(*) FROM faculty f
        WHERE f.max_weekly_hours <= COALESCE(
          (SELECT SUM(a.assigned_hours) FROM allocations a WHERE a.faculty_id = f.id), 0
        )) AS faculty_at_limit
  `);
  const workload = await getWorkload();
  const [recent] = await db.query(`
    SELECT h.id, h.action, h.created_at, s.subject_code, s.name AS subject_name,
      f.name AS faculty_name
    FROM allocation_history h
    JOIN subjects s ON s.id = h.subject_id
    LEFT JOIN faculty f ON f.id = h.faculty_id
    ORDER BY h.created_at DESC LIMIT 8
  `);
  const [departments] = await db.query(`
    SELECT d.id, d.name, COALESCE(SUM(a.assigned_hours), 0) AS assigned_hours
    FROM departments d
    LEFT JOIN subjects s ON s.department_id = d.id
    LEFT JOIN allocations a ON a.subject_id = s.id
    GROUP BY d.id ORDER BY d.name
  `);
  return sendSuccess(res, {
    summary: counts[0],
    workload,
    departments,
    recent_activity: recent
  });
}));

module.exports = router;
