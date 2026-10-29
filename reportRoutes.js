const express = require('express');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');

const router = express.Router();
const reportHeaders = {
  faculty: ['faculty_code', 'faculty_name', 'department', 'designation', 'specialization', 'max_weekly_hours', 'assigned_hours', 'remaining_hours', 'utilization_percent'],
  department: ['code', 'department', 'faculty_count', 'subject_count', 'assigned_hours', 'unassigned_subjects'],
  subject: ['subject_code', 'subject_name', 'department', 'semester', 'section', 'required_specialization', 'weekly_hours', 'faculty_name', 'assigned_hours', 'status']
};

async function reportData(type) {
  if (type === 'faculty') {
    const [rows] = await db.query(`
      SELECT f.faculty_code, f.name AS faculty_name, d.name AS department, f.designation,
        f.specialization, f.max_weekly_hours,
        COALESCE(SUM(a.assigned_hours), 0) AS assigned_hours,
        f.max_weekly_hours - COALESCE(SUM(a.assigned_hours), 0) AS remaining_hours,
        ROUND(COALESCE(SUM(a.assigned_hours), 0) * 100 / f.max_weekly_hours, 1) AS utilization_percent
      FROM faculty f JOIN departments d ON d.id = f.department_id
      LEFT JOIN allocations a ON a.faculty_id = f.id GROUP BY f.id ORDER BY d.name, f.name
    `);
    return rows;
  }
  if (type === 'department') {
    const [rows] = await db.query(`
      SELECT d.code, d.name AS department,
        (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id) AS faculty_count,
        (SELECT COUNT(*) FROM subjects s WHERE s.department_id = d.id) AS subject_count,
        (SELECT COALESCE(SUM(a.assigned_hours), 0) FROM subjects s
          JOIN allocations a ON a.subject_id = s.id WHERE s.department_id = d.id) AS assigned_hours,
        (SELECT COUNT(*) FROM subjects s LEFT JOIN allocations a ON a.subject_id = s.id
          WHERE s.department_id = d.id AND a.id IS NULL) AS unassigned_subjects
      FROM departments d ORDER BY d.name
    `);
    return rows;
  }
  const [rows] = await db.query(`
    SELECT s.subject_code, s.name AS subject_name, d.name AS department,
      c.semester, c.section, s.required_specialization, s.weekly_hours,
      f.name AS faculty_name, a.assigned_hours,
      CASE WHEN a.id IS NULL THEN 'Pending' ELSE 'Assigned' END AS status
    FROM subjects s JOIN departments d ON d.id = s.department_id
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN allocations a ON a.subject_id = s.id
    LEFT JOIN faculty f ON f.id = a.faculty_id
    ORDER BY d.name, c.semester, s.subject_code
  `);
  return rows;
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

router.get('/:type.csv', asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (!['faculty', 'department', 'subject'].includes(type)) {
    return res.status(400).json({ success: false, error: { message: 'Report type must be faculty, department, or subject.' } });
  }
  const rows = await reportData(type);
  const headers = reportHeaders[type];
  const csv = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\r\n');
  res.type('text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  return res.send(`\uFEFF${csv}`);
}));

router.get('/:type', asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (!['faculty', 'department', 'subject'].includes(type)) {
    return res.status(400).json({ success: false, error: { message: 'Report type must be faculty, department, or subject.' } });
  }
  return sendSuccess(res, await reportData(type));
}));

router.get('/conflicts/summary', asyncHandler(async (req, res) => {
  const [conflicts] = await db.query(`
    SELECT t.day_of_week, t.period, t.faculty_id, f.name AS faculty_name,
      COUNT(*) AS assignment_count,
      GROUP_CONCAT(s.subject_code ORDER BY s.subject_code SEPARATOR ', ') AS subjects
    FROM timetable_slots t
    JOIN faculty f ON f.id = t.faculty_id
    JOIN subjects s ON s.id = t.subject_id
    GROUP BY t.day_of_week, t.period, t.faculty_id
    HAVING COUNT(*) > 1
  `);
  const [unassigned] = await db.query(`
    SELECT s.id, s.subject_code, s.name, s.weekly_hours, d.name AS department
    FROM subjects s JOIN departments d ON d.id = s.department_id
    LEFT JOIN allocations a ON a.subject_id = s.id
    WHERE a.id IS NULL ORDER BY d.name, s.subject_code
  `);
  return sendSuccess(res, { conflicts, unassigned });
}));

module.exports = router;
