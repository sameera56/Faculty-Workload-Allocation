const db = require('../config/db');

async function getWorkload(connection = db) {
  const [rows] = await connection.query(`
    SELECT f.id, f.faculty_code, f.name, f.email, f.department_id, d.name AS department,
      f.designation, f.specialization, f.max_weekly_hours,
      COALESCE(SUM(a.assigned_hours), 0) AS assigned_hours,
      f.max_weekly_hours - COALESCE(SUM(a.assigned_hours), 0) AS remaining_hours,
      ROUND(COALESCE(SUM(a.assigned_hours), 0) * 100 / f.max_weekly_hours, 1) AS utilization_percent
    FROM faculty f
    JOIN departments d ON d.id = f.department_id
    LEFT JOIN allocations a ON a.faculty_id = f.id
    GROUP BY f.id
    ORDER BY f.name
  `);
  return rows;
}

module.exports = { getWorkload };
