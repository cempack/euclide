use rusqlite::Connection;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn open() -> Connection {
    let conn = Connection::open(crate::paths::db_path()).expect("ouverture base impossible");
    conn.execute_batch(SCHEMA).expect("init schema");
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
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
