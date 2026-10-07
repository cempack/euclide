//! The baseline schema, as shipped before versioned migrations (user_version 0).
//! Later changes live in `migrations.rs`; this text only changes when a
//! migration makes one of its statements obsolete.

pub(crate) const SCHEMA: &str = r#"
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
    last_item_id        INTEGER,  -- step of a sequence (see `sequence_items`)
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

-- Reminders. `course_id` ties a reminder to a course so it can surface on the
-- course page and next to the class in progress; `repeat_rule` is a tiny
-- recurrence ('none' | 'daily' | 'weekly' | 'monthly'): completing a recurring
-- reminder schedules the next occurrence instead of ending the series.
CREATE TABLE IF NOT EXISTS reminders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    due_at      TEXT,
    done        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    repeat_rule TEXT NOT NULL DEFAULT 'none'
);

-- Sequences: the teaching progression of a course, as chapters (sequences)
-- containing steps (items). A step may point at a document from the course
-- locker. Per-class progress points at a step, which is what makes "where is
-- 3C in the chapter?" answerable — the previous model only remembered the last
-- document opened.
CREATE TABLE IF NOT EXISTS sequences (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sequence_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    file_id     INTEGER REFERENCES files(id) ON DELETE SET NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
CREATE INDEX IF NOT EXISTS idx_files_added_at ON files(added_at);
CREATE INDEX IF NOT EXISTS idx_files_course_added ON files(course_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_kind_created ON usage_events(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_course_kind_created ON usage_events(course_id, kind, created_at);


CREATE INDEX IF NOT EXISTS idx_notes_course_id ON notes(course_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_day_start ON schedule(day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_source ON schedule(source);

CREATE INDEX IF NOT EXISTS idx_sequences_course ON sequences(course_id, position);
CREATE INDEX IF NOT EXISTS idx_sequence_items_sequence ON sequence_items(sequence_id, position);
"#;
