USE faculty_workload;

INSERT IGNORE INTO departments (name, code) VALUES
  ('Computer Applications', 'MCA'),
  ('Computer Science', 'CSE'),
  ('Information Technology', 'IT');

INSERT IGNORE INTO classes (department_id, semester, section, academic_year)
SELECT id, 1, 'A', '2026-2027' FROM departments WHERE code = 'MCA';
INSERT IGNORE INTO classes (department_id, semester, section, academic_year)
SELECT id, 3, 'A', '2026-2027' FROM departments WHERE code = 'MCA';
INSERT IGNORE INTO classes (department_id, semester, section, academic_year)
SELECT id, 5, 'B', '2026-2027' FROM departments WHERE code = 'CSE';

INSERT IGNORE INTO faculty
  (faculty_code, name, email, department_id, designation, specialization, max_weekly_hours)
SELECT 'FAC-101', 'Dr. Asha Menon', 'asha.menon@college.edu', id, 'Associate Professor', 'Database Systems', 18
FROM departments WHERE code = 'MCA';
INSERT IGNORE INTO faculty
  (faculty_code, name, email, department_id, designation, specialization, max_weekly_hours)
SELECT 'FAC-102', 'Prof. Rohan Shah', 'rohan.shah@college.edu', id, 'Assistant Professor', 'Web Development', 16
FROM departments WHERE code = 'MCA';
INSERT IGNORE INTO faculty
  (faculty_code, name, email, department_id, designation, specialization, max_weekly_hours)
SELECT 'FAC-103', 'Dr. Kavita Rao', 'kavita.rao@college.edu', id, 'Associate Professor', 'Data Science', 18
FROM departments WHERE code = 'CSE';

INSERT IGNORE INTO subjects
  (subject_code, name, department_id, class_id, required_specialization, weekly_hours)
SELECT 'MCA101', 'Database Management Systems', d.id, c.id, 'Database Systems', 4
FROM departments d JOIN classes c ON c.department_id = d.id AND c.semester = 1
WHERE d.code = 'MCA';
INSERT IGNORE INTO subjects
  (subject_code, name, department_id, class_id, required_specialization, weekly_hours)
SELECT 'MCA302', 'Full Stack Web Development', d.id, c.id, 'Web Development', 5
FROM departments d JOIN classes c ON c.department_id = d.id AND c.semester = 3
WHERE d.code = 'MCA';
INSERT IGNORE INTO subjects
  (subject_code, name, department_id, class_id, required_specialization, weekly_hours)
SELECT 'CSE505', 'Applied Data Science', d.id, c.id, 'Data Science', 4
FROM departments d JOIN classes c ON c.department_id = d.id AND c.semester = 5
WHERE d.code = 'CSE';

INSERT IGNORE INTO subject_slots (subject_id, day_of_week, period)
SELECT id, 1, 1 FROM subjects WHERE subject_code = 'MCA101';
INSERT IGNORE INTO subject_slots (subject_id, day_of_week, period)
SELECT id, 2, 2 FROM subjects WHERE subject_code = 'MCA101';
INSERT IGNORE INTO subject_slots (subject_id, day_of_week, period)
SELECT id, 3, 3 FROM subjects WHERE subject_code = 'MCA101';
INSERT IGNORE INTO subject_slots (subject_id, day_of_week, period)
SELECT id, 4, 4 FROM subjects WHERE subject_code = 'MCA101';

INSERT IGNORE INTO faculty_availability (faculty_id, day_of_week, period)
SELECT f.id, d.day_of_week, p.period
FROM faculty f
JOIN (SELECT 1 day_of_week UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) d
JOIN (SELECT 1 period UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8) p
WHERE f.faculty_code IN ('FAC-101', 'FAC-102', 'FAC-103');
