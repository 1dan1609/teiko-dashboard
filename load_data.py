"""
Builds the normalized SQLite database (teiko.db) from cell-count.csv.

Run directly: python load_data.py
"""

import sqlite3
import csv
import os

DB_PATH = "teiko.db"
CSV_PATH = "cell-count.csv"

SCHEMA_SQL = """
DROP TABLE IF EXISTS cell_counts;
DROP TABLE IF EXISTS samples;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS projects;

CREATE TABLE projects (
    project_id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_name TEXT NOT NULL UNIQUE
);

CREATE TABLE subjects (
    subject_id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_name TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    condition TEXT NOT NULL,
    age INTEGER NOT NULL,
    sex TEXT NOT NULL,
    treatment TEXT NOT NULL,
    response TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(project_id),
    UNIQUE (project_id, subject_name)
);

CREATE TABLE samples (
    sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_name TEXT NOT NULL UNIQUE,
    subject_id INTEGER NOT NULL,
    sample_type TEXT NOT NULL,
    time_from_treatment_start INTEGER NOT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(subject_id)
);

CREATE TABLE cell_counts (
    count_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL UNIQUE,
    b_cell INTEGER NOT NULL,
    cd8_t_cell INTEGER NOT NULL,
    cd4_t_cell INTEGER NOT NULL,
    nk_cell INTEGER NOT NULL,
    monocyte INTEGER NOT NULL,
    FOREIGN KEY (sample_id) REFERENCES samples(sample_id)
);

-- Foreign keys are not indexed automatically in SQLite, so every analysis
-- query's joins would otherwise scan. The cohort index covers the
-- condition/treatment/response filter that Parts 3 and 4 both open with.
CREATE INDEX idx_samples_subject ON samples(subject_id);
CREATE INDEX idx_samples_timepoint ON samples(time_from_treatment_start, sample_type);
CREATE INDEX idx_subjects_project ON subjects(project_id);
CREATE INDEX idx_subjects_cohort ON subjects(condition, treatment, response);
"""


def init_db(conn):
    """Drop existing tables and recreate the normalized schema."""
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def load_csv(conn):
    """Read cell-count.csv, deduplicate projects/subjects, and insert all records."""
    cursor = conn.cursor()
    projects = {}
    subjects = {}

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            proj_name = row["project"]
            if proj_name not in projects:
                cursor.execute(
                    "INSERT INTO projects (project_name) VALUES (?)",
                    (proj_name,),
                )
                projects[proj_name] = cursor.lastrowid

            # Keyed by (project, subject) rather than subject alone: subject
            # codes are only promised unique within a project, so a global key
            # would silently merge two different patients from two projects.
            subj_name = row["subject"]
            subj_key = (proj_name, subj_name)
            if subj_key not in subjects:
                response = row["response"] if row["response"].strip() else None
                cursor.execute(
                    """INSERT INTO subjects
                       (subject_name, project_id, condition, age, sex, treatment, response)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        subj_name,
                        projects[proj_name],
                        row["condition"],
                        int(row["age"]),
                        row["sex"],
                        row["treatment"],
                        response,
                    ),
                )
                subjects[subj_key] = cursor.lastrowid

            cursor.execute(
                """INSERT INTO samples
                   (sample_name, subject_id, sample_type, time_from_treatment_start)
                   VALUES (?, ?, ?, ?)""",
                (
                    row["sample"],
                    subjects[subj_key],
                    row["sample_type"],
                    int(row["time_from_treatment_start"]),
                ),
            )
            sample_id = cursor.lastrowid

            cursor.execute(
                """INSERT INTO cell_counts
                   (sample_id, b_cell, cd8_t_cell, cd4_t_cell, nk_cell, monocyte)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    sample_id,
                    int(row["b_cell"]),
                    int(row["cd8_t_cell"]),
                    int(row["cd4_t_cell"]),
                    int(row["nk_cell"]),
                    int(row["monocyte"]),
                ),
            )

    conn.commit()


if __name__ == "__main__":
    # Deleted rather than just re-created: the schema DROPs its own tables,
    # but starting from no file at all also clears anything left behind by an
    # older schema version, keeping repeat runs of `make pipeline` identical.
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    init_db(conn)
    load_csv(conn)

    # Counts are read back from the database rather than tallied during the
    # insert loop, so the summary reports what actually landed.
    cursor = conn.cursor()
    table_counts = {}
    for table in ["projects", "subjects", "samples", "cell_counts"]:
        count = cursor.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        table_counts[table] = count

    print(f"Database '{DB_PATH}' created successfully.")
    print(f"  Projects:    {table_counts['projects']}")
    print(f"  Subjects:    {table_counts['subjects']}")
    print(f"  Samples:     {table_counts['samples']}")
    print(f"  Cell counts: {table_counts['cell_counts']}")

    conn.close()
