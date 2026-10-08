//! Versioned schema migrations (`PRAGMA user_version`).
//!
//! Each migration runs in its own transaction, with foreign keys off so a
//! table can be rebuilt. Before touching an existing database, a consistent
//! copy is written next to the data folder, and a database written by a newer
//! Euclide is refused rather than half-understood.
//!
//! Migrations stay non-destructive for one release: old tables and settings
//! are copied, not dropped, so a key opened by the previous version on another
//! PC keeps working.

use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, Transaction};
use std::path::Path;

pub const LATEST: i64 = 3;

type Up = fn(&Transaction, &Path) -> AppResult<()>;
const MIGRATIONS: &[(i64, Up)] = &[(1, v1), (2, v2), (3, v3)];

/// Columns added by releases that predate versioned migrations. Each statement
/// fails harmlessly when the column already exists.
pub fn add_legacy_columns(conn: &Connection) {
    const ADD_COLUMNS: &[&str] = &[
        "ALTER TABLE courses ADD COLUMN matiere TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE reminders ADD COLUMN course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL",
        "ALTER TABLE reminders ADD COLUMN repeat_rule TEXT NOT NULL DEFAULT 'none'",
        "ALTER TABLE course_classes ADD COLUMN last_item_id INTEGER REFERENCES sequence_items(id) ON DELETE SET NULL",
    ];
    for stmt in ADD_COLUMNS {
        let _ = conn.execute(stmt, []);
    }
}

pub fn user_version(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

/// Bring the database to `LATEST`. `snapshot_dir` receives a copy of the
/// database before the first migration (None for a brand-new database).
pub fn migrate(
    conn: &mut Connection,
    data_dir: &Path,
    snapshot_dir: Option<&Path>,
) -> AppResult<()> {
    let current = user_version(conn)?;
    if current > LATEST {
        return Err(AppError::user(format!(
            "Ces données ont été enregistrées par une version plus récente d'Euclide \
             (format {current}). Mettez Euclide à jour pour les ouvrir."
        )));
    }
    if current == LATEST {
        return Ok(());
    }
    if let Some(dir) = snapshot_dir {
        snapshot(conn, dir, current)?;
    }

    // Rebuilding a table needs foreign keys off, and that pragma has no effect
    // inside a transaction. Whatever happens, turn them back on.
    conn.pragma_update(None, "foreign_keys", false)?;
    let result = (|| -> AppResult<()> {
        for (version, up) in MIGRATIONS.iter().filter(|(v, _)| *v > current) {
            let tx = conn.transaction()?;
            up(&tx, data_dir)?;
            tx.pragma_update(None, "user_version", version)?;
            tx.commit()?;
        }
        Ok(())
    })();
    conn.pragma_update(None, "foreign_keys", true)?;
    result?;

    let broken: i64 = conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
        r.get(0)
    })?;
    if broken > 0 {
        crate::applog::warn(format!(
            "[db] {broken} foreign key(s) point at missing rows after migration"
        ));
    }
    Ok(())
}

/// `VACUUM INTO` a dated copy: consistent even with a WAL, and compact.
fn snapshot(conn: &Connection, dir: &Path, from: i64) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let dest = dir.join(format!(
        "euclide-avant-format-{LATEST}-depuis-{from}-{stamp}.db"
    ));
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().to_string()])
        .map_err(|e| {
            AppError::user(format!(
                "Euclide doit mettre ses données à jour mais n'a pas pu en faire une copie \
                 de sécurité dans {} : {e}. Libérez de la place sur la clé puis relancez.",
                dir.display()
            ))
        })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// v1
// ---------------------------------------------------------------------------

