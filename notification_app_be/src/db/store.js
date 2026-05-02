// quick in-memory store — stands in for a real DB (PostgreSQL in prod)
// using Maps so lookups stay O(1)

const notifications = new Map();   // notifID -> notification object
const students = new Map();         // studentID -> { id, name, email }

// seed a few students so the app actually works
const seedStudents = [
  { id: 'stu_001', name: 'Rahul Mehta', email: 'rahul@srmist.edu.in' },
  { id: 'stu_002', name: 'Priya Singh', email: 'priya@srmist.edu.in' },
  { id: 'stu_003', name: 'Arjun Das', email: 'arjun@srmist.edu.in' },
];
seedStudents.forEach(s => students.set(s.id, s));

module.exports = { notifications, students };
