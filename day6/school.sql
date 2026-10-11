 School database: students, courses and enrolments

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

 1. CREATE TABLE statements

CREATE TABLE students (
  student_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
  course_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  credits    INTEGER NOT NULL
);

--Join table: one row = one student enrolled on one course
CREATE TABLE enrolments (
  enrolment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL,
  course_id    INTEGER NOT NULL,
  grade        TEXT,
  FOREIGN KEY (student_id) REFERENCES students (student_id),
  FOREIGN KEY (course_id)  REFERENCES courses (course_id),
  -- the same student cannot enrol on the same course twice
  UNIQUE (student_id, course_id)
);

-- 2. INSERT statements (sample data)

INSERT INTO students (name, email) VALUES
  ('Jackline Odhiambo', 'jackline@example.com'),
  ('Brian Kathure',    'brian@example.com'),
  ('Cynthia Wambui','cynthia@example.com'),
  ('David Ocholla',   'david@example.com');

INSERT INTO courses (title, credits) VALUES
  ('Web Development', 4),
  ('Databases',       3),
  ('Data Science',    4);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 'A'),
  (1, 2, 'B'),
  (2, 1, 'B'),
  (2, 3, 'C'),
  (3, 2, 'A'),
  (3, 1, NULL);

-- ------------------------------------------------------------
-- 3. Queries
-- ------------------------------------------------------------

-- Query 1: all courses for one student (by name)
SELECT courses.title, courses.credits, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.student_id
JOIN courses    ON courses.course_id     = enrolments.course_id
WHERE students.name = 'Jackline Odhiambo';

-- Query 2: all students on one course
SELECT students.name, students.email, enrolments.grade
FROM courses
JOIN enrolments ON enrolments.course_id  = courses.course_id
JOIN students   ON students.student_id   = enrolments.student_id
WHERE courses.title = 'Web Development';

-- Query 3: number of students per course
-- (LEFT JOIN so a course with no students would still show 0)
SELECT courses.title, COUNT(enrolments.enrolment_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.course_id
GROUP BY courses.course_id, courses.title;

-- Query 4: students who have no enrolments
SELECT students.name, students.email
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.student_id
WHERE enrolments.enrolment_id IS NULL;

-- Query 5: update one enrolment's grade
-- (Cynthia's grade for Web Development was empty, now she gets a 'B')
UPDATE enrolments
SET grade = 'B'
WHERE student_id = (SELECT student_id FROM students WHERE name = 'Cynthia Wambui')
  AND course_id  = (SELECT course_id  FROM courses  WHERE title = 'Web Development');

-- Check that the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.student_id = enrolments.student_id
JOIN courses  ON courses.course_id   = enrolments.course_id
WHERE students.name = 'Cynthia Wambui';