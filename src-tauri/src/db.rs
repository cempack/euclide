use rusqlite::Connection;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn open() -> Connection {
    let conn = Connection::open(crate::paths::db_path()).expect("ouverture base impossible");
    conn.execute_batch(SCHEMA).expect("init schema");
    // Migration for existing DBs: add matiere column to courses (for subject filtering with Pronote)
    let _ = conn.execute("ALTER TABLE courses ADD COLUMN matiere TEXT NOT NULL DEFAULT ''", []);

    // Performance PRAGMAs (WAL already in SCHEMA; these are safe to re-apply).
    // synchronous=NORMAL is good balance with WAL; busy_timeout helps under contention; temp_store in mem.
    let _ = conn.execute_batch(r#"
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
"#);

    seed_python_demos();
    conn
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '📘',
    color       TEXT NOT NULL DEFAULT '#5B7BE8',
    description TEXT NOT NULL DEFAULT '',
    matiere     TEXT NOT NULL DEFAULT '',  -- e.g. "Mathématiques" or "NSI" (for Pronote subject filtering)
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Course classes: each course can be attached to one or more classes/groups.
-- Names must match exactly the class names used on Pronote (e.g. "3D", "1S1").
-- Per class: progress (last document worked on), and teacher notes specific to that class.
CREATE TABLE IF NOT EXISTS course_classes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id           INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    class_name          TEXT NOT NULL,
    last_file_id        INTEGER REFERENCES files(id) ON DELETE SET NULL,
    progress_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes               TEXT NOT NULL DEFAULT '',
    UNIQUE(course_id, class_name)
);

CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    rel_path  TEXT NOT NULL,
    kind      TEXT NOT NULL DEFAULT 'file',
    size      INTEGER NOT NULL DEFAULT 0,
    added_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    due_at     TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS links (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    url   TEXT NOT NULL,
    icon  TEXT NOT NULL DEFAULT '🔗'
);

CREATE TABLE IF NOT EXISTS schedule (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    day_of_week INTEGER NOT NULL,
    start_time  TEXT NOT NULL,
    end_time    TEXT NOT NULL,
    subject     TEXT NOT NULL,
    room        TEXT NOT NULL DEFAULT '',
    course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    source      TEXT NOT NULL DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS usage_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    course_id  INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS doc_index USING fts5(
    name,
    content,
    file_id UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- Performance indexes for common hot paths (list by course, recents, recap aggregates on usage_events, etc.).
-- Added for "snappier" app (faster queries under global lock; safe for existing DBs).
CREATE INDEX IF NOT EXISTS idx_files_course_id ON files(course_id);
CREATE INDEX IF NOT EXISTS idx_files_added_at ON files(added_at);
CREATE INDEX IF NOT EXISTS idx_files_course_added ON files(course_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_kind ON usage_events(kind);
CREATE INDEX IF NOT EXISTS idx_usage_events_kind_created ON usage_events(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_course_kind_created ON usage_events(course_id, kind, created_at);

CREATE INDEX IF NOT EXISTS idx_course_classes_course_id ON course_classes(course_id);

CREATE INDEX IF NOT EXISTS idx_notes_course_id ON notes(course_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_day_start ON schedule(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_source ON schedule(source);
"#;

/// Drop a couple of friendly starter demos so the Tools screen isn't empty.
fn seed_python_demos() {
    let dir = crate::paths::python_dir();
    let hello = dir.join("bonjour.py");
    if !hello.exists() {
        let _ = std::fs::write(
            &hello,
            "print(\"Bonjour Monsieur Madrias !\")\nprint(\"Euclide est pret pour le cours.\")\n",
        );
    }
    let table = dir.join("table_de_multiplication.py");
    if !table.exists() {
        let _ = std::fs::write(
            &table,
            "n = 7\nfor i in range(1, 11):\n    print(f\"{n} x {i:>2} = {n*i}\")\n",
        );
    }
}
