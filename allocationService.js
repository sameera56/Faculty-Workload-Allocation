function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function slotKey(slot) {
  return `${Number(slot.day_of_week ?? slot.day)}:${Number(slot.period)}`;
}

function planAllocations({ subjects, faculty, existingAllocations = [], timetable = [], availability = [] }) {
  const loads = new Map(faculty.map((person) => [Number(person.id), Number(person.assigned_hours || 0)]));
  const assignedSubjects = new Set(existingAllocations.map((item) => Number(item.subject_id)));
  const occupiedByFaculty = new Map();
  for (const entry of timetable) {
    const key = `${Number(entry.faculty_id)}:${slotKey(entry)}`;
    occupiedByFaculty.set(key, true);
  }

  const availableSlots = new Set(
    availability.map((entry) => `${Number(entry.faculty_id)}:${slotKey(entry)}`)
  );
  const orderedSubjects = subjects
    .filter((subject) => !assignedSubjects.has(Number(subject.id)))
    .slice()
    .sort((a, b) => {
      const eligibilityDifference = faculty.filter((person) =>
        normalize(person.specialization) === normalize(a.required_specialization)
        && Number(person.department_id) === Number(a.department_id)
      ).length - faculty.filter((person) =>
        normalize(person.specialization) === normalize(b.required_specialization)
        && Number(person.department_id) === Number(b.department_id)
      ).length;
      return eligibilityDifference || Number(b.weekly_hours) - Number(a.weekly_hours) || Number(a.id) - Number(b.id);
    });

  const proposed = [];
  const unassigned = [];

  for (const subject of orderedSubjects) {
    const hours = Number(subject.weekly_hours);
    const slots = subject.slots || [];
    const eligible = faculty.filter((person) =>
      normalize(person.specialization) === normalize(subject.required_specialization)
      && Number(person.department_id) === Number(subject.department_id)
    );
    const withinCapacity = eligible.filter((person) =>
      Number(person.max_weekly_hours) - loads.get(Number(person.id)) >= hours
    );
    const compatible = withinCapacity.filter((person) => {
      if (!slots.length) return true;
      return slots.every((slot) => {
        const key = `${Number(person.id)}:${slotKey(slot)}`;
        return availableSlots.has(key) && !occupiedByFaculty.has(key);
      });
    });

    compatible.sort((a, b) => {
      const loadA = loads.get(Number(a.id));
      const loadB = loads.get(Number(b.id));
      const utilizationA = loadA / Number(a.max_weekly_hours);
      const utilizationB = loadB / Number(b.max_weekly_hours);
      return utilizationA - utilizationB || loadA - loadB || Number(a.id) - Number(b.id);
    });

    const selected = compatible[0];
    if (!selected) {
      let reason;
      if (!eligible.length) reason = 'No faculty member matches the required department and specialization.';
      else if (!withinCapacity.length) reason = 'All matching faculty members would exceed their weekly workload limit.';
      else if (slots.length) reason = 'Matching faculty are unavailable or have timetable conflicts in the requested slots.';
      else reason = 'No eligible faculty member is available.';
      unassigned.push({ subject_id: Number(subject.id), subject_code: subject.subject_code, subject_name: subject.name, reason });
      continue;
    }

    const allocation = {
      subject_id: Number(subject.id),
      subject_code: subject.subject_code,
      subject_name: subject.name,
      faculty_id: Number(selected.id),
      faculty_name: selected.name,
      assigned_hours: hours,
      slots
    };
    proposed.push(allocation);
    loads.set(Number(selected.id), loads.get(Number(selected.id)) + hours);
    for (const slot of slots) {
      occupiedByFaculty.set(`${Number(selected.id)}:${slotKey(slot)}`, true);
    }
  }

  return { proposed, unassigned, workload_after: faculty.map((person) => ({
    faculty_id: Number(person.id),
    faculty_name: person.name,
    assigned_hours: loads.get(Number(person.id)),
    max_weekly_hours: Number(person.max_weekly_hours),
    remaining_hours: Number(person.max_weekly_hours) - loads.get(Number(person.id))
  })) };
}

module.exports = { planAllocations };
