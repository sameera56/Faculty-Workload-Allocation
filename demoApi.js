(() => {
  const storageKey = 'faculty-workload-static-demo-v1';
  const demoAdmin = { id: 1, name: 'Demo Administrator', email: 'demo@facultyflow.local' };
  const defaultState = () => {
    const departments = [
      { id: 1, name: 'Computer Applications', code: 'MCA' },
      { id: 2, name: 'Computer Science', code: 'CSE' },
      { id: 3, name: 'Information Technology', code: 'IT' }
    ];
    const classes = [
      { id: 1, department_id: 1, department: departments[0].name, semester: 1, section: 'A', academic_year: '2026-2027' },
      { id: 2, department_id: 1, department: departments[0].name, semester: 3, section: 'A', academic_year: '2026-2027' },
      { id: 3, department_id: 2, department: departments[1].name, semester: 5, section: 'B', academic_year: '2026-2027' }
    ];
    const faculty = [
      { id: 1, faculty_code: 'FAC-101', name: 'Dr. Asha Menon', email: 'asha.menon@college.edu', department_id: 1, designation: 'Associate Professor', specialization: 'Database Systems', max_weekly_hours: 18 },
      { id: 2, faculty_code: 'FAC-102', name: 'Prof. Rohan Shah', email: 'rohan.shah@college.edu', department_id: 1, designation: 'Assistant Professor', specialization: 'Web Development', max_weekly_hours: 16 },
      { id: 3, faculty_code: 'FAC-103', name: 'Dr. Kavita Rao', email: 'kavita.rao@college.edu', department_id: 2, designation: 'Associate Professor', specialization: 'Data Science', max_weekly_hours: 18 }
    ];
    const subjects = [
      { id: 1, subject_code: 'MCA101', name: 'Database Management Systems', department_id: 1, class_id: 1, required_specialization: 'Database Systems', weekly_hours: 4, slots: [{ day_of_week: 1, period: 1 }, { day_of_week: 2, period: 2 }, { day_of_week: 3, period: 3 }, { day_of_week: 4, period: 4 }] },
      { id: 2, subject_code: 'MCA302', name: 'Full Stack Web Development', department_id: 1, class_id: 2, required_specialization: 'Web Development', weekly_hours: 5, slots: [] },
      { id: 3, subject_code: 'CSE505', name: 'Applied Data Science', department_id: 2, class_id: 3, required_specialization: 'Data Science', weekly_hours: 4, slots: [] }
    ];
    const availability = faculty.flatMap((person) =>
      Array.from({ length: 40 }, (_, index) => ({
        faculty_id: person.id,
        day_of_week: Math.floor(index / 8) + 1,
        period: index % 8 + 1
      }))
    );
    const allocations = [{ subject_id: 1, faculty_id: 1, assigned_hours: 4 }];
    const timetable = subjects[0].slots.map((slot) => ({
      subject_id: 1, faculty_id: 1, class_id: 1, ...slot
    }));
    return {
      admin: null,
      departments,
      classes,
      faculty,
      subjects,
      availability,
      allocations,
      timetable,
      history: [{
        id: 1, action: 'assigned', subject_id: 1, faculty_id: 1,
        created_at: new Date().toISOString()
      }]
    };
  };

  function readState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      const state = defaultState();
      writeState(state);
      return state;
    }
    try {
      return { ...defaultState(), ...JSON.parse(saved) };
    } catch (error) {
      throw new Error('Saved demo data could not be read. Clear this site’s local storage to reset the preview.');
    }
  }

  function writeState(state) {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }

  function wrap(data, meta) {
    return { success: true, data, ...(meta ? { meta } : {}) };
  }

  function workload(state) {
    return state.faculty.map((person) => {
      const assigned = state.allocations
        .filter((allocation) => allocation.faculty_id === person.id)
        .reduce((sum, allocation) => sum + Number(allocation.assigned_hours), 0);
      const department = state.departments.find((item) => item.id === person.department_id);
      return {
        ...person,
        department: department?.name || '',
        assigned_hours: assigned,
        remaining_hours: Number(person.max_weekly_hours) - assigned,
        utilization_percent: Math.round(assigned * 1000 / Number(person.max_weekly_hours)) / 10
      };
    });
  }

  function subjectRows(state) {
    return state.subjects.map((subject) => {
      const section = state.classes.find((item) => item.id === subject.class_id);
      const allocation = state.allocations.find((item) => item.subject_id === subject.id);
      const person = state.faculty.find((item) => item.id === allocation?.faculty_id);
      return {
        ...subject,
        department: state.departments.find((item) => item.id === subject.department_id)?.name || '',
        semester: section?.semester ?? '',
        section: section?.section ?? '',
        academic_year: section?.academic_year ?? '',
        faculty_name: person?.name || null,
        assigned_hours: allocation?.assigned_hours ?? null
      };
    });
  }

  function eligibleFaculty(state, subject) {
    const loads = workload(state);
    return loads.filter((person) =>
      person.department_id === subject.department_id
      && person.specialization.trim().toLowerCase() === subject.required_specialization.trim().toLowerCase()
    ).map((person) => {
      let reason = null;
      const existing = state.allocations.find((allocation) => allocation.subject_id === subject.id);
      const alreadyAssigned = existing?.faculty_id === person.id ? Number(existing.assigned_hours) : 0;
      const currentLoad = person.assigned_hours - alreadyAssigned;
      if (person.max_weekly_hours - currentLoad < Number(subject.weekly_hours)) {
        reason = 'Would exceed maximum weekly hours.';
      }
      if (!reason) {
        for (const slot of subject.slots || []) {
          const isAvailable = state.availability.some((item) =>
            item.faculty_id === person.id && item.day_of_week === Number(slot.day_of_week)
            && item.period === Number(slot.period)
          );
          if (!isAvailable) {
            reason = `Unavailable on day ${slot.day_of_week}, period ${slot.period}.`;
            break;
          }
          const conflict = state.timetable.some((item) =>
            item.subject_id !== subject.id && item.day_of_week === Number(slot.day_of_week)
            && item.period === Number(slot.period)
            && (item.faculty_id === person.id || item.class_id === subject.class_id)
          );
          if (conflict) {
            reason = `Timetable conflict on day ${slot.day_of_week}, period ${slot.period}.`;
            break;
          }
        }
      }
      return {
        ...person,
        assigned_hours: currentLoad,
        remaining_hours: person.max_weekly_hours - currentLoad,
        utilization_percent: Math.round(currentLoad * 1000 / Number(person.max_weekly_hours)) / 10,
        eligible: !reason,
        reason
      };
    });
  }

  function plan(state) {
    const pending = state.subjects.filter((subject) =>
      !state.allocations.some((allocation) => allocation.subject_id === subject.id)
    );
    const ordered = pending.slice().sort((a, b) => {
      const count = (subject) => eligibleFaculty(state, subject).filter((person) => person.eligible).length;
      return count(a) - count(b) || b.weekly_hours - a.weekly_hours || a.id - b.id;
    });
    const proposed = [];
    const unassigned = [];
    for (const subject of ordered) {
      const candidates = eligibleFaculty(state, subject).filter((person) => person.eligible);
      candidates.sort((a, b) =>
        a.assigned_hours / a.max_weekly_hours - b.assigned_hours / b.max_weekly_hours
        || a.assigned_hours - b.assigned_hours || a.id - b.id
      );
      const person = candidates[0];
      if (!person) {
        const all = eligibleFaculty(state, subject);
        const reason = !all.length
          ? 'No faculty member matches the required department and specialization.'
          : all.every((item) => item.remaining_hours < subject.weekly_hours)
            ? 'All matching faculty members would exceed their weekly workload limit.'
            : 'Matching faculty are unavailable or have timetable conflicts in the requested slots.';
        unassigned.push({ subject_id: subject.id, subject_code: subject.subject_code, subject_name: subject.name, reason });
        continue;
      }
      proposed.push({
        subject_id: subject.id,
        subject_code: subject.subject_code,
        subject_name: subject.name,
        faculty_id: person.id,
        faculty_name: person.name,
        assigned_hours: Number(subject.weekly_hours),
        slots: subject.slots || []
      });
      state.allocations.push({ subject_id: subject.id, faculty_id: person.id, assigned_hours: Number(subject.weekly_hours) });
      for (const slot of subject.slots || []) {
        state.timetable.push({ subject_id: subject.id, faculty_id: person.id, class_id: subject.class_id, ...slot });
      }
    }
    const workloadAfter = workload(state).map((person) => ({
      faculty_id: person.id,
      faculty_name: person.name,
      assigned_hours: person.assigned_hours,
      max_weekly_hours: person.max_weekly_hours,
      remaining_hours: person.remaining_hours
    }));
    return { proposed, unassigned, workload_after: workloadAfter };
  }

  function addHistory(state, action, subjectId, facultyId) {
    state.history.unshift({
      id: Date.now(),
      action,
      subject_id: Number(subjectId),
      faculty_id: facultyId ?? null,
      created_at: new Date().toISOString()
    });
  }

  function makeCsv(type, rows) {
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    return [columns.map(quote).join(','), ...rows.map((row) => columns.map((key) => quote(row[key])).join(','))].join('\r\n');
  }

  async function request(url, options = {}) {
    const method = options.method || 'GET';
    const path = new URL(url, window.location.href).pathname.replace(/\/+$/, '') || '/';
    const body = options.body ? JSON.parse(options.body) : {};
    const state = readState();

    if (path === '/api/auth/login' && method === 'POST') {
      if (body.email?.toLowerCase() !== demoAdmin.email || body.password !== 'faculty-demo') {
        fail('Use the demo credentials shown above.', 401);
      }
      state.admin = demoAdmin;
      writeState(state);
      return wrap(demoAdmin);
    }
    if (path === '/api/auth/me' && method === 'GET') {
      if (!state.admin) fail('Static demo login required.', 401);
      return wrap(state.admin);
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      state.admin = null;
      writeState(state);
      return wrap({ logged_out: true });
    }
    if (!state.admin) fail('Sign in to the static demo to continue.', 401);

    if (path === '/api/dashboard' && method === 'GET') {
      const loaded = workload(state);
      return wrap({
        summary: {
          total_faculty: state.faculty.length,
          total_subjects: state.subjects.length,
          total_departments: state.departments.length,
          assigned_hours: state.allocations.reduce((sum, item) => sum + Number(item.assigned_hours), 0),
          pending_subjects: state.subjects.filter((subject) => !state.allocations.some((item) => item.subject_id === subject.id)).length,
          faculty_with_capacity: loaded.filter((person) => person.remaining_hours > 0).length,
          faculty_at_limit: loaded.filter((person) => person.remaining_hours <= 0).length
        },
        workload: loaded,
        departments: state.departments.map((department) => ({
          id: department.id,
          name: department.name,
          assigned_hours: state.allocations.filter((allocation) =>
            state.subjects.find((subject) => subject.id === allocation.subject_id)?.department_id === department.id
          ).reduce((sum, allocation) => sum + Number(allocation.assigned_hours), 0)
        })),
        recent_activity: state.history.slice(0, 8).map((item) => {
          const subject = state.subjects.find((entry) => entry.id === item.subject_id);
          const person = state.faculty.find((entry) => entry.id === item.faculty_id);
          return {
            ...item,
            subject_code: subject?.subject_code || '',
            subject_name: subject?.name || '',
            faculty_name: person?.name || null
          };
        })
      });
    }

    if (path === '/api/faculty/workload/summary' && method === 'GET') return wrap(workload(state));
    if (path === '/api/faculty' && method === 'GET') {
      const query = new URL(url, window.location.href).searchParams;
      const search = (query.get('search') || '').toLowerCase();
      const department = Number(query.get('department_id')) || null;
      const sort = query.get('sort') || 'name';
      const direction = query.get('order') === 'desc' ? -1 : 1;
      const page = Math.max(1, Number(query.get('page')) || 1);
      const limit = Math.max(1, Number(query.get('limit')) || 10);
      let rows = workload(state).filter((person) =>
        (!department || person.department_id === department)
        && `${person.name} ${person.faculty_code} ${person.email} ${person.specialization}`.toLowerCase().includes(search)
      );
      rows.sort((a, b) => {
        const left = sort === 'utilization' ? a.utilization_percent
          : sort === 'assigned_hours' ? a.assigned_hours
            : sort === 'department' ? a.department
              : a[sort] || a.name;
        const right = sort === 'utilization' ? b.utilization_percent
          : sort === 'assigned_hours' ? b.assigned_hours
            : sort === 'department' ? b.department
              : b[sort] || b.name;
        return (typeof left === 'string' ? left.localeCompare(right) : left - right) * direction;
      });
      const total = rows.length;
      return wrap(rows.slice((page - 1) * limit, page * limit), { page, limit, total, pages: Math.ceil(total / limit) });
    }

    const facultyMatch = path.match(/^\/api\/faculty\/(\d+)$/);
    if (facultyMatch && method === 'GET') {
      const person = workload(state).find((item) => item.id === Number(facultyMatch[1]));
      if (!person) fail('Faculty member not found.', 404);
      return wrap({
        ...person,
        subjects: state.allocations.filter((item) => item.faculty_id === person.id).map((item) => {
          const subject = state.subjects.find((entry) => entry.id === item.subject_id);
          return { id: subject.id, subject_code: subject.subject_code, name: subject.name, assigned_hours: item.assigned_hours };
        })
      });
    }
    if (facultyMatch && method === 'PUT') {
      const id = Number(facultyMatch[1]);
      const existing = state.faculty.find((item) => item.id === id);
      if (!existing) fail('Faculty member not found.', 404);
      validateFaculty(state, body, id);
      Object.assign(existing, body, { email: body.email.toLowerCase(), department_id: Number(body.department_id), max_weekly_hours: Number(body.max_weekly_hours) });
      writeState(state);
      return wrap(existing);
    }
    if (facultyMatch && method === 'DELETE') {
      const id = Number(facultyMatch[1]);
      if (state.allocations.some((item) => item.faculty_id === id) || state.timetable.some((item) => item.faculty_id === id)) fail('Unassign this faculty member before deleting.', 409);
      const initialCount = state.faculty.length;
      state.faculty = state.faculty.filter((item) => item.id !== id);
      state.availability = state.availability.filter((item) => item.faculty_id !== id);
      if (state.faculty.length === initialCount) fail('Faculty member not found.', 404);
      writeState(state);
      return wrap({ deleted: true });
    }
    if (path === '/api/faculty' && method === 'POST') {
      validateFaculty(state, body);
      const person = {
        ...body, id: nextId(state.faculty), department_id: Number(body.department_id),
        max_weekly_hours: Number(body.max_weekly_hours), email: body.email.toLowerCase()
      };
      state.faculty.push(person);
      writeState(state);
      return wrap(person);
    }

    if (path === '/api/departments/classes' && method === 'GET') return wrap(state.classes);
    if (path === '/api/departments/classes' && method === 'POST') {
      const department = state.departments.find((item) => item.id === Number(body.department_id));
      if (!department) fail('Choose an existing department.', 422);
      const item = { ...body, id: nextId(state.classes), department_id: Number(body.department_id), semester: Number(body.semester), department: department.name };
      state.classes.push(item);
      writeState(state);
      return wrap(item);
    }
    const classMatch = path.match(/^\/api\/departments\/classes\/(\d+)$/);
    if (classMatch) {
      const id = Number(classMatch[1]);
      const item = state.classes.find((entry) => entry.id === id);
      if (method === 'PUT') {
        if (!item) fail('Class or section not found.', 404);
        if (state.subjects.some((subject) => subject.class_id === id && subject.department_id !== Number(body.department_id))) fail('A class used by subjects cannot be moved to another department.', 409);
        const department = state.departments.find((entry) => entry.id === Number(body.department_id));
        if (!department) fail('Choose an existing department.', 422);
        Object.assign(item, body, { department_id: Number(body.department_id), semester: Number(body.semester), department: department.name });
        writeState(state);
        return wrap(item);
      }
      if (method === 'DELETE') {
        if (!item) fail('Class or section not found.', 404);
        if (state.subjects.some((subject) => subject.class_id === id)) fail('A class used by subjects cannot be deleted.', 409);
        state.classes = state.classes.filter((entry) => entry.id !== id);
        writeState(state);
        return wrap({ deleted: true });
      }
    }

    if (path === '/api/departments' && method === 'GET') {
      return wrap(state.departments.map((department) => ({
        ...department,
        faculty_count: state.faculty.filter((person) => person.department_id === department.id).length,
        subject_count: state.subjects.filter((subject) => subject.department_id === department.id).length
      })));
    }
    if (path === '/api/departments' && method === 'POST') {
      if (state.departments.some((item) => item.code.toLowerCase() === String(body.code).toLowerCase())) fail('Department code already exists.', 409);
      const department = { id: nextId(state.departments), name: body.name, code: body.code };
      state.departments.push(department);
      writeState(state);
      return wrap(department);
    }
    const departmentMatch = path.match(/^\/api\/departments\/(\d+)$/);
    if (departmentMatch) {
      const id = Number(departmentMatch[1]);
      const department = state.departments.find((item) => item.id === id);
      if (method === 'PUT') {
        if (!department) fail('Department not found.', 404);
        Object.assign(department, body);
        writeState(state);
        return wrap(department);
      }
      if (method === 'DELETE') {
        if (!department) fail('Department not found.', 404);
        if (state.faculty.some((person) => person.department_id === id)
          || state.classes.some((item) => item.department_id === id)
          || state.subjects.some((item) => item.department_id === id)) fail('This department is in use and cannot be deleted.', 409);
        state.departments = state.departments.filter((item) => item.id !== id);
        writeState(state);
        return wrap({ deleted: true });
      }
    }

    if (path === '/api/subjects' && method === 'GET') return wrap(subjectRows(state));
    const eligibleMatch = path.match(/^\/api\/subjects\/(\d+)\/eligible$/);
    if (eligibleMatch && method === 'GET') {
      const subject = state.subjects.find((item) => item.id === Number(eligibleMatch[1]));
      if (!subject) fail('Subject not found.', 404);
      return wrap(eligibleFaculty(state, subject));
    }
    if (path === '/api/subjects' && method === 'POST') {
      validateSubject(state, body);
      const subject = {
        ...body, id: nextId(state.subjects),
        department_id: Number(body.department_id), class_id: Number(body.class_id),
        weekly_hours: Number(body.weekly_hours), slots: []
      };
      state.subjects.push(subject);
      writeState(state);
      return wrap(subject);
    }
    const subjectMatch = path.match(/^\/api\/subjects\/(\d+)$/);
    if (subjectMatch) {
      const id = Number(subjectMatch[1]);
      const subject = state.subjects.find((item) => item.id === id);
      if (method === 'PUT') {
        if (!subject) fail('Subject not found.', 404);
        validateSubject(state, body, id);
        if (state.allocations.some((item) => item.subject_id === id)) fail('Unassign this subject before editing it.', 409);
        Object.assign(subject, body, { department_id: Number(body.department_id), class_id: Number(body.class_id), weekly_hours: Number(body.weekly_hours) });
        writeState(state);
        return wrap(subject);
      }
      if (method === 'DELETE') {
        if (!subject) fail('Subject not found.', 404);
        if (state.allocations.some((item) => item.subject_id === id)) fail('Unassign this subject before deleting it.', 409);
        state.subjects = state.subjects.filter((item) => item.id !== id);
        writeState(state);
        return wrap({ deleted: true });
      }
    }
    const slotsMatch = path.match(/^\/api\/subjects\/(\d+)\/slots$/);
    if (slotsMatch && method === 'PUT') {
      const subject = state.subjects.find((item) => item.id === Number(slotsMatch[1]));
      if (!subject) fail('Subject not found.', 404);
      if (state.allocations.some((item) => item.subject_id === subject.id)) fail('Unassign this subject before changing timetable slots.', 409);
      if (body.slots.length && body.slots.length !== Number(subject.weekly_hours)) fail('Choose no slots or one slot for each weekly teaching hour.', 422);
      const keys = body.slots.map((slot) => `${slot.day_of_week}:${slot.period}`);
      if (new Set(keys).size !== keys.length) fail('Timetable slots must not be duplicated.', 422);
      subject.slots = body.slots;
      writeState(state);
      return wrap({ subject_id: subject.id, slots: subject.slots });
    }

    if (path === '/api/allocations/preview' && method === 'POST') return wrap({ ...plan(copyState(state)), saved: false });
    if (path === '/api/allocations/confirm' && method === 'POST') {
      const proposed = plan(state);
      for (const item of proposed.proposed) addHistory(state, 'assigned', item.subject_id, item.faculty_id);
      writeState(state);
      return wrap({ ...proposed, saved: true });
    }
    if (path === '/api/allocations/manual' && method === 'POST') {
      const subject = state.subjects.find((item) => item.id === Number(body.subject_id));
      if (!subject) fail('Subject not found.', 404);
      const person = state.faculty.find((item) => item.id === Number(body.faculty_id));
      if (!person) fail('Faculty member not found.', 404);
      const candidates = eligibleFaculty(state, subject);
      const candidate = candidates.find((item) => item.id === person.id);
      if (!candidate) fail('Faculty member does not match the subject department and specialization.', 422);
      if (!candidate.eligible) fail(candidate.reason, 409);
      const reassigned = state.allocations.some((item) => item.subject_id === subject.id);
      state.allocations = state.allocations.filter((item) => item.subject_id !== subject.id);
      state.timetable = state.timetable.filter((item) => item.subject_id !== subject.id);
      state.allocations.push({ subject_id: subject.id, faculty_id: person.id, assigned_hours: Number(subject.weekly_hours) });
      for (const slot of subject.slots || []) state.timetable.push({ subject_id: subject.id, faculty_id: person.id, class_id: subject.class_id, ...slot });
      addHistory(state, reassigned ? 'reassigned' : 'assigned', subject.id, person.id);
      writeState(state);
      return wrap({ subject_id: subject.id, faculty_id: person.id, assigned_hours: Number(subject.weekly_hours) });
    }
    const allocationMatch = path.match(/^\/api\/allocations\/(\d+)$/);
    if (allocationMatch && method === 'DELETE') {
      const subjectId = Number(allocationMatch[1]);
      const allocation = state.allocations.find((item) => item.subject_id === subjectId);
      if (!allocation) fail('Subject is not currently assigned.', 404);
      state.allocations = state.allocations.filter((item) => item.subject_id !== subjectId);
      state.timetable = state.timetable.filter((item) => item.subject_id !== subjectId);
      addHistory(state, 'unassigned', subjectId, null);
      writeState(state);
      return wrap({ unassigned: true });
    }

    if (path === '/api/timetable' && method === 'GET') {
      const assignments = state.timetable.map((slot) => ({
        ...slot,
        faculty_name: state.faculty.find((person) => person.id === slot.faculty_id)?.name || '',
        subject_code: state.subjects.find((subject) => subject.id === slot.subject_id)?.subject_code || '',
        subject_name: state.subjects.find((subject) => subject.id === slot.subject_id)?.name || '',
        semester: state.classes.find((item) => item.id === slot.class_id)?.semester || '',
        section: state.classes.find((item) => item.id === slot.class_id)?.section || '',
        department: state.departments.find((department) => department.id === state.classes.find((item) => item.id === slot.class_id)?.department_id)?.name || ''
      }));
      const availability = state.availability.map((slot) => ({
        ...slot, faculty_name: state.faculty.find((person) => person.id === slot.faculty_id)?.name || ''
      }));
      return wrap({ assignments, availability });
    }
    const availabilityMatch = path.match(/^\/api\/timetable\/availability\/(\d+)$/);
    if (availabilityMatch && method === 'PUT') {
      const facultyId = Number(availabilityMatch[1]);
      if (!state.faculty.some((person) => person.id === facultyId)) fail('Faculty member not found.', 404);
      const wanted = new Set(body.slots.map((slot) => `${slot.day_of_week}:${slot.period}`));
      if (state.timetable.some((slot) => slot.faculty_id === facultyId && !wanted.has(`${slot.day_of_week}:${slot.period}`))) {
        fail('Availability cannot be removed while assigned in that period.', 409);
      }
      state.availability = state.availability.filter((slot) => slot.faculty_id !== facultyId);
      for (const slot of body.slots) state.availability.push({ faculty_id: facultyId, day_of_week: Number(slot.day_of_week), period: Number(slot.period) });
      writeState(state);
      return wrap({ faculty_id: facultyId, slots: body.slots });
    }

    if (path === '/api/reports/conflicts/summary' && method === 'GET') {
      const unassigned = subjectRows(state).filter((subject) => !subject.faculty_name).map((subject) => ({
        id: subject.id, subject_code: subject.subject_code, name: subject.name,
        weekly_hours: subject.weekly_hours, department: subject.department
      }));
      return wrap({ conflicts: [], unassigned });
    }
    const csvMatch = path.match(/^\/api\/reports\/(faculty|department|subject)\.csv$/);
    if (csvMatch && method === 'GET') return wrap(reportRows(state, csvMatch[1]));
    const reportMatch = path.match(/^\/api\/reports\/(faculty|department|subject)$/);
    if (reportMatch && method === 'GET') return wrap(reportRows(state, reportMatch[1]));

    fail(`Static demo does not implement ${method} ${path}.`, 404);
  }

  function copyState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function nextId(items) {
    return items.reduce((largest, item) => Math.max(largest, Number(item.id) || 0), 0) + 1;
  }

  function validateFaculty(state, body, exceptId) {
    const fields = ['faculty_code', 'name', 'email', 'designation', 'specialization'];
    if (fields.some((key) => !String(body[key] || '').trim())
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '')
      || !Number.isInteger(Number(body.department_id))
      || !Number.isInteger(Number(body.max_weekly_hours))
      || Number(body.max_weekly_hours) < 1 || Number(body.max_weekly_hours) > 40) {
      fail('Enter valid faculty details and weekly hours (1–40).', 422);
    }
    if (!state.departments.some((item) => item.id === Number(body.department_id))) fail('Choose an existing department.', 422);
    if (state.faculty.some((item) => item.id !== exceptId
      && (item.faculty_code.toLowerCase() === body.faculty_code.toLowerCase()
        || item.email.toLowerCase() === body.email.toLowerCase()))) fail('Faculty ID or email already exists.', 409);
    const assigned = state.allocations.filter((item) => item.faculty_id === exceptId)
      .reduce((sum, item) => sum + Number(item.assigned_hours), 0);
    if (Number(body.max_weekly_hours) < assigned) fail('Maximum hours cannot be below current assigned hours.', 409);
  }

  function validateSubject(state, body, exceptId) {
    const section = state.classes.find((item) => item.id === Number(body.class_id));
    if (!String(body.subject_code || '').trim() || !String(body.name || '').trim()
      || !String(body.required_specialization || '').trim()
      || !Number.isInteger(Number(body.weekly_hours)) || Number(body.weekly_hours) < 1 || Number(body.weekly_hours) > 20) {
      fail('Enter valid subject details and weekly hours (1–20).', 422);
    }
    if (!section || section.department_id !== Number(body.department_id)) fail('The selected class must belong to the selected department.', 422);
    if (state.subjects.some((item) => item.id !== exceptId && item.subject_code.toLowerCase() === body.subject_code.toLowerCase())) fail('Subject code already exists.', 409);
  }

  function reportRows(state, type) {
    const subjects = subjectRows(state);
    if (type === 'faculty') return workload(state).map((person) => ({
      faculty_code: person.faculty_code, faculty_name: person.name, department: person.department,
      designation: person.designation, specialization: person.specialization,
      max_weekly_hours: person.max_weekly_hours, assigned_hours: person.assigned_hours,
      remaining_hours: person.remaining_hours, utilization_percent: person.utilization_percent
    }));
    if (type === 'department') return state.departments.map((department) => ({
      code: department.code, department: department.name,
      faculty_count: state.faculty.filter((person) => person.department_id === department.id).length,
      subject_count: subjects.filter((subject) => subject.department_id === department.id).length,
      assigned_hours: state.allocations.filter((allocation) =>
        state.subjects.find((subject) => subject.id === allocation.subject_id)?.department_id === department.id
      ).reduce((sum, allocation) => sum + Number(allocation.assigned_hours), 0),
      unassigned_subjects: subjects.filter((subject) => subject.department_id === department.id && !subject.faculty_name).length
    }));
    return subjects.map((subject) => ({
      subject_code: subject.subject_code, subject_name: subject.name, department: subject.department,
      semester: subject.semester, section: subject.section,
      required_specialization: subject.required_specialization, weekly_hours: subject.weekly_hours,
      faculty_name: subject.faculty_name, assigned_hours: subject.assigned_hours,
      status: subject.faculty_name ? 'Assigned' : 'Pending'
    }));
  }

  function downloadCsv(type) {
    const rows = reportRows(readState(), type);
    const blob = new Blob([`\uFEFF${makeCsv(type, rows)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  window.facultyStaticDemo = { request, downloadCsv };
})();
