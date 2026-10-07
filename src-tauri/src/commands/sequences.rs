//! Sequences: the teaching progression of a course, made of ordered steps.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{Sequence, SequenceItem};
use rusqlite::{params, Connection, Row};
use tauri::State;

const SEQUENCE_COLS: &str = "id, course_id, title, position, created_at";
const ITEM_SELECT: &str =
    "SELECT si.id, si.sequence_id, si.title, si.position, si.file_id, f.name, f.kind \
     FROM sequence_items si LEFT JOIN files f ON f.id = si.file_id";

fn map_sequence(r: &Row) -> rusqlite::Result<Sequence> {
    Ok(Sequence {
        id: r.get(0)?,
        course_id: r.get(1)?,
        title: r.get(2)?,
        position: r.get(3)?,
        created_at: r.get(4)?,
    })
}

fn map_item(r: &Row) -> rusqlite::Result<SequenceItem> {
    Ok(SequenceItem {
        id: r.get(0)?,
        sequence_id: r.get(1)?,
        title: r.get(2)?,
        position: r.get(3)?,
        file_id: r.get(4)?,
        file_name: r.get(5)?,
        file_kind: r.get(6)?,
    })
}

fn clean_title(title: &str) -> AppResult<&str> {
    let title = title.trim();
    if title.is_empty() {
        Err(AppError::user("Titre vide"))
    } else {
        Ok(title)
    }
}

pub fn list(conn: &Connection, course_id: i64) -> AppResult<Vec<Sequence>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {SEQUENCE_COLS} FROM sequences WHERE course_id = ?1 ORDER BY position, id"
    ))?;
    let rows = stmt.query_map([course_id], map_sequence)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Every step of every sequence of a course, in display order.
pub fn list_items(conn: &Connection, course_id: i64) -> AppResult<Vec<SequenceItem>> {
    let mut stmt = conn.prepare_cached(
        "SELECT si.id, si.sequence_id, si.title, si.position, si.file_id, f.name, f.kind \
         FROM sequence_items si \
         JOIN sequences sq ON sq.id = si.sequence_id \
         LEFT JOIN files f ON f.id = si.file_id \
         WHERE sq.course_id = ?1 \
         ORDER BY sq.position, sq.id, si.position, si.id",
    )?;
    let rows = stmt.query_map([course_id], map_item)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, course_id: i64, title: &str) -> AppResult<Sequence> {
    let title = clean_title(title)?;
    conn.execute(
        "INSERT INTO sequences (course_id, title, position) \
         VALUES (?1, ?2, (SELECT COALESCE(MAX(position) + 1, 0) FROM sequences WHERE course_id = ?1))",
        params![course_id, title],
    )?;
    Ok(conn.query_row(
        &format!("SELECT {SEQUENCE_COLS} FROM sequences WHERE id = ?1"),
        [conn.last_insert_rowid()],
        map_sequence,
    )?)
}

pub fn create_item(
    conn: &Connection,
    sequence_id: i64,
    title: &str,
    file_id: Option<i64>,
) -> AppResult<SequenceItem> {
    let title = clean_title(title)?;
    conn.execute(
        "INSERT INTO sequence_items (sequence_id, title, file_id, position) VALUES (?1, ?2, ?3, \
         (SELECT COALESCE(MAX(position) + 1, 0) FROM sequence_items WHERE sequence_id = ?1))",
        params![sequence_id, title, file_id],
    )?;
    Ok(conn.query_row(
        &format!("{ITEM_SELECT} WHERE si.id = ?1"),
        [conn.last_insert_rowid()],
        map_item,
    )?)
}

