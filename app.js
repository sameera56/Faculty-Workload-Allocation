(() => {
  const content = document.querySelector('#content');
  const loginScreen = document.querySelector('#login-screen');
  const application = document.querySelector('#application');
  const modal = document.querySelector('#modal');
  const modalForm = document.querySelector('#modal-form');
  let page = 'dashboard';
  let cache = { faculty: [], departments: [], classes: [], subjects: [] };
  let charts = [];
  let searchTimer;
  let toastTimer;
  let facultyListState = { search: '', departmentId: '', sort: 'name', order: 'asc', page: 1 };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const result = async (promise) => (await promise).data;
  const empty = (title, text) => `<div class="empty-state"><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
  const heading = (title, description, action = '') => `
    <div class="page-heading"><div><h2>${title}</h2><p>${description}</p></div>${action}</div>`;
  const table = (headers, rows, emptyText = 'No records found.') => `
    <div class="table-wrap"><table><thead><tr>${headers.map((value) => `<th>${value}</th>`).join('')}</tr></thead>
    <tbody>${rows || `<tr><td colspan="${headers.length}">${empty('Nothing here yet', emptyText)}</td></tr>`}</tbody></table></div>`;

  function toast(message, error = false) {
    const node = document.querySelector('#toast');
    node.textContent = message;
    node.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, 3400);
  }

  function showLogin() {
    application.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }

  function showApp(admin) {
    loginScreen.classList.add('hidden');
    application.classList.remove('hidden');
    document.querySelector('#static-mode-banner').classList.toggle('hidden', !api.isStaticDemo);
    document.querySelector('#admin-name').textContent = admin.name;
    document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('en', {
      weekday: 'short', month: 'short', day: 'numeric'
    }).format(new Date());
    navigate('dashboard');
  }

  async function checkSession() {
    try {
      const admin = await result(api.get('/api/auth/me'));
      showApp(admin);
    } catch (error) {
      showLogin();
    }
  }

  document.querySelector('#static-login-note').classList.toggle('hidden', !api.isStaticDemo);

  async function navigate(nextPage) {
    page = nextPage;
    charts.forEach((chart) => chart.destroy());
    charts = [];
    document.querySelectorAll('.nav-link[data-page]').forEach((link) =>
      link.classList.toggle('active', link.dataset.page === page));
    const titles = {
      dashboard: 'Overview', faculty: 'Faculty', departments: 'Departments & classes',
      subjects: 'Subjects', workload: 'Workload', allocation: 'Allocation',
      timetable: 'Timetable', reports: 'Reports'
    };
    document.querySelector('#page-title').textContent = titles[page] || 'Overview';
    content.innerHTML = '<div class="loading-state">Loading academic data…</div>';
    try {
      await ({ dashboard: renderDashboard, faculty: renderFaculty, departments: renderDepartments,
        subjects: renderSubjects, workload: renderWorkload, allocation: renderAllocation,
        timetable: renderTimetable, reports: renderReports }[page] || renderDashboard)();
    } catch (error) {
      content.innerHTML = empty('Could not load this section', error.message);
      if (error.status === 401) showLogin();
      else toast(error.message, true);
    }
  }

  async function loadReferenceData() {
    const [departments, classes, subjects, faculty] = await Promise.all([
      result(api.get('/api/departments')), result(api.get('/api/departments/classes')),
      result(api.get('/api/subjects')), result(api.get('/api/faculty?limit=100'))
    ]);
    cache = { departments, classes, subjects, faculty };
    return cache;
  }

  async function renderDashboard() {
    const data = await result(api.get('/api/dashboard'));
    const stats = data.summary;
    const cards = [
      ['Faculty members', stats.total_faculty, '♙'],
      ['Subjects', stats.total_subjects, '▤'],
      ['Departments', stats.total_departments, '▦'],
      ['Assigned teaching hours', stats.assigned_hours, '◷'],
      ['Faculty with capacity', stats.faculty_with_capacity, '↗'],
      ['At workload limit', stats.faculty_at_limit, '◉'],
      ['Pending assignments', stats.pending_subjects, '⌛']
    ];
    content.innerHTML = `
      ${heading(`Good ${new Date().getHours() < 12 ? 'morning' : 'day'}, Administrator`, 'A live view of teaching capacity and assignment progress.')}
      <div class="cards">${cards.map(([label, value, icon]) => `<article class="stat-card"><span class="stat-label">${label}</span><span class="stat-icon">${icon}</span><strong>${Number(value || 0).toLocaleString()}</strong></article>`).join('')}</div>
      <div class="dashboard-grid">
        <section class="panel"><div class="panel-title"><div><h3>Faculty workload distribution</h3><p>Assigned and remaining hours by faculty member</p></div></div><div class="chart-wrap"><canvas id="workload-chart"></canvas></div></section>
        <section class="panel"><div class="panel-title"><div><h3>Department allocation</h3><p>Teaching hours currently assigned</p></div></div><div class="chart-wrap"><canvas id="department-chart"></canvas></div></section>
      </div>
      <section class="panel" style="margin-top:16px"><div class="panel-title"><div><h3>Recent allocation activity</h3><p>Latest changes made in the system</p></div><button class="button secondary small" data-page="allocation">Manage allocations</button></div>
      ${table(['Action', 'Subject', 'Faculty member', 'Date'], data.recent_activity.map((item) => `<tr><td><span class="badge ${item.action === 'unassigned' ? 'warn' : 'good'}">${esc(item.action)}</span></td><td class="primary-cell">${esc(item.subject_code)} · ${esc(item.subject_name)}</td><td>${esc(item.faculty_name || '—')}</td><td>${new Date(item.created_at).toLocaleString()}</td></tr>`).join(''), 'Allocation activity appears here after changes.')}</section>`;
    if (window.Chart) {
      const workload = data.workload;
      charts.push(new Chart(document.querySelector('#workload-chart'), {
        type: 'bar',
        data: { labels: workload.map((row) => row.name), datasets: [
          { label: 'Assigned', data: workload.map((row) => Number(row.assigned_hours)), backgroundColor: '#18a89b', borderRadius: 4 },
          { label: 'Remaining', data: workload.map((row) => Number(row.remaining_hours)), backgroundColor: '#e5edf1', borderRadius: 4 }
        ] },
        options: { maintainAspectRatio: false, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } }, plugins: { legend: { position: 'bottom' } } }
      }));
      charts.push(new Chart(document.querySelector('#department-chart'), {
        type: 'doughnut',
        data: { labels: data.departments.map((row) => row.name), datasets: [{ data: data.departments.map((row) => Number(row.assigned_hours)), backgroundColor: ['#18a89b', '#25496c', '#75c6bc', '#82a0b7', '#d2e8e4'] }] },
        options: { maintainAspectRatio: false, cutout: '67%', plugins: { legend: { position: 'bottom' } } }
      }));
    }
  }

  function utilizationBadge(value) {
    const percentage = Number(value || 0);
    const status = percentage >= 100 ? 'full' : percentage >= 75 ? 'warn' : 'good';
    const label = percentage >= 100 ? 'At limit' : percentage >= 75 ? 'High' : 'Available';
    return `<span class="badge ${status}">${label} · ${percentage}%</span>`;
  }

  async function renderFaculty(search = '', pageNumber = 1, departmentId = '', sort = 'name', order = 'asc') {
    const [departments, response] = await Promise.all([
      result(api.get('/api/departments')),
      api.get(`/api/faculty?limit=10&page=${pageNumber}&search=${encodeURIComponent(search)}${departmentId ? `&department_id=${departmentId}` : ''}&sort=${sort}&order=${order}`)
    ]);
    cache.departments = departments;
    cache.faculty = response.data;
    facultyListState = { search, departmentId, sort, order, page: pageNumber };
    const rows = response.data.map((person) => `<tr>
      <td class="primary-cell">${esc(person.faculty_code)}</td><td><b>${esc(person.name)}</b><br><span class="muted">${esc(person.email)}</span></td>
      <td>${esc(person.department)}</td><td>${esc(person.specialization)}</td><td>${person.assigned_hours} / ${person.max_weekly_hours} hrs</td>
      <td>${utilizationBadge(person.utilization_percent)}</td><td><div class="table-actions"><button class="action-link" data-action="view-faculty" data-id="${person.id}">Profile</button><button class="action-link" data-action="edit-faculty" data-id="${person.id}">Edit</button><button class="action-link danger-text" data-action="delete-faculty" data-id="${person.id}">Delete</button></div></td>
    </tr>`).join('');
    content.innerHTML = `${heading('Faculty directory', 'Manage teaching staff, specializations, and weekly capacity.', '<button class="button primary" data-action="add-faculty">＋ Add faculty</button>')}
      <div class="table-panel"><div class="table-toolbar"><div class="toolbar-group"><input class="search-input" id="faculty-search" type="search" placeholder="Search name, code, email…" value="${esc(search)}"><select id="faculty-department"><option value="">All departments</option>${departments.map((d) => `<option value="${d.id}" ${String(d.id) === String(departmentId) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><select id="faculty-sort"><option value="name" ${sort === 'name' ? 'selected' : ''}>Sort: name</option><option value="faculty_code" ${sort === 'faculty_code' ? 'selected' : ''}>Faculty ID</option><option value="department" ${sort === 'department' ? 'selected' : ''}>Department</option><option value="assigned_hours" ${sort === 'assigned_hours' ? 'selected' : ''}>Assigned hours</option><option value="utilization" ${sort === 'utilization' ? 'selected' : ''}>Utilization</option></select><select id="faculty-order"><option value="asc" ${order === 'asc' ? 'selected' : ''}>Ascending</option><option value="desc" ${order === 'desc' ? 'selected' : ''}>Descending</option></select></div><span class="muted">${response.meta.total} faculty members</span></div>
      ${table(['Faculty ID', 'Faculty member', 'Department', 'Specialization', 'Workload', 'Capacity', 'Actions'], rows, 'Add faculty members to get started.')}
      <div class="table-toolbar"><span class="muted">Page ${response.meta.page} of ${Math.max(1, response.meta.pages)}</span><div class="toolbar-group"><button class="button secondary small" data-action="faculty-page" data-page-no="${pageNumber - 1}" ${pageNumber <= 1 ? 'disabled' : ''}>Previous</button><button class="button secondary small" data-action="faculty-page" data-page-no="${pageNumber + 1}" ${pageNumber >= response.meta.pages ? 'disabled' : ''}>Next</button></div></div></div>`;
  }

  async function renderDepartments() {
    const [departments, classes] = await Promise.all([
      result(api.get('/api/departments')), result(api.get('/api/departments/classes'))
    ]);
    cache.departments = departments;
    cache.classes = classes;
    content.innerHTML = `${heading('Academic structure', 'Maintain departments and their semester sections.', '<button class="button primary" data-action="add-department">＋ Add department</button>')}
      <section class="table-panel"><div class="table-toolbar"><b>Departments</b><span class="muted">${departments.length} departments</span></div>
      ${table(['Code', 'Department', 'Faculty', 'Subjects', 'Actions'], departments.map((item) => `<tr><td class="primary-cell">${esc(item.code)}</td><td>${esc(item.name)}</td><td>${item.faculty_count}</td><td>${item.subject_count}</td><td><div class="table-actions"><button class="action-link" data-action="edit-department" data-id="${item.id}">Edit</button><button class="action-link danger-text" data-action="delete-department" data-id="${item.id}">Delete</button></div></td></tr>`).join(''), 'Create the first department.')}</section>
      <section class="table-panel" style="margin-top:16px"><div class="table-toolbar"><b>Classes &amp; sections</b><button class="button secondary small" data-action="add-class">＋ Add class</button></div>
      ${table(['Department', 'Semester', 'Section', 'Academic year', 'Actions'], classes.map((item) => `<tr><td>${esc(item.department)}</td><td>${item.semester}</td><td>${esc(item.section)}</td><td>${esc(item.academic_year)}</td><td><div class="table-actions"><button class="action-link" data-action="edit-class" data-id="${item.id}">Edit</button><button class="action-link danger-text" data-action="delete-class" data-id="${item.id}">Delete</button></div></td></tr>`).join(''), 'Add classes before creating subjects.')}</section>`;
  }

  async function renderSubjects(search = '') {
    const [references, response] = await Promise.all([
      loadReferenceData(), api.get('/api/subjects')
    ]);
    let rows = response.data;
    if (search) rows = rows.filter((s) => `${s.subject_code} ${s.name} ${s.department}`.toLowerCase().includes(search.toLowerCase()));
    cache.subjects = rows;
    content.innerHTML = `${heading('Subjects & teaching requirements', 'Define weekly contact hours and the specialization needed for each course.', '<button class="button primary" data-action="add-subject">＋ Add subject</button>')}
      <div class="table-panel"><div class="table-toolbar"><input class="search-input" id="subject-search" type="search" placeholder="Search code, name, department…" value="${esc(search)}"><span class="muted">${rows.length} subjects</span></div>
      ${table(['Subject', 'Department / class', 'Required specialization', 'Hours / week', 'Assignment', 'Actions'], rows.map((s) => `<tr><td class="primary-cell">${esc(s.subject_code)}<br><span class="muted">${esc(s.name)}</span></td><td>${esc(s.department)}<br><span class="muted">Semester ${s.semester} · ${esc(s.section)}</span></td><td>${esc(s.required_specialization)}</td><td>${s.weekly_hours}</td><td>${s.faculty_name ? `<span class="badge good">${esc(s.faculty_name)}</span>` : '<span class="badge warn">Pending</span>'}</td><td><div class="table-actions"><button class="action-link" data-action="edit-subject" data-id="${s.id}">Edit</button><button class="action-link" data-action="edit-slots" data-id="${s.id}">Slots</button><button class="action-link danger-text" data-action="delete-subject" data-id="${s.id}">Delete</button></div></td></tr>`).join(''), 'Create departments and classes, then add subjects.')}</div>`;
  }

  async function renderWorkload() {
    const rows = await result(api.get('/api/faculty/workload/summary'));
    content.innerHTML = `${heading('Weekly workload', 'Compare assigned teaching hours against each faculty member’s capacity.', '<button class="button secondary" data-page="reports">View reports</button>')}
      <div class="table-panel">${table(['Faculty member', 'Department', 'Specialization', 'Assigned hours', 'Remaining', 'Utilization', 'Status'], rows.map((person) => {
        const utilization = Number(person.utilization_percent);
        return `<tr><td class="primary-cell">${esc(person.name)}<br><span class="muted">${esc(person.faculty_code)}</span></td><td>${esc(person.department)}</td><td>${esc(person.specialization)}</td><td>${person.assigned_hours} / ${person.max_weekly_hours} hrs</td><td>${person.remaining_hours} hrs</td><td><div class="progress"><span style="width:${Math.min(100, utilization)}%"></span></div><small>${utilization}%</small></td><td>${utilizationBadge(utilization)}</td></tr>`;
      }).join(''), 'Workload details will appear when faculty are added.')}</div>`;
  }

  async function renderAllocation() {
    const references = await loadReferenceData();
    content.innerHTML = `${heading('Faculty allocation', 'Preview a fair, explainable plan before committing it—or assign a subject manually.')}
      <div class="preview-card"><h3>Automatic allocation</h3><p>The planner uses matching department and specialization, weekly capacity, configured availability, timetable conflicts, and current workload. Ties are resolved by faculty ID.</p><div class="toolbar-group"><button class="button secondary" data-action="preview-allocation">Preview plan</button><button class="button primary" data-action="confirm-allocation" disabled id="confirm-plan">Confirm and save</button></div><div id="allocation-preview"></div></div>
      <section class="panel"><div class="panel-title"><div><h3>Manual assignment</h3><p>Eligible faculty are checked again by the server before saving.</p></div></div>
        <form id="manual-form" class="toolbar-group" style="flex-wrap:wrap">
          <select name="subject_id" required><option value="">Select a subject</option>${references.subjects.map((s) => `<option value="${s.id}">${esc(s.subject_code)} · ${esc(s.name)} (${s.weekly_hours}h)${s.faculty_name ? ` — assigned to ${esc(s.faculty_name)}` : ''}</option>`).join('')}</select>
          <select name="faculty_id" required disabled><option value="">Choose subject first</option></select>
          <button class="button primary">Assign subject</button>
        </form><div id="eligible-faculty" style="margin-top:14px"></div></section>
      <section class="table-panel" style="margin-top:16px"><div class="table-toolbar"><b>Current assignments</b></div>
      ${table(['Subject', 'Department', 'Faculty member', 'Hours', 'Actions'], references.subjects.filter((s) => s.faculty_name).map((s) => `<tr><td class="primary-cell">${esc(s.subject_code)} · ${esc(s.name)}</td><td>${esc(s.department)}</td><td>${esc(s.faculty_name)}</td><td>${s.assigned_hours} hrs</td><td><button class="action-link danger-text" data-action="unassign-subject" data-id="${s.id}">Unassign</button></td></tr>`).join(''), 'No subject assignments yet.')}</section>`;
  }

  async function renderTimetable(classFilter = '') {
    const [data, faculty, classes] = await Promise.all([
      result(api.get('/api/timetable')), result(api.get('/api/faculty?limit=100')),
      result(api.get('/api/departments/classes'))
    ]);
    cache.faculty = faculty;
    cache.classes = classes;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    window.currentAvailability = data.availability;
    const activeClass = classFilter || String(classes[0]?.id || '');
    const activeAssignments = data.assignments.filter((item) => String(item.class_id) === String(activeClass));
    const slots = new Map(activeAssignments.map((item) => [`${item.day_of_week}:${item.period}`, item]));
    const grid = `<div class="table-wrap"><div class="slot-grid"><div class="slot-head">Day / period</div>${Array.from({ length: 8 }, (_, i) => `<div class="slot-head">P${i + 1}</div>`).join('')}${days.map((day, index) => `<div class="slot-head">${day}</div>${Array.from({ length: 8 }, (_, i) => {
      const item = slots.get(`${index + 1}:${i + 1}`);
      return `<div class="${item ? 'slot-filled' : ''}" title="${item ? esc(item.faculty_name) : ''}">${item ? `${esc(item.subject_code)}<br>${esc(item.faculty_name)}` : '—'}</div>`;
    }).join('')}`).join('')}</div></div>`;
    const renderAvailabilityGrid = (facultyId) => `<div class="availability-grid">${days.map((day, dayIndex) => `<div class="availability-day"><b>${day}</b>${Array.from({ length: 8 }, (_, periodIndex) => {
      const checked = data.availability.some((slot) => Number(slot.faculty_id) === Number(facultyId)
        && Number(slot.day_of_week) === dayIndex + 1 && Number(slot.period) === periodIndex + 1);
      return `<label title="${day}, period ${periodIndex + 1}"><input type="checkbox" data-availability-slot data-day="${dayIndex + 1}" data-period="${periodIndex + 1}" ${checked ? 'checked' : ''}><span>P${periodIndex + 1}</span></label>`;
    }).join('')}</div>`).join('')}</div>`;
    content.innerHTML = `${heading('Weekly timetable', 'Recurring teaching schedule and faculty availability.')}
      <section class="panel"><div class="panel-title"><div><h3>Class timetable</h3><p>Monday to Friday · eight teaching periods per day</p></div><select id="class-timetable"><option value="">Select a class</option>${classes.map((item) => `<option value="${item.id}" ${String(item.id) === String(activeClass) ? 'selected' : ''}>${esc(item.department)} · Sem ${item.semester} · ${esc(item.section)}</option>`).join('')}</select></div>${activeClass ? grid : empty('No classes are configured', 'Add a class or section to view its timetable.')}</section>
      <section class="panel" style="margin-top:16px"><div class="panel-title"><div><h3>Faculty availability</h3><p>Set availability before proposing scheduled allocations. Assigned periods cannot be made unavailable.</p></div></div>
        <form id="availability-form"><div class="toolbar-group" style="flex-wrap:wrap"><select name="faculty_id" required><option value="">Select faculty member</option>${faculty.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select><button class="button secondary" type="button" data-action="all-available">Select all</button><button class="button primary">Save availability</button></div><div id="availability-editor">${faculty.length ? renderAvailabilityGrid(faculty[0].id) : empty('No faculty members', 'Add faculty before setting availability.')}</div></form></section>`;
  }

  async function renderReports(type = 'faculty') {
    const [rows, conflictData] = await Promise.all([
      result(api.get(`/api/reports/${type}`)),
      result(api.get('/api/reports/conflicts/summary'))
    ]);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    content.innerHTML = `${heading('Reports & exports', 'Review live database reports and download CSV files for further analysis.')}
      <div class="table-toolbar" style="padding-left:0;border:0"><select id="report-type"><option value="faculty" ${type === 'faculty' ? 'selected' : ''}>Faculty-wise</option><option value="department" ${type === 'department' ? 'selected' : ''}>Department-wise</option><option value="subject" ${type === 'subject' ? 'selected' : ''}>Subject-wise</option></select><button class="button secondary" data-action="export-csv" data-type="${type}">Download CSV</button></div>
      <div class="table-panel">${table(headers.map((h) => h.replaceAll('_', ' ')), rows.map((row) => `<tr>${headers.map((key) => `<td>${esc(row[key] ?? '—')}</td>`).join('')}</tr>`).join(''), 'No report rows are available yet.')}</div>
      <div class="dashboard-grid" style="margin-top:16px"><section class="panel"><div class="panel-title"><div><h3>Unassigned subjects</h3><p>Subjects still requiring a faculty member</p></div></div>${table(['Subject', 'Department', 'Weekly hours'], conflictData.unassigned.map((s) => `<tr><td>${esc(s.subject_code)} · ${esc(s.name)}</td><td>${esc(s.department)}</td><td>${s.weekly_hours}</td></tr>`).join(''), 'All subjects have an assignment.')}</section>
      <section class="panel"><div class="panel-title"><div><h3>Timetable conflicts</h3><p>Detected from saved timetable records</p></div></div>${table(['Day', 'Period', 'Faculty', 'Assignments'], conflictData.conflicts.map((item) => `<tr><td>${item.day_of_week}</td><td>${item.period}</td><td>${esc(item.faculty_name)}</td><td>${esc(item.subjects)}</td></tr>`).join(''), 'No timetable conflicts detected.')}</section></div>`;
  }

  function selectField(name, label, options, value, required = true) {
    return `<label>${label}<select name="${name}" ${required ? 'required' : ''}><option value="">Choose…</option>${options.map((option) => `<option value="${option.value}" ${String(option.value) === String(value ?? '') ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>`;
  }

  function inputField(name, label, value = '', type = 'text', required = true, attrs = '') {
    return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${attrs}></label>`;
  }

  function openForm(title, fields, endpoint, method = 'POST', record = {}) {
    document.querySelector('#modal-title').textContent = title;
    document.querySelector('#modal-fields').innerHTML = fields(record);
    modalForm.dataset.endpoint = endpoint;
    modalForm.dataset.method = method;
    modalForm.dataset.formKind = 'record';
    modal.showModal();
  }

  function openFaculty(record = {}) {
    const deptOptions = (cache.departments || []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));
    openForm(record.id ? 'Edit faculty member' : 'Add faculty member', (item) => `
      ${inputField('faculty_code', 'Faculty ID', item.faculty_code)}
      ${inputField('name', 'Full name', item.name)}
      ${inputField('email', 'Email address', item.email, 'email')}
      ${selectField('department_id', 'Department', deptOptions, item.department_id)}
      ${inputField('designation', 'Designation', item.designation)}
      ${inputField('specialization', 'Specialization', item.specialization)}
      ${inputField('max_weekly_hours', 'Maximum weekly hours', item.max_weekly_hours ?? 18, 'number', true, 'min="1" max="40"')}
    `, `/api/faculty${record.id ? `/${record.id}` : ''}`, record.id ? 'PUT' : 'POST', record);
  }

  function openDepartment(record = {}) {
    openForm(record.id ? 'Edit department' : 'Add department', (item) => `${inputField('name', 'Department name', item.name)}${inputField('code', 'Department code', item.code)}`, `/api/departments${record.id ? `/${record.id}` : ''}`, record.id ? 'PUT' : 'POST', record);
  }

  function openClass(record = {}) {
    openForm(record.id ? 'Edit class / section' : 'Add class / section', () => `
      ${selectField('department_id', 'Department', cache.departments.map((d) => ({ value: d.id, label: d.name })), record.department_id)}
      ${inputField('semester', 'Semester (1–8)', record.semester ?? '', 'number', true, 'min="1" max="8"')}
      ${inputField('section', 'Section', record.section)}
      ${inputField('academic_year', 'Academic year', record.academic_year || '2026-2027', 'text', true, 'pattern="\\d{4}-\\d{4}"')}
    `, `/api/departments/classes${record.id ? `/${record.id}` : ''}`, record.id ? 'PUT' : 'POST', record);
  }

  function openSubject(record = {}) {
    const deptOptions = cache.departments.map((d) => ({ value: d.id, label: d.name }));
    const classes = cache.classes.filter((item) => !record.department_id || Number(item.department_id) === Number(record.department_id));
    openForm(record.id ? 'Edit subject' : 'Add subject', (item) => `
      ${inputField('subject_code', 'Subject code', item.subject_code)}
      ${inputField('name', 'Subject name', item.name)}
      ${selectField('department_id', 'Department', deptOptions, item.department_id)}
      ${selectField('class_id', 'Class / section', classes.map((c) => ({ value: c.id, label: `Sem ${c.semester} · ${c.section} · ${c.academic_year}` })), item.class_id)}
      ${inputField('required_specialization', 'Required specialization', item.required_specialization)}
      ${inputField('weekly_hours', 'Weekly teaching hours', item.weekly_hours ?? 3, 'number', true, 'min="1" max="20"')}
    `, `/api/subjects${record.id ? `/${record.id}` : ''}`, record.id ? 'PUT' : 'POST', record);
  }

  function openSubjectSlots(subject) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const selected = new Set((subject.slots || []).map((slot) => `${slot.day_of_week}:${slot.period}`));
    document.querySelector('#modal-title').textContent = `Timetable slots · ${subject.subject_code}`;
    document.querySelector('#modal-fields').innerHTML = `<p class="full-row muted">Select recurring periods for this subject. Each selected period occupies one timetable slot.</p><div class="full-row">${days.map((day, index) => `<div class="slot-select-row"><b>${day}</b>${Array.from({ length: 8 }, (_, i) => {
      const checked = selected.has(`${index + 1}:${i + 1}`);
      return `<label><input type="checkbox" data-subject-slot data-day="${index + 1}" data-period="${i + 1}" ${checked ? 'checked' : ''}>P${i + 1}</label>`;
    }).join('')}</div>`).join('')}</div>`;
    modalForm.dataset.endpoint = `/api/subjects/${subject.id}/slots`;
    modalForm.dataset.method = 'PUT';
    modalForm.dataset.formKind = 'slots';
    modalForm.querySelector('[type=submit]').classList.remove('hidden');
    modal.showModal();
  }

  async function submitModal(event) {
    event.preventDefault();
    if (modalForm.dataset.formKind === 'slots') {
      const slots = [...modalForm.querySelectorAll('[data-subject-slot]:checked')].map((input) => ({
        day_of_week: Number(input.dataset.day),
        period: Number(input.dataset.period)
      }));
      try {
        await api.put(modalForm.dataset.endpoint, { slots });
        modal.close();
        toast('Subject timetable slots updated.');
        await navigate(page);
      } catch (error) { toast(error.message, true); }
      return;
    }
    const formData = new FormData(modalForm);
    const payload = Object.fromEntries(formData.entries());
    for (const [key, value] of Object.entries(payload)) {
      const field = modalForm.elements.namedItem(key);
      if (field && field.type === 'number') payload[key] = Number(value);
    }
    try {
      await api.request(modalForm.dataset.endpoint, { method: modalForm.dataset.method, body: JSON.stringify(payload) });
      modal.close();
      toast('Record saved successfully.');
      await navigate(page);
    } catch (error) { toast(error.message, true); }
  }

  async function previewAllocation() {
    const plan = await result(api.post('/api/allocations/preview'));
    const host = document.querySelector('#allocation-preview');
    document.querySelector('#confirm-plan').disabled = !plan.proposed.length;
    host.innerHTML = `<div class="alert" style="color:#176f65;background:#e6f5f1">Preview only — no database records have been changed. ${plan.proposed.length} proposed, ${plan.unassigned.length} unassigned.</div>
      ${table(['Subject', 'Proposed faculty', 'Hours', 'Slots'], plan.proposed.map((item) => `<tr><td>${esc(item.subject_code)} · ${esc(item.subject_name)}</td><td>${esc(item.faculty_name)}</td><td>${item.assigned_hours}</td><td>${item.slots.length ? item.slots.map((s) => `D${s.day_of_week}/P${s.period}`).join(', ') : 'Not scheduled'}</td></tr>`).join(''), 'There are no unassigned subjects to allocate.')}
      ${plan.unassigned.length ? `<div class="alert"><b>Cannot assign:</b> ${plan.unassigned.map((item) => `${esc(item.subject_code)} — ${esc(item.reason)}`).join('<br>')}</div>` : ''}
      <details style="margin-top:12px"><summary class="muted">Workload after proposed allocation</summary>${table(['Faculty member', 'Assigned', 'Maximum', 'Remaining'], plan.workload_after.map((item) => `<tr><td>${esc(item.faculty_name)}</td><td>${item.assigned_hours}</td><td>${item.max_weekly_hours}</td><td>${item.remaining_hours}</td></tr>`).join(''))}</details>`;
  }

  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const message = document.querySelector('#login-error');
    message.textContent = '';
    try {
      const admin = await result(api.post('/api/auth/login', { email: form.get('email'), password: form.get('password') }));
      formElement.reset();
      showApp(admin);
    } catch (error) { message.textContent = error.message; }
  });

  document.querySelector('#logout-button').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    showLogin();
  });
  document.querySelector('#navigation').addEventListener('click', (event) => {
    const link = event.target.closest('[data-page]');
    if (link) {
      navigate(link.dataset.page);
      document.querySelector('#sidebar').classList.remove('open');
    }
  });
  document.querySelector('.brand').addEventListener('click', (event) => {
    event.preventDefault();
    navigate('dashboard');
  });
  document.querySelector('#menu-button').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
  modalForm.addEventListener('submit', submitModal);
  modal.querySelector('[data-close]').addEventListener('click', () => modal.close());
  modal.querySelector('[data-modal-close]').addEventListener('click', () => modal.close());

  content.addEventListener('input', (event) => {
    if (event.target.id === 'faculty-search' || event.target.id === 'subject-search') {
      const target = event.target;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => target.id === 'faculty-search'
        ? renderFaculty(target.value, 1, document.querySelector('#faculty-department').value, facultyListState.sort, facultyListState.order).catch((error) => toast(error.message, true))
        : renderSubjects(target.value).catch((error) => toast(error.message, true)), 250);
    }
  });

  content.addEventListener('change', (event) => {
    if (event.target.id === 'report-type') renderReports(event.target.value).catch((error) => toast(error.message, true));
    if (event.target.id === 'class-timetable') renderTimetable(event.target.value).catch((error) => toast(error.message, true));
    if (['faculty-department', 'faculty-sort', 'faculty-order'].includes(event.target.id)) {
      const sortSelect = document.querySelector('#faculty-sort');
      const sort = sortSelect.value;
      const order = document.querySelector('#faculty-order').value;
      renderFaculty(
        document.querySelector('#faculty-search').value,
        1,
        document.querySelector('#faculty-department').value,
        sort,
        order
      ).catch((error) => toast(error.message, true));
    }
    if (event.target.name === 'subject_id' && event.target.closest('#manual-form')) {
      const subjectId = event.target.value;
      const facultySelect = document.querySelector('#manual-form [name=faculty_id]');
      const eligibleHost = document.querySelector('#eligible-faculty');
      facultySelect.disabled = true;
      facultySelect.innerHTML = '<option value="">Loading eligible faculty…</option>';
      eligibleHost.innerHTML = '';
      if (subjectId) {
        result(api.get(`/api/subjects/${subjectId}/eligible`)).then((candidates) => {
          facultySelect.innerHTML = `<option value="">Select eligible faculty</option>${candidates.filter((person) => person.eligible).map((person) => `<option value="${person.id}">${esc(person.name)} · ${person.assigned_hours}/${person.max_weekly_hours}h (${person.remaining_hours}h remaining)</option>`).join('')}`;
          facultySelect.disabled = !candidates.some((person) => person.eligible);
          eligibleHost.innerHTML = candidates.length ? table(
            ['Faculty member', 'Specialization', 'Current / maximum', 'Remaining', 'Fit'],
            candidates.map((person) => `<tr><td class="primary-cell">${esc(person.name)}</td><td>${esc(person.specialization)}</td><td>${person.assigned_hours} / ${person.max_weekly_hours} hrs</td><td>${person.remaining_hours} hrs</td><td>${person.eligible ? utilizationBadge(person.utilization_percent) : `<span class="badge full">${esc(person.reason)}</span>`}</td></tr>`).join('')
          ) : empty('No eligible faculty', 'No faculty member matches this subject’s department and specialization.');
        }).catch((error) => {
          facultySelect.innerHTML = '<option value="">Could not load eligible faculty</option>';
          toast(error.message, true);
        });
      } else {
        facultySelect.innerHTML = '<option value="">Choose subject first</option>';
      }
    }
    if (event.target.name === 'faculty_id' && event.target.closest('#availability-form')) {
      const facultyId = Number(event.target.value);
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const availability = window.currentAvailability || [];
      document.querySelector('#availability-editor').innerHTML = `<div class="availability-grid">${days.map((day, dayIndex) => `<div class="availability-day"><b>${day}</b>${Array.from({ length: 8 }, (_, periodIndex) => {
        const checked = availability.some((slot) => Number(slot.faculty_id) === facultyId
          && Number(slot.day_of_week) === dayIndex + 1 && Number(slot.period) === periodIndex + 1);
        return `<label title="${day}, period ${periodIndex + 1}"><input type="checkbox" data-availability-slot data-day="${dayIndex + 1}" data-period="${periodIndex + 1}" ${checked ? 'checked' : ''}><span>P${periodIndex + 1}</span></label>`;
      }).join('')}</div>`).join('')}</div>`;
    }
    if (event.target.name === 'department_id' && modal.open && page === 'subjects') {
      const classSelect = modalForm.elements.namedItem('class_id');
      const classes = cache.classes.filter((item) => Number(item.department_id) === Number(event.target.value));
      classSelect.innerHTML = `<option value="">Choose…</option>${classes.map((item) => `<option value="${item.id}">Sem ${item.semester} · ${esc(item.section)} · ${esc(item.academic_year)}</option>`).join('')}`;
    }
  });

  content.addEventListener('submit', async (event) => {
    if (event.target.id === 'manual-form') {
      event.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(event.target));
        await api.post('/api/allocations/manual', { subject_id: Number(values.subject_id), faculty_id: Number(values.faculty_id) });
        toast('Subject assigned successfully.');
        navigate('allocation');
      } catch (error) { toast(error.message, true); }
    }
    if (event.target.id === 'availability-form') {
      event.preventDefault();
      const values = new FormData(event.target);
      const facultyId = values.get('faculty_id');
      const slots = [...event.target.querySelectorAll('[data-availability-slot]:checked')].map((input) => ({
        day_of_week: Number(input.dataset.day), period: Number(input.dataset.period)
      }));
      try {
        await api.put(`/api/timetable/availability/${facultyId}`, { slots });
        toast('Faculty availability updated.');
      } catch (error) { toast(error.message, true); }
    }
  });

  content.addEventListener('click', async (event) => {
    const pageLink = event.target.closest('[data-page]');
    if (pageLink) return navigate(pageLink.dataset.page);
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = Number(button.dataset.id);
    try {
      switch (button.dataset.action) {
        case 'add-faculty':
          await loadReferenceData(); openFaculty(); break;
        case 'faculty-page':
          await renderFaculty(
            document.querySelector('#faculty-search').value,
            Number(button.dataset.pageNo),
            document.querySelector('#faculty-department').value,
            facultyListState.sort,
            facultyListState.order
          );
          break;
        case 'edit-faculty': {
          await loadReferenceData();
          const item = await result(api.get(`/api/faculty/${id}`));
          openFaculty(item); break;
        }
        case 'view-faculty': {
          const item = await result(api.get(`/api/faculty/${id}`));
          document.querySelector('#modal-title').textContent = `${item.name} · Faculty profile`;
          document.querySelector('#modal-fields').innerHTML = `<div class="full-row"><p><b>${esc(item.faculty_code)}</b> · ${esc(item.designation)}</p><p>${esc(item.email)} · ${esc(item.department)}</p><p>Specialization: ${esc(item.specialization)}</p><p>Current load: ${item.assigned_hours}/${item.max_weekly_hours} teaching hours (${Math.round(item.assigned_hours * 100 / item.max_weekly_hours)}%)</p><h3>Assigned subjects</h3>${table(['Subject', 'Hours'], item.subjects.map((s) => `<tr><td>${esc(s.subject_code)} · ${esc(s.name)}</td><td>${s.assigned_hours}</td></tr>`).join(''), 'No subjects assigned.')}</div>`;
          modalForm.dataset.endpoint = '';
          modalForm.querySelector('[type=submit]').classList.add('hidden');
          modal.showModal();
          break;
        }
        case 'delete-faculty':
          if (confirm('Delete this faculty member? Assigned faculty cannot be deleted.')) {
            await api.delete(`/api/faculty/${id}`); toast('Faculty member deleted.'); navigate('faculty');
          } break;
        case 'add-department': await loadReferenceData(); openDepartment(); break;
        case 'edit-department': {
          await loadReferenceData();
          const department = cache.departments.find((item) => Number(item.id) === id);
          if (department) openDepartment(department);
          break;
        }
        case 'delete-department':
          if (confirm('Delete this department? It must not be used by faculty, classes, or subjects.')) {
            await api.delete(`/api/departments/${id}`); toast('Department deleted.'); navigate('departments');
          } break;
        case 'add-class': await loadReferenceData(); openClass(); break;
        case 'edit-class': {
          await loadReferenceData();
          const item = cache.classes.find((entry) => Number(entry.id) === id);
          if (item) openClass(item);
          break;
        }
        case 'delete-class':
          if (confirm('Delete this class? Classes in use by subjects cannot be deleted.')) {
            await api.delete(`/api/departments/classes/${id}`); toast('Class deleted.'); navigate('departments');
          } break;
        case 'add-subject': await loadReferenceData(); openSubject(); break;
        case 'edit-subject': {
          await loadReferenceData();
          const subject = cache.subjects.find((s) => Number(s.id) === id);
          if (subject) openSubject(subject);
          break;
        }
        case 'edit-slots': {
          await loadReferenceData();
          const subject = cache.subjects.find((s) => Number(s.id) === id);
          if (subject) openSubjectSlots(subject);
          break;
        }
        case 'delete-subject':
          if (confirm('Delete this subject? Allocated subjects must be unassigned first.')) {
            await api.delete(`/api/subjects/${id}`); toast('Subject deleted.'); navigate('subjects');
          } break;
        case 'preview-allocation': await previewAllocation(); break;
        case 'confirm-allocation': {
          if (!confirm('Save the current automatic allocation plan? The server will re-check current data.')) break;
          const saved = await result(api.post('/api/allocations/confirm'));
          toast(`${saved.proposed.length} subject allocation(s) saved; ${saved.unassigned.length} could not be assigned.`);
          await navigate('allocation');
          break;
        }
        case 'unassign-subject':
          if (confirm('Unassign this subject and free its timetable slots?')) {
            await api.delete(`/api/allocations/${id}`); toast('Subject unassigned.'); navigate('allocation');
          } break;
        case 'all-available': {
          const form = document.querySelector('#availability-form');
          const facultyId = new FormData(form).get('faculty_id');
          if (!facultyId) { toast('Select a faculty member first.', true); break; }
          form.querySelectorAll('[data-availability-slot]').forEach((checkbox) => { checkbox.checked = true; });
          break;
        }
        case 'export-csv':
          if (api.isStaticDemo) api.downloadCsv(button.dataset.type);
          else window.location.assign(`/api/reports/${button.dataset.type}.csv`);
          break;
      }
    } catch (error) { toast(error.message, true); }
  });

  modal.addEventListener('close', () => {
    modalForm.querySelector('[type=submit]').classList.remove('hidden');
    modalForm.dataset.formKind = '';
    modalForm.reset();
  });

  checkSession();
})();
