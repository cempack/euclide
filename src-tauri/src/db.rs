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

#[cfg(test)]
mod tests {
    use super::SCHEMA;
    use rusqlite::{params, Connection};

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn
    }

    #[test]
    fn schema_course_note_reminder_and_cascade() {
        let conn = mem();
        conn.execute(
            "INSERT INTO courses (name, emoji, color, description, matiere) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["Seconde", "book", "#5B7BE8", "algo", "NSI"],
        )
        .unwrap();
        let course_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO notes (course_id, title, body) VALUES (?1, ?2, ?3)",
            params![course_id, "Intro", "bonjour"],
        )
        .unwrap();
        let note_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO reminders (title, due_at) VALUES (?1, ?2)",
            params!["DS vendredi", Option::<String>::None],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, course_id, source) VALUES (1, '08:00', '09:00', 'NSI', 'B12', ?1, 'manual')",
            [course_id],
        )
        .unwrap();

        // Retargeting a note to "général" must persist (the previous UPDATE omitted course_id).
        conn.execute(
            "UPDATE notes SET title=?1, body=?2, course_id=?3, updated_at=datetime('now') WHERE id=?4",
            params!["Intro 2", "suite", Option::<i64>::None, note_id],
        )
        .unwrap();
        let course_after: Option<i64> = conn
            .query_row("SELECT course_id FROM notes WHERE id=?1", [note_id], |r| r.get(0))
            .unwrap();
        assert_eq!(course_after, None);

        let n_rem: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminders", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n_rem, 1);

        // Attach a note back to the course, then deleting the course must cascade-delete it.
        conn.execute(
            "UPDATE notes SET course_id=?1 WHERE id=?2",
            params![course_id, note_id],
        )
        .unwrap();
        conn.execute("DELETE FROM courses WHERE id=?1", [course_id]).unwrap();
        let notes_left: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(notes_left, 0);
        let sched_course: Option<i64> = conn
            .query_row("SELECT course_id FROM schedule LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sched_course, None);
    }

    #[test]
    fn fts_index_matches_unicode_content() {
        let conn = mem();
        conn.execute(
            "INSERT INTO doc_index (name, content, file_id) VALUES ('exos.pdf', 'théorème de pythagore', 42)",
            [],
        )
        .unwrap();
        let file_id: i64 = conn
            .query_row(
                "SELECT file_id FROM doc_index WHERE doc_index MATCH 'pythagore'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(file_id, 42);
    }

    #[test]
    fn course_classes_unique_per_course() {
        let conn = mem();
        conn.execute(
            "INSERT INTO courses (name, emoji, color, description, matiere) VALUES ('C', 'book', '#000', '', 'NSI')",
            [],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO course_classes (course_id, class_name) VALUES (?1, '1G1')",
            [id],
        )
        .unwrap();
        let dup = conn.execute(
            "INSERT INTO course_classes (course_id, class_name) VALUES (?1, '1G1')",
            [id],
        );
        assert!(dup.is_err());
    }
}

