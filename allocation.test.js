const test = require('node:test');
const assert = require('node:assert/strict');
const { planAllocations } = require('../src/services/allocationService');

function fixture(overrides = {}) {
  return {
    subjects: [{
      id: 1, subject_code: 'MCA101', name: 'Database Systems', department_id: 1,
      required_specialization: 'Database Systems', weekly_hours: 4, slots: []
    }],
    faculty: [{
      id: 1, name: 'Dr. Asha Menon', department_id: 1,
      specialization: 'Database Systems', max_weekly_hours: 18, assigned_hours: 0
    }],
    existingAllocations: [],
    timetable: [],
    availability: [],
    ...overrides
  };
}

test('proposes an allocation for eligible faculty', () => {
  const plan = planAllocations(fixture());
  assert.equal(plan.proposed.length, 1);
  assert.equal(plan.proposed[0].faculty_id, 1);
  assert.equal(plan.proposed[0].assigned_hours, 4);
  assert.equal(plan.unassigned.length, 0);
});

test('does not exceed maximum weekly workload', () => {
  const input = fixture({ faculty: [{
    id: 1, name: 'Dr. Asha Menon', department_id: 1,
    specialization: 'Database Systems', max_weekly_hours: 3, assigned_hours: 0
  }] });
  const plan = planAllocations(input);
  assert.equal(plan.proposed.length, 0);
  assert.match(plan.unassigned[0].reason, /exceed their weekly workload limit/);
});

test('rejects a specialization mismatch', () => {
  const input = fixture({ faculty: [{
    id: 1, name: 'Prof. Rohan Shah', department_id: 1,
    specialization: 'Web Development', max_weekly_hours: 18, assigned_hours: 0
  }] });
  const plan = planAllocations(input);
  assert.equal(plan.proposed.length, 0);
  assert.match(plan.unassigned[0].reason, /required department and specialization/);
});

test('rejects a faculty timetable conflict', () => {
  const subject = { ...fixture().subjects[0], slots: [{ day_of_week: 1, period: 2 }] };
  const input = fixture({
    subjects: [subject],
    availability: [{ faculty_id: 1, day_of_week: 1, period: 2 }],
    timetable: [{ faculty_id: 1, day_of_week: 1, period: 2 }]
  });
  const plan = planAllocations(input);
  assert.equal(plan.proposed.length, 0);
  assert.match(plan.unassigned[0].reason, /unavailable or have timetable conflicts/);
});

test('requires availability for scheduled periods', () => {
  const input = fixture({
    subjects: [{ ...fixture().subjects[0], slots: [{ day_of_week: 2, period: 3 }] }]
  });
  const plan = planAllocations(input);
  assert.equal(plan.proposed.length, 0);
  assert.equal(plan.unassigned.length, 1);
});

test('reports subjects when no eligible faculty exists', () => {
  const input = fixture({ faculty: [] });
  const plan = planAllocations(input);
  assert.deepEqual(plan.proposed, []);
  assert.equal(plan.unassigned[0].subject_code, 'MCA101');
  assert.ok(plan.unassigned[0].reason);
});

test('distributes workload to the currently least-loaded eligible faculty', () => {
  const subjects = [1, 2].map((id) => ({
    id, subject_code: `SUB${id}`, name: `Subject ${id}`, department_id: 1,
    required_specialization: 'Database Systems', weekly_hours: 4, slots: []
  }));
  const faculty = [1, 2].map((id) => ({
    id, name: `Faculty ${id}`, department_id: 1, specialization: 'Database Systems',
    max_weekly_hours: 16, assigned_hours: 0
  }));
  const plan = planAllocations(fixture({ subjects, faculty }));
  assert.deepEqual(plan.proposed.map((item) => item.faculty_id), [1, 2]);
  assert.deepEqual(plan.workload_after.map((item) => item.assigned_hours), [4, 4]);
});

test('uses stable faculty-id tie breaking for equal workload percentages', () => {
  const input = fixture({
    faculty: [
      { id: 9, name: 'Later ID', department_id: 1, specialization: 'Database Systems', max_weekly_hours: 16, assigned_hours: 0 },
      { id: 2, name: 'Earlier ID', department_id: 1, specialization: 'Database Systems', max_weekly_hours: 16, assigned_hours: 0 }
    ]
  });
  const plan = planAllocations(input);
  assert.equal(plan.proposed.length, 1);
  assert.equal(plan.proposed[0].faculty_id, 2);
});

test('does not propose subjects which already have an allocation', () => {
  const plan = planAllocations(fixture({ existingAllocations: [{ subject_id: 1, faculty_id: 1 }] }));
  assert.equal(plan.proposed.length, 0);
  assert.equal(plan.unassigned.length, 0);
});