/// Move a row of `table` among its siblings (same `parent` value) by `delta`
/// places, renumbering every sibling so older rows that all sat at position 0
/// get a stable order. One transaction: a half-applied move cannot happen.
fn reorder(
    conn: &mut Connection,
    table: &'static str,
    parent: &'static str,
    parent_id: i64,
    id: i64,
    delta: i64,
) -> AppResult<()> {
    let tx = conn.transaction()?;
    let ids: Vec<i64> = tx
        .prepare(&format!(
            "SELECT id FROM {table} WHERE {parent} = ?1 ORDER BY position, id"
        ))?
        .query_map([parent_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let Some(from) = ids.iter().position(|x| *x == id) else {
        return Ok(());
    };
    let to = from as i64 + delta;
    if to < 0 || to as usize >= ids.len() {
        return Ok(());
    }
    let mut order = ids;
    let moved = order.remove(from);
    order.insert(to as usize, moved);
    {
        let mut update = tx.prepare(&format!("UPDATE {table} SET position = ?1 WHERE id = ?2"))?;
        for (pos, row_id) in order.iter().enumerate() {
            update.execute(params![pos as i64, row_id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub async fn list_sequences(db: State<'_, Db>, course_id: i64) -> AppResult<Vec<Sequence>> {
    db.read(move |conn| list(conn, course_id)).await
}

#[tauri::command]
pub async fn list_sequence_items(
    db: State<'_, Db>,
    course_id: i64,
) -> AppResult<Vec<SequenceItem>> {
    db.read(move |conn| list_items(conn, course_id)).await
}

#[tauri::command]
pub async fn create_sequence(
    db: State<'_, Db>,
    course_id: i64,
    title: String,
) -> AppResult<Sequence> {
    db.write(move |conn| create(conn, course_id, &title)).await
}

#[tauri::command]
pub async fn rename_sequence(db: State<'_, Db>, id: i64, title: String) -> AppResult<()> {
    db.write(move |conn| {
        let title = clean_title(&title)?;
        conn.execute(
            "UPDATE sequences SET title = ?1 WHERE id = ?2",
            params![title, id],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_sequence(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM sequences WHERE id = ?1", [id])?;
        Ok(())
    })
    .await
}

/// Move a sequence up (-1) or down (+1).
#[tauri::command]
pub async fn move_sequence(
    db: State<'_, Db>,
    course_id: i64,
    id: i64,
    delta: i64,
) -> AppResult<()> {
    db.write(move |conn| reorder(conn, "sequences", "course_id", course_id, id, delta))
        .await
}

#[tauri::command]
pub async fn create_sequence_item(
    db: State<'_, Db>,
    sequence_id: i64,
    title: String,
    file_id: Option<i64>,
) -> AppResult<SequenceItem> {
    db.write(move |conn| create_item(conn, sequence_id, &title, file_id))
        .await
}

#[tauri::command]
pub async fn update_sequence_item(
    db: State<'_, Db>,
    id: i64,
    title: String,
    file_id: Option<i64>,
) -> AppResult<()> {
    db.write(move |conn| {
        let title = clean_title(&title)?;
        conn.execute(
            "UPDATE sequence_items SET title = ?1, file_id = ?2 WHERE id = ?3",
            params![title, file_id, id],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn delete_sequence_item(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM sequence_items WHERE id = ?1", [id])?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn move_sequence_item(
    db: State<'_, Db>,
    sequence_id: i64,
    id: i64,
    delta: i64,
) -> AppResult<()> {
    db.write(move |conn| {
        reorder(
            conn,
            "sequence_items",
            "sequence_id",
            sequence_id,
            id,
            delta,
        )
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn.execute(
            "INSERT INTO courses (name, emoji, color, description, matiere) VALUES ('Maths', 'calc', '#000', '', '')",
            [],
        )
        .unwrap();
        conn
    }

    fn titles(conn: &Connection) -> Vec<String> {
        list(conn, 1)
            .unwrap()
            .into_iter()
            .map(|s| s.title)
            .collect()
    }

    #[test]
    fn sequences_are_appended_and_reordered() {
        let mut conn = mem();
        let a = create(&conn, 1, " Fonctions ").unwrap();
        let b = create(&conn, 1, "Statistiques").unwrap();
        let c = create(&conn, 1, "Vecteurs").unwrap();
        assert_eq!((a.position, b.position, c.position), (0, 1, 2));
        assert_eq!(a.title, "Fonctions");
        reorder(&mut conn, "sequences", "course_id", 1, c.id, -2).unwrap();
        assert_eq!(titles(&conn), ["Vecteurs", "Fonctions", "Statistiques"]);
        // Out of range: nothing moves.
        reorder(&mut conn, "sequences", "course_id", 1, c.id, -1).unwrap();
        assert_eq!(titles(&conn), ["Vecteurs", "Fonctions", "Statistiques"]);
        assert_eq!(create(&conn, 1, "  ").unwrap_err().code(), "user");
    }

    #[test]
    fn items_belong_to_their_course_and_keep_order() {
        let mut conn = mem();
        let s = create(&conn, 1, "Fonctions").unwrap();
        let first = create_item(&conn, s.id, "Carré", None).unwrap();
        let second = create_item(&conn, s.id, "Inverse", None).unwrap();
        reorder(
            &mut conn,
            "sequence_items",
            "sequence_id",
            s.id,
            second.id,
            -1,
        )
        .unwrap();
        let items = list_items(&conn, 1).unwrap();
        assert_eq!(
            items.iter().map(|i| i.id).collect::<Vec<_>>(),
            [second.id, first.id]
        );
        assert!(list_items(&conn, 2).unwrap().is_empty());
    }
}
