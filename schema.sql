CREATE DATABASE IF NOT EXISTS faculty_workload
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE faculty_workload;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_department_name (name),
  UNIQUE KEY uq_department_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS classes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id INT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  section VARCHAR(20) NOT NULL,
  academic_year VARCHAR(9) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_term (department_id, semester, section, academic_year),
  CONSTRAINT fk_class_department FOREIGN KEY (department_id)
    REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_class_semester CHECK (semester BETWEEN 1 AND 8)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculty (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  faculty_code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  designation VARCHAR(100) NOT NULL,
  specialization VARCHAR(120) NOT NULL,
  max_weekly_hours TINYINT UNSIGNED NOT NULL DEFAULT 18,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_faculty_code (faculty_code),
  UNIQUE KEY uq_faculty_email (email),
  KEY ix_faculty_department (department_id),
  CONSTRAINT fk_faculty_department FOREIGN KEY (department_id)
    REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_faculty_max_hours CHECK (max_weekly_hours BETWEEN 1 AND 40)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculty_availability (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  faculty_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  period TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_faculty_availability (faculty_id, day_of_week, period),
  CONSTRAINT fk_availability_faculty FOREIGN KEY (faculty_id)
    REFERENCES faculty(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_availability_day CHECK (day_of_week BETWEEN 1 AND 5),
  CONSTRAINT chk_availability_period CHECK (period BETWEEN 1 AND 8)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_code VARCHAR(30) NOT NULL,
  name VARCHAR(160) NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  required_specialization VARCHAR(120) NOT NULL,
  weekly_hours TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subject_code (subject_code),
  KEY ix_subject_department (department_id),
  CONSTRAINT fk_subject_department FOREIGN KEY (department_id)
    REFERENCES departments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_subject_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_subject_hours CHECK (weekly_hours BETWEEN 1 AND 20)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subject_slots (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  period TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subject_slot (subject_id, day_of_week, period),
  KEY ix_subject_slot_time (day_of_week, period),
  CONSTRAINT fk_subject_slot_subject FOREIGN KEY (subject_id)
    REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_subject_slot_day CHECK (day_of_week BETWEEN 1 AND 5),
  CONSTRAINT chk_subject_slot_period CHECK (period BETWEEN 1 AND 8)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS allocations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_id INT UNSIGNED NOT NULL,
  faculty_id INT UNSIGNED NOT NULL,
  assigned_hours TINYINT UNSIGNED NOT NULL,
  allocated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_allocation_subject (subject_id),
  KEY ix_allocation_faculty (faculty_id),
  CONSTRAINT fk_allocation_subject FOREIGN KEY (subject_id)
    REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_allocation_faculty FOREIGN KEY (faculty_id)
    REFERENCES faculty(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS timetable_slots (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_id INT UNSIGNED NOT NULL,
  faculty_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL,
  period TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_timetable_slot (class_id, day_of_week, period),
  UNIQUE KEY uq_faculty_timetable_slot (faculty_id, day_of_week, period),
  KEY ix_timetable_faculty_time (faculty_id, day_of_week, period),
  CONSTRAINT fk_timetable_subject FOREIGN KEY (subject_id)
    REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_timetable_faculty FOREIGN KEY (faculty_id)
    REFERENCES faculty(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_timetable_class FOREIGN KEY (class_id)
    REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_timetable_day CHECK (day_of_week BETWEEN 1 AND 5),
  CONSTRAINT chk_timetable_period CHECK (period BETWEEN 1 AND 8)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS allocation_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_id INT UNSIGNED NOT NULL,
  faculty_id INT UNSIGNED NULL,
  action ENUM('assigned', 'reassigned', 'unassigned') NOT NULL,
  changed_by INT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_allocation_history_created (created_at),
  KEY ix_allocation_history_subject (subject_id),
  CONSTRAINT fk_history_subject FOREIGN KEY (subject_id)
    REFERENCES subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_history_faculty FOREIGN KEY (faculty_id)
    REFERENCES faculty(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_history_admin FOREIGN KEY (changed_by)
    REFERENCES admins(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;
