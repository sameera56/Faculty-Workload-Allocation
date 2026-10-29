# Smart Faculty Workload Allocation and Assignment System

A Node.js, Express, MySQL and vanilla JavaScript academic project for managing teaching staff, courses, recurring timetable slots and weekly workloads. The allocation planner is a deterministic, explainable greedy heuristic; it is not an optimization solver.

## Features

- Administrator sign-in with bcrypt password hashes and express-session stored in MySQL.
- Protected REST APIs with request validation, consistent JSON responses and centralized error handling.
- Faculty, department, class/section and subject CRUD.
- Faculty search, department filtering, sorting, server-side pagination, profiles and assignment summaries.
- Workload calculations, capacity indicators, dashboard summaries and Chart.js visualizations from live database queries.
- Class-filtered weekly timetable, subject timetable slots and faculty availability management.
- Automatic allocation preview and confirmation, with specialization/department eligibility, capacity, availability, timetable conflict checks and fair load distribution.
- Manual assignments/reassignments and unassignment with validation, activity history and transactional writes.
- Faculty-, department- and subject-wise reports, unassigned-subject/conflict summaries, and CSV downloads.
- Responsive dashboard with search, profile details, forms, status messages and empty/loading states.

## Prerequisites

- Windows 10/11 and PowerShell (VS Code terminal is fine).
- Node.js 20 or newer and npm.
- MySQL Server 8.0 or newer, with the MySQL command-line client (`mysql.exe`) available on `PATH`.

Check installations:

```powershell
node --version
npm --version
mysql --version
```

If PowerShell says `mysql` is not recognized, install MySQL Server and add its `bin` folder (commonly `C:\Program Files\MySQL\MySQL Server 8.0\bin`) to `PATH`, or use the full path to `mysql.exe` in the commands below. XAMPP includes MariaDB, which is MySQL-protocol compatible and works for local development; with the default XAMPP setup, start MySQL from the XAMPP Control Panel and use its client at `C:\xampp\mysql\bin\mysql.exe`.

## Install and configure

Run these commands from the project folder:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
```

Set `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `SESSION_SECRET` in `.env`. Use a unique random `SESSION_SECRET` of at least 32 characters for production. The development example secret is not suitable for deployment. Set `SESSION_COOKIE_SECURE=true` when serving the application over HTTPS.

Create the schema and add fictional sample departments, faculty, subjects, sections, and availability:

```powershell
cmd.exe /c "mysql -u root -p < schema.sql"
cmd.exe /c "mysql -u root -p < seed.sql"
```

For XAMPP's default local root account (no password), use:

```powershell
cmd.exe /c """C:\xampp\mysql\bin\mysql.exe"" --protocol=tcp -h 127.0.0.1 -u root < schema.sql"
cmd.exe /c """C:\xampp\mysql\bin\mysql.exe"" --protocol=tcp -h 127.0.0.1 -u root < seed.sql"
```

Use the MySQL username and password configured in `.env`. `schema.sql` creates the `faculty_workload` database; update the `USE faculty_workload` statements in the SQL files if using a different database name.

Create or reset the administrator account using the name, email and password in `.env`:

```powershell
npm run setup:admin
```

The password is hashed with bcrypt before it is stored. The administrator password must contain at least 12 characters.

## Run

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. Use `Ctrl+C` in the terminal to stop the server. `npm start` starts the non-watch server.

Run the allocation-service unit tests (no MySQL server is required for these tests):

```powershell
npm test
```

## REST API overview

All endpoints except login/logout/session status and `/api/health` require an authenticated administrator session. Successful responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": { "message": ..., "details": ... } }`.

| Area | Routes |
|---|---|
| Authentication | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Dashboard | `GET /api/dashboard` |
| Faculty | `GET/POST /api/faculty`, `GET/PUT/DELETE /api/faculty/:id`, `GET /api/faculty/workload/summary` |
| Departments/classes | `GET/POST /api/departments`, `PUT/DELETE /api/departments/:id`, `GET/POST /api/departments/classes`, `PUT/DELETE /api/departments/classes/:id` |
| Subjects | `GET/POST /api/subjects`, `PUT/DELETE /api/subjects/:id`, `PUT /api/subjects/:id/slots` |
| Allocation | `POST /api/allocations/preview`, `POST /api/allocations/confirm`, `POST /api/allocations/manual`, `DELETE /api/allocations/:subjectId` |
| Timetable | `GET /api/timetable`, `PUT /api/timetable/availability/:facultyId` |
| Reports | `GET /api/reports/{faculty,department,subject}`, corresponding `.csv` routes, `GET /api/reports/conflicts/summary` |

Availability is represented as recurring weekday/period pairs (Monday–Friday, periods 1–8). A scheduled subject may have either no configured slots or exactly one slot per weekly teaching hour. The allocation preview never writes data; confirmation recomputes the plan under transaction locks before inserting records. Subjects that cannot be assigned are returned with a reason.

## Database notes

- `schema.sql` defines normalized MySQL/InnoDB tables, keys, foreign keys and period/hour constraints.
- The session store creates its own `sessions` table on application startup.
- The app uses parameterized SQL for values and transactions for batch allocation, manual reassignment, timetable-slot edits, availability updates and unassignment.
- `allocation_history` retains a record of manual and automatic assignment changes.
- Changing a subject's hours while it is assigned, deleting referenced records, or removing availability for an already assigned period is rejected with a useful conflict response.

## Project layout

```text
src/
  app.js, server.js
  config/db.js
  middleware/
  routes/
  services/allocationService.js
  services/workloadService.js
  utils/
public/
  index.html
  css/style.css
  js/api.js
  js/app.js
scripts/create-admin.js
tests/allocation.test.js
schema.sql
seed.sql
```

The dashboard loads Chart.js from jsDelivr; without internet access, the rest of the application remains usable, but charts will not render.
