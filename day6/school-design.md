# School Database Design
This database stores students, the courses they can take, and which student is enrolled on which course, with their grade.

## Tables

### students
- Holds one row per student.
- `student_id` is the primary key.
- `name` is required (`NOT NULL`).
- `email` is required and `UNIQUE`, so two students cannot share an email address.

### courses
- Holds one row per course.
- `course_id` is the primary key.
- `title` and `credits` are required (`NOT NULL`).

### enrolments
- Holds one row for each time a student enrols on a course.
- `enrolment_id` is the primary key.
- `student_id` is a foreign key pointing to `students`.
- `course_id` is a foreign key pointing to `courses`.
- `grade` is allowed to be empty (`NULL`) because a grade is not known when a student first enrols.
- `UNIQUE (student_id, course_id)` stops the same student enrolling on the same course twice.

## Relationships

- **One student to many enrolments (one-to-many):** one student can have many enrolment rows, but each enrolment row belongs to exactly one student.
- **One course to many enrolments (one-to-many):** one course can have many enrolment rows, but each enrolment row belongs to exactly one course.
- **Students to courses (many-to-many):** one student can take many courses, and one course has many students.

### Why a join table is needed

A relational table cannot hold a list of values in one cell. If we put a list of courses inside the `students` table, or a list of students inside `courses`, we would break the rules of good design and make searching and updating very hard. The `enrolments` table solves this by turning one many-to-many relationship into two one-to-many relationships. It also gives us a natural place to store facts about the link itself, such as the grade.

## Index I would add

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);
```

**Reason:** the queries "all students on one course" and "number of students per course" search the `enrolments` table by `course_id`. The `UNIQUE (student_id, course_id)` rule already gives a fast lookup by student, but not by course alone. With many thousands of enrolments, an index on `course_id` lets the database jump straight to the rows for one course instead of scanning the whole table.

## SQL or NoSQL?

I would choose SQL (a relational database) for this system. School data is highly structured and full of relationships: students, courses and enrolments always have the same fields, and they depend on each other. A relational database can enforce the rules we need, such as unique emails, foreign keys that stop an enrolment pointing to a student who does not exist, and a rule that blocks duplicate enrolments. It also handles joins and counts well, which we need for questions like "which students are on this course?" and "how many students are on each course?". It supports transactions too, so a change such as moving a student between courses either fully succeeds or does not happen at all, and that matters for records like grades. NoSQL would be a better fit if the data had no fixed shape or had to be spread across many servers at a very large scale, but neither is the main need here.