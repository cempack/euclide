//! Markdown notes, attached to a course or not.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::Note;
use rusqlite::{params, Connection, Row};
use tauri::State;

const NOTE_COLS: &str = "id, course_id, title, body, updated_at";

fn map_note(r: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        course_id: r.get(1)?,
        title: r.get(2)?,
        body: r.get(3)?,
        updated_at: r.get(4)?,
    })
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Note> {
    Ok(conn.query_row(
        &format!("SELECT {NOTE_COLS} FROM notes WHERE id=?1"),
        [id],
        map_note,
    )?)
}

/// Notes of one course (`None`: notes without a course), newest first.
pub fn list_for_course(conn: &Connection, course_id: Option<i64>) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {NOTE_COLS} FROM notes WHERE course_id IS ?1 ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map([course_id], map_note)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {NOTE_COLS} FROM notes ORDER BY updated_at DESC"
    ))?;
    let rows = stmt.query_map([], map_note)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn save(conn: &Connection, note: &Note) -> AppResult<Note> {
    let id = if note.id > 0 {
        let changed = conn.execute(
            "UPDATE notes SET title=?1, body=?2, course_id=?3, updated_at=datetime('now') WHERE id=?4",
            params![note.title, note.body, note.course_id, note.id],
        )?;
        if changed == 0 {
            // Deleted elsewhere while it was open: do not silently recreate it.
            return Err(AppError::not_found("Cette note a été supprimée."));
        }
        note.id
    } else {
        conn.execute(
            "INSERT INTO notes (course_id, title, body) VALUES (?1, ?2, ?3)",
            params![note.course_id, note.title, note.body],
        )?;
        conn.last_insert_rowid()
    };
    get(conn, id)
}

pub fn rename(conn: &Connection, id: i64, title: &str) -> AppResult<Note> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::user("Le titre ne peut pas être vide."));
    }
    conn.execute(
        "UPDATE notes SET title=?1, updated_at=datetime('now') WHERE id=?2",
        params![title, id],
    )?;
    get(conn, id)
}

#[tauri::command]
pub async fn list_notes(db: State<'_, Db>, course_id: Option<i64>) -> AppResult<Vec<Note>> {
    db.read(move |conn| list_for_course(conn, course_id)).await
}

#[tauri::command]
pub async fn all_notes(db: State<'_, Db>) -> AppResult<Vec<Note>> {
    db.read(list_all).await
}

#[tauri::command]
pub async fn get_note(db: State<'_, Db>, id: i64) -> AppResult<Note> {
    db.read(move |conn| get(conn, id)).await
}

#[tauri::command]
pub async fn save_note(db: State<'_, Db>, note: Note) -> AppResult<Note> {
    db.write(move |conn| save(conn, &note)).await
}

#[tauri::command]
pub async fn delete_note(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM notes WHERE id=?1", [id])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn rename_note(db: State<'_, Db>, id: i64, new_title: String) -> AppResult<Note> {
    db.write(move |conn| rename(conn, id, &new_title)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn
    }

    fn note(id: i64, title: &str, body: &str) -> Note {
        Note {
            id,
            course_id: None,
            title: title.into(),
            body: body.into(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn save_creates_then_updates_and_refuses_a_deleted_note() {
        let conn = mem();
        let created = save(&conn, &note(0, "Cours", "# Titre\n\n- un point")).unwrap();
        assert!(created.id > 0);
        let updated = save(&conn, &note(created.id, "Cours 2", "suite")).unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(list_all(&conn).unwrap().len(), 1);
        conn.execute("DELETE FROM notes WHERE id=?1", [created.id])
            .unwrap();
        assert_eq!(
            save(&conn, &note(created.id, "x", "y")).unwrap_err().code(),
            "not_found"
        );
        assert!(list_all(&conn).unwrap().is_empty());
    }
}
