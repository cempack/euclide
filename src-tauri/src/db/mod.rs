mod migrations;
mod schema;

pub(crate) use schema::SCHEMA;

use crate::error::AppResult;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

/// The database. One writer connection plus two read-only ones: in WAL mode
/// reads never wait behind a write. Async access (`read` / `write`) runs on
/// the blocking thread pool, never on the UI thread.
#[derive(Clone)]
pub struct Db(Arc<Pool>);

struct Pool {
    writer: Mutex<Connection>,
    readers: Vec<Mutex<Connection>>,
    next: AtomicUsize,
}

/// A panic while a connection was locked must not break every later command.
fn lock(conn: &Mutex<Connection>) -> MutexGuard<'_, Connection> {
    conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Db> {
        // An existing database gets a safety copy before any migration.
        let existed = std::fs::metadata(path)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
        let mut writer = Connection::open(path)?;
        writer.execute_batch(SCHEMA)?;
        migrations::add_legacy_columns(&writer);
        let data_dir = path.parent().unwrap_or(Path::new("."));
        let snapshots = existed.then(crate::paths::backups_dir);
        migrations::migrate(&mut writer, data_dir, snapshots.as_deref())?;
        // FULL: the data lives on a USB key that can be pulled out at any time.
        writer.execute_batch(
            "PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
        )?;
        writer.set_prepared_statement_cache_capacity(64);
        // Readers are an optimisation: if they cannot be opened, the writer serves reads.
        let readers = (0..2)
            .map_while(|_| open_reader(path).ok())
            .map(Mutex::new)
            .collect();
        Ok(Db(Arc::new(Pool {
            writer: Mutex::new(writer),
            readers,
            next: AtomicUsize::new(0),
        })))
    }

    /// The writer, for setup code and commands not yet converted to `read`/`write`.
    pub fn lock(&self) -> MutexGuard<'_, Connection> {
        lock(&self.0.writer)
    }

    /// Run `f` on a read-only connection, for code already on a blocking thread.
    pub fn read_blocking<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let pool = &self.0;
        if pool.readers.is_empty() {
            return f(&lock(&pool.writer));
        }
        let i = pool.next.fetch_add(1, Ordering::Relaxed) % pool.readers.len();
        f(&lock(&pool.readers[i]))
    }

    /// Run `f` on a read-only connection, off the UI thread.
    pub async fn read<T, F>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&Connection) -> AppResult<T> + Send + 'static,
        T: Send + 'static,
    {
        let pool = self.0.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if pool.readers.is_empty() {
                return f(&lock(&pool.writer));
            }
            let i = pool.next.fetch_add(1, Ordering::Relaxed) % pool.readers.len();
            f(&lock(&pool.readers[i]))
        })
        .await?
    }

    /// Run `f` on the writer connection, off the UI thread.
    pub async fn write<T, F>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&mut Connection) -> AppResult<T> + Send + 'static,
        T: Send + 'static,
    {
        let pool = self.0.clone();
        tauri::async_runtime::spawn_blocking(move || f(&mut lock(&pool.writer))).await?
    }
}

fn open_reader(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_NO_MUTEX
            | OpenFlags::SQLITE_OPEN_URI,
    )?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch("PRAGMA temp_store = MEMORY;")?;
    conn.set_prepared_statement_cache_capacity(64);
    Ok(conn)
}

/// Drop a couple of friendly starter demos so the Tools screen isn't empty.
pub fn seed_python_demos() {
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

/// An in-memory database at the latest format, for tests.
#[cfg(test)]
pub fn migrations_for_tests() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(SCHEMA).unwrap();
    migrations::add_legacy_columns(&conn);
    migrations::migrate(&mut conn, Path::new("."), None).unwrap();
    conn
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
            .query_row("SELECT course_id FROM notes WHERE id=?1", [note_id], |r| {
                r.get(0)
            })
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
        conn.execute("DELETE FROM courses WHERE id=?1", [course_id])
            .unwrap();
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
    fn reminders_carry_course_and_recurrence() {
        let conn = mem();
        conn.execute(
            "INSERT INTO courses (name, emoji, color, description, matiere) VALUES ('NSI', 'code', '#000', '', 'NSI')",
            [],
        )
        .unwrap();
        let course_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO reminders (title, due_at, course_id, repeat_rule) VALUES (?1, ?2, ?3, ?4)",
            params!["Photocopies", "2025-06-02T21:59:59Z", course_id, "weekly"],
        )
        .unwrap();
        let (course, rule): (Option<i64>, String) = conn
            .query_row(
                "SELECT course_id, repeat_rule FROM reminders LIMIT 1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(course, Some(course_id));
        assert_eq!(rule, "weekly");

        // Deleting the course must not delete the reminder, only unlink it.
        conn.execute("DELETE FROM courses WHERE id=?1", [course_id])
            .unwrap();
        let after: Option<i64> = conn
            .query_row("SELECT course_id FROM reminders LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(after, None);
    }

    #[test]
    fn sequences_cascade_from_course_and_keep_order() {
        let conn = mem();
        conn.execute(
            "INSERT INTO courses (name, emoji, color, description, matiere) VALUES ('Maths', 'calc', '#000', '', 'Mathématiques')",
            [],
        )
        .unwrap();
        let course_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO sequences (course_id, title, position) VALUES (?1, 'Fonctions affines', 0)",
            [course_id],
        )
        .unwrap();
        let seq_id = conn.last_insert_rowid();
        for (i, title) in ["Activité d'introduction", "Cours", "Exercices"]
            .iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO sequence_items (sequence_id, title, position) VALUES (?1, ?2, ?3)",
                params![seq_id, title, i as i64],
            )
            .unwrap();
        }
        let titles: Vec<String> = conn
            .prepare("SELECT title FROM sequence_items WHERE sequence_id=?1 ORDER BY position")
            .unwrap()
            .query_map([seq_id], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            titles,
            vec!["Activité d'introduction", "Cours", "Exercices"]
        );

        conn.execute("DELETE FROM courses WHERE id=?1", [course_id])
            .unwrap();
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM sequence_items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0);
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