fn v1(tx: &Transaction, data_dir: &Path) -> AppResult<()> {
    // Paths are stored with « / » so a key filled on Windows opens elsewhere.
    tx.execute(
        "UPDATE files SET rel_path = replace(rel_path, char(92), '/') WHERE instr(rel_path, char(92)) > 0",
        [],
    )?;

    // course_classes: fresh databases had no foreign key on last_item_id while
    // upgraded ones did. Rebuild it once, dropping references to deleted rows.
    tx.execute_batch(
        "CREATE TABLE course_classes_v1 (
             id                  INTEGER PRIMARY KEY AUTOINCREMENT,
             course_id           INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
             class_name          TEXT NOT NULL,
             last_file_id        INTEGER REFERENCES files(id) ON DELETE SET NULL,
             last_item_id        INTEGER REFERENCES sequence_items(id) ON DELETE SET NULL,
             progress_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
             notes               TEXT NOT NULL DEFAULT '',
             UNIQUE(course_id, class_name)
         );
         INSERT INTO course_classes_v1
             (id, course_id, class_name, last_file_id, last_item_id, progress_updated_at, notes)
         SELECT id, course_id, class_name,
                CASE WHEN last_file_id IN (SELECT id FROM files) THEN last_file_id END,
                CASE WHEN last_item_id IN (SELECT id FROM sequence_items) THEN last_item_id END,
                progress_updated_at, notes
         FROM course_classes WHERE course_id IN (SELECT id FROM courses);
         DROP TABLE course_classes;
         ALTER TABLE course_classes_v1 RENAME TO course_classes;",
    )?;

    // Versions and annotations get real tables, deleted with their file.
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS file_versions (
             id         INTEGER PRIMARY KEY AUTOINCREMENT,
             file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
             rel_path   TEXT NOT NULL,
             label      TEXT NOT NULL DEFAULT '',
             size       INTEGER NOT NULL DEFAULT 0,
             created_at TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE TABLE IF NOT EXISTS file_annotations (
             file_id    INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
             json       TEXT NOT NULL,
             updated_at TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    )?;
    import_versions(tx, data_dir)?;
    tx.execute(
        "INSERT OR IGNORE INTO file_annotations (file_id, json)
         SELECT CAST(substr(key, 11) AS INTEGER), value FROM settings
         WHERE key LIKE 'pdf_annot_%' AND CAST(substr(key, 11) AS INTEGER) IN (SELECT id FROM files)",
        [],
    )?;

    // Full-text search, keyed by row id: removing an entry no longer scans the
    // whole index. Triggers keep names and notes in sync; PDF text is added by
    // the background indexer.
    tx.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
             name, content, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
         CREATE TEMP TABLE old_index AS
             SELECT CAST(file_id AS INTEGER) AS fid, content FROM doc_index;
         INSERT INTO doc_fts (rowid, name, content)
             SELECT f.id, f.name, COALESCE((SELECT content FROM old_index WHERE fid = f.id LIMIT 1), '')
             FROM files f;
         DROP TABLE old_index;
         CREATE TRIGGER IF NOT EXISTS files_fts_insert AFTER INSERT ON files BEGIN
             INSERT INTO doc_fts (rowid, name, content) VALUES (new.id, new.name, '');
         END;
         CREATE TRIGGER IF NOT EXISTS files_fts_rename AFTER UPDATE OF name ON files BEGIN
             UPDATE doc_fts SET name = new.name WHERE rowid = new.id;
         END;
         CREATE TRIGGER IF NOT EXISTS files_fts_delete AFTER DELETE ON files BEGIN
             DELETE FROM doc_fts WHERE rowid = old.id;
         END;

         CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
             title, body, content = 'notes', content_rowid = 'id',
             tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
         INSERT INTO note_fts (note_fts) VALUES ('rebuild');
         CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
             INSERT INTO note_fts (rowid, title, body) VALUES (new.id, new.title, new.body);
         END;
         CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
             INSERT INTO note_fts (note_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
         END;
         CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE OF title, body ON notes BEGIN
             INSERT INTO note_fts (note_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
             INSERT INTO note_fts (rowid, title, body) VALUES (new.id, new.title, new.body);
         END;",
    )?;

    // PDFs to (re)index in the background: those with no text yet.
    tx.execute_batch(
        "ALTER TABLE files ADD COLUMN index_state TEXT NOT NULL DEFAULT 'pending';
         UPDATE files SET index_state = CASE
             WHEN kind <> 'pdf' THEN 'skip'
             WHEN EXISTS (SELECT 1 FROM doc_fts WHERE rowid = files.id AND content <> '') THEN 'done'
             ELSE 'pending' END;",
    )?;

    // Indexes: drop the ones another index already covers, add the missing
    // ones on foreign-key columns (deleting a parent row scanned these tables).
    tx.execute_batch(
        "DROP INDEX IF EXISTS idx_files_course_id;
         DROP INDEX IF EXISTS idx_usage_events_kind;
         DROP INDEX IF EXISTS idx_course_classes_course_id;
         CREATE INDEX IF NOT EXISTS idx_course_classes_last_file ON course_classes(last_file_id);
         CREATE INDEX IF NOT EXISTS idx_course_classes_last_item ON course_classes(last_item_id);
         CREATE INDEX IF NOT EXISTS idx_sequence_items_file ON sequence_items(file_id);
         CREATE INDEX IF NOT EXISTS idx_reminders_course ON reminders(course_id);
         CREATE INDEX IF NOT EXISTS idx_schedule_course ON schedule(course_id);
         CREATE INDEX IF NOT EXISTS idx_file_versions_file ON file_versions(file_id, id);
         CREATE INDEX IF NOT EXISTS idx_files_pending ON files(id) WHERE index_state = 'pending';",
    )?;
    Ok(())
}

/// Version lists used to be JSON in settings (`file_versions_<id>`, older
/// `pdf_versions_<id>`), pointing at files in documents/.versions/.
fn import_versions(tx: &Transaction, data_dir: &Path) -> AppResult<()> {
    let rows: Vec<(String, String)> = tx
        .prepare(
            "SELECT key, value FROM settings \
             WHERE key LIKE 'file_versions_%' OR key LIKE 'pdf_versions_%' \
             ORDER BY key LIKE 'pdf_versions_%'",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut seen = std::collections::HashSet::new();
    let mut insert = tx.prepare(
        "INSERT INTO file_versions (file_id, rel_path, label, size, created_at) \
         SELECT ?1, ?2, ?3, ?4, COALESCE(?5, datetime('now')) WHERE ?1 IN (SELECT id FROM files)",
    )?;
    for (key, value) in rows {
        let Some(file_id) = key.rsplit('_').next().and_then(|n| n.parse::<i64>().ok()) else {
            continue;
        };
        // file_versions_ sorts first; the legacy key only counts when it is alone.
        if !seen.insert(file_id) {
            continue;
        }
        let entries: Vec<serde_json::Value> = serde_json::from_str(&value).unwrap_or_default();
        for entry in entries {
            let Some(name) = entry.get("backup_name").and_then(|v| v.as_str()) else {
                continue;
            };
            if name.contains(['/', '\\']) || name.contains("..") {
                continue;
            }
            let rel = format!("documents/.versions/{name}");
            let Ok(meta) = std::fs::metadata(data_dir.join(&rel)) else {
                continue; // nothing left to restore
            };
            let stamp = entry
                .get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let label = if stamp == "original" { "original" } else { "" };
            // "20261007_101500" → "2026-10-07 10:15:00"
            let created = chrono::NaiveDateTime::parse_from_str(stamp, "%Y%m%d_%H%M%S")
                .ok()
                .map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string());
            insert.execute(params![file_id, rel, label, meta.len() as i64, created])?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

/// What a lesson step needs in class: several documents, notes, Python
/// scripts and links instead of one document. The step's old `file_id`
/// becomes its first resource; the column stays, unused, for one release.
fn v2(tx: &Transaction, _data_dir: &Path) -> AppResult<()> {
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS sequence_item_resources (
             id       INTEGER PRIMARY KEY AUTOINCREMENT,
             item_id  INTEGER NOT NULL REFERENCES sequence_items(id) ON DELETE CASCADE,
             kind     TEXT NOT NULL CHECK (kind IN ('file', 'note', 'script', 'link')),
             -- files.id, notes.id or links.id; scripts go by file name.
             ref_id   INTEGER,
             ref_name TEXT NOT NULL DEFAULT '',
             position INTEGER NOT NULL DEFAULT 0,
             UNIQUE (item_id, kind, ref_id, ref_name)
         );
         CREATE INDEX IF NOT EXISTS idx_step_resources_item
             ON sequence_item_resources(item_id, position);

         -- A resource goes with the document, note or link it points at.
         CREATE TRIGGER IF NOT EXISTS step_resources_file_gone AFTER DELETE ON files BEGIN
             DELETE FROM sequence_item_resources WHERE kind = 'file' AND ref_id = OLD.id;
         END;
         CREATE TRIGGER IF NOT EXISTS step_resources_note_gone AFTER DELETE ON notes BEGIN
             DELETE FROM sequence_item_resources WHERE kind = 'note' AND ref_id = OLD.id;
         END;
         CREATE TRIGGER IF NOT EXISTS step_resources_link_gone AFTER DELETE ON links BEGIN
             DELETE FROM sequence_item_resources WHERE kind = 'link' AND ref_id = OLD.id;
         END;

         INSERT OR IGNORE INTO sequence_item_resources (item_id, kind, ref_id, position)
             SELECT id, 'file', file_id, 0 FROM sequence_items
             WHERE file_id IN (SELECT id FROM files);",
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// v3
// ---------------------------------------------------------------------------

/// Format 1 copied versions, annotations and the search index into tables
/// and kept the old copies for one release (0.3): they go now.
fn v3(tx: &Transaction, _data_dir: &Path) -> AppResult<()> {
    tx.execute_batch(
        r"DROP TABLE IF EXISTS doc_index;
          DELETE FROM settings
          WHERE key LIKE 'file\_versions\_%' ESCAPE '\'
             OR key LIKE 'pdf\_versions\_%' ESCAPE '\'
             OR key LIKE 'pdf\_annot\_%' ESCAPE '\';",
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SCHEMA;

    fn legacy_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        add_legacy_columns(&conn);
        conn
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("euclide-migr-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("documents/.versions")).unwrap();
        dir
    }

    #[test]
    fn v3_drops_what_format_1_kept_for_one_release() {
        let mut conn = legacy_db();
        conn.execute_batch(
            "INSERT INTO settings (key, value) VALUES
                 ('file_versions_7', '[]'), ('pdf_annot_8', '{}'), ('pdf_versions_9', '[]'),
                 ('theme', 'dark'), ('file_versionsX', 'kept');",
        )
        .unwrap();
        migrate(&mut conn, Path::new("/nonexistent"), None).unwrap();
        let keys: Vec<String> = conn
            .prepare("SELECT key FROM settings ORDER BY key")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(keys, ["file_versionsX", "theme"]);
        let index: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'doc_index'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(index, 0);
    }

    #[test]
    fn v2_turns_step_documents_into_resources() {
        let mut conn = legacy_db();
        conn.execute_batch(
            "INSERT INTO courses (id, name, emoji, color, description, matiere) VALUES (1, 'Maths', 'book', '#000', '', '');
             INSERT INTO files (id, course_id, name, rel_path, kind, size) VALUES (5, 1, 'cours.pdf', 'documents/cours.pdf', 'pdf', 1);
             INSERT INTO sequences (id, course_id, title) VALUES (1, 1, 'Fonctions');
             INSERT INTO sequence_items (id, sequence_id, title, file_id) VALUES (1, 1, 'Carré', 5), (2, 1, 'Inverse', NULL);",
        )
        .unwrap();
        migrate(&mut conn, Path::new("/nonexistent"), None).unwrap();
        let rows: Vec<(i64, String, i64)> = conn
            .prepare("SELECT item_id, kind, ref_id FROM sequence_item_resources")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(rows, [(1, "file".to_string(), 5)]);
        // Deleting the document takes the resource with it.
        conn.execute("DELETE FROM files WHERE id = 5", []).unwrap();
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM sequence_item_resources", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(left, 0);
    }

    #[test]
    fn fresh_database_reaches_latest() {
        let mut conn = legacy_db();
        migrate(&mut conn, Path::new("/nonexistent"), None).unwrap();
        assert_eq!(user_version(&conn).unwrap(), LATEST);
        // Idempotent: a second open does nothing.
        migrate(&mut conn, Path::new("/nonexistent"), None).unwrap();
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn v1_upgrades_a_0_1_13_database() {
        let dir = temp_dir("v1");
        std::fs::write(
            dir.join("documents/.versions/7_cours__v20261001_101500.pdf"),
            b"%PDF-old",
        )
        .unwrap();
        let mut conn = legacy_db();
        conn.execute_batch(
            // Old databases hold dangling references: insert them as they were.
            r#"PRAGMA foreign_keys = OFF;
              INSERT INTO courses (id, name) VALUES (1, 'Maths');
              INSERT INTO files (id, course_id, name, rel_path, kind) VALUES
                  (7, 1, 'cours.pdf', 'courses\1\cours.pdf', 'pdf'),
                  (8, NULL, 'photo.jpg', 'documents/photo.jpg', 'image');
              INSERT INTO doc_index (name, content, file_id) VALUES ('cours.pdf', 'fonction carrée', 7);
              INSERT INTO sequences (id, course_id, title) VALUES (1, 1, 'Fonctions');
              INSERT INTO sequence_items (id, sequence_id, title) VALUES (1, 1, 'Carré');
              INSERT INTO course_classes (course_id, class_name, last_file_id, last_item_id)
                  VALUES (1, '2NDE4', 7, 1), (1, '2NDE7', 999, 999);
              INSERT INTO notes (id, title, body) VALUES (3, 'Équations', 'résoudre');
              INSERT INTO settings (key, value) VALUES
                  ('file_versions_7', '[{"version":1,"timestamp":"20261001_101500","backup_name":"7_cours__v20261001_101500.pdf"},{"version":2,"timestamp":"20261002_101500","backup_name":"gone.pdf"}]'),
                  ('pdf_annot_8', '{"strokes":[]}');"#,
        )
        .unwrap();

        let snaps = dir.join("snapshots");
        migrate(&mut conn, &dir, Some(&snaps)).unwrap();
        assert_eq!(user_version(&conn).unwrap(), LATEST);
        assert_eq!(std::fs::read_dir(&snaps).unwrap().count(), 1);

        let rel: String = conn
            .query_row("SELECT rel_path FROM files WHERE id=7", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rel, "courses/1/cours.pdf");

        // Dangling progress pointers are cleared, valid ones kept.
        let kept: (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT last_file_id, last_item_id FROM course_classes WHERE class_name='2NDE4'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(kept, (Some(7), Some(1)));
        let cleared: (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT last_file_id, last_item_id FROM course_classes WHERE class_name='2NDE7'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(cleared, (None, None));

        // Only the version whose file still exists is imported.
        let versions: Vec<(String, String)> = conn
            .prepare("SELECT rel_path, created_at FROM file_versions WHERE file_id=7")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            versions,
            [(
                "documents/.versions/7_cours__v20261001_101500.pdf".to_string(),
                "2026-10-01 10:15:00".to_string()
            )]
        );
        let annot: String = conn
            .query_row(
                "SELECT json FROM file_annotations WHERE file_id=8",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(annot, r#"{"strokes":[]}"#);

        // Search: old PDF text carried over, accents ignored, notes indexed.
        let hit: i64 = conn
            .query_row(
                "SELECT rowid FROM doc_fts WHERE doc_fts MATCH 'carree'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hit, 7);
        let note: i64 = conn
            .query_row(
                "SELECT rowid FROM note_fts WHERE note_fts MATCH 'equa*'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(note, 3);
        let states: Vec<String> = conn
            .prepare("SELECT index_state FROM files ORDER BY id")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(states, ["done", "skip"]);

        // Triggers keep the index in sync from now on.
        conn.execute("UPDATE notes SET body='inéquations' WHERE id=3", [])
            .unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM note_fts WHERE note_fts MATCH 'inequations'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        conn.execute("DELETE FROM files WHERE id=7", []).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM doc_fts WHERE rowid=7", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 0);
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM file_versions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0, "versions follow their file");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_newer_database_is_refused() {
        let mut conn = legacy_db();
        conn.pragma_update(None, "user_version", LATEST + 1)
            .unwrap();
        let err = migrate(&mut conn, Path::new("/nonexistent"), None).unwrap_err();
        assert!(err.message().contains("plus récente"));
    }
}

/// Run by hand against a copy of real data:
/// `EUCLIDE_MIGRATION_SAMPLE=/copy/of/Euclide-Data cargo test real_data -- --ignored`
#[cfg(test)]
mod real_data {
    use super::*;

    #[test]
    #[ignore]
    fn migrates_a_copy_of_real_data() {
        let Ok(dir) = std::env::var("EUCLIDE_MIGRATION_SAMPLE") else {
            return;
        };
        let dir = std::path::PathBuf::from(dir);
        let mut conn = Connection::open(dir.join("euclide.db")).unwrap();
        let count = |conn: &Connection, table: &str| -> i64 {
            conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .unwrap()
        };
        let tables = [
            "courses",
            "files",
            "notes",
            "reminders",
            "sequences",
            "sequence_items",
            "course_classes",
            "schedule",
        ];
        let before: Vec<i64> = tables.iter().map(|t| count(&conn, t)).collect();
        add_legacy_columns(&conn);
        migrate(&mut conn, &dir, Some(&dir.join("snapshots"))).unwrap();
        let after: Vec<i64> = tables.iter().map(|t| count(&conn, t)).collect();
        println!("tables {tables:?}\nbefore {before:?}\nafter  {after:?}");
        assert_eq!(before, after);
        let check: String = conn
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(check, "ok");
        let fk: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(fk, 0);
        let fts: i64 = count(&conn, "doc_fts");
        assert_eq!(fts, count(&conn, "files"));
        println!(
            "user_version {} doc_fts {fts} versions {}",
            user_version(&conn).unwrap(),
            count(&conn, "file_versions")
        );
    }
}
