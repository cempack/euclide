//! Sequences: the teaching progression of a course, made of ordered steps.
//! Each step (a lesson) lists what it needs in class: documents, notes,
//! Python scripts, links.

use std::collections::HashMap;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{Sequence, SequenceItem, StepResource};
use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

const SEQUENCE_COLS: &str = "id, course_id, title, position, created_at";
const ITEM_SELECT: &str =
    "SELECT si.id, si.sequence_id, si.title, si.position FROM sequence_items si";
/// A step's resources with what they point at; rows whose target is gone
/// (a script deleted outside Euclide) still come back, named after it.
const RESOURCE_SELECT: &str = "SELECT r.id, r.item_id, r.kind, r.ref_id, r.ref_name, \
            CASE r.kind WHEN 'file' THEN f.name WHEN 'note' THEN n.title \
                        WHEN 'link' THEN l.label ELSE r.ref_name END, \
            f.kind, l.url \
     FROM sequence_item_resources r \
     LEFT JOIN files f ON r.kind = 'file' AND f.id = r.ref_id \
     LEFT JOIN notes n ON r.kind = 'note' AND n.id = r.ref_id \
     LEFT JOIN links l ON r.kind = 'link' AND l.id = r.ref_id";

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
        resources: vec![],
    })
}

fn map_resource(r: &Row) -> rusqlite::Result<StepResource> {
    let ref_name: String = r.get(4)?;
    let name: Option<String> = r.get(5)?;
    Ok(StepResource {
        id: r.get(0)?,
        item_id: r.get(1)?,
        kind: r.get(2)?,
        ref_id: r.get(3)?,
        name: name.unwrap_or_else(|| ref_name.clone()),
        ref_name,
        file_kind: r.get(6)?,
        url: r.get(7)?,
    })
}

/// The resources of every step of a course, by step.
fn resources_of_course(
    conn: &Connection,
    course_id: i64,
) -> AppResult<HashMap<i64, Vec<StepResource>>> {
    let mut stmt = conn.prepare_cached(&format!(
        "{RESOURCE_SELECT} \
         JOIN sequence_items si ON si.id = r.item_id \
         JOIN sequences sq ON sq.id = si.sequence_id \
         WHERE sq.course_id = ?1 ORDER BY r.item_id, r.position, r.id"
    ))?;
    let mut by_item: HashMap<i64, Vec<StepResource>> = HashMap::new();
    for res in stmt.query_map([course_id], map_resource)? {
        let res = res?;
        by_item.entry(res.item_id).or_default().push(res);
    }
    Ok(by_item)
}

fn resources_of_item(conn: &Connection, item_id: i64) -> AppResult<Vec<StepResource>> {
    let mut stmt = conn.prepare_cached(&format!(
        "{RESOURCE_SELECT} WHERE r.item_id = ?1 ORDER BY r.position, r.id"
    ))?;
    let rows = stmt.query_map([item_id], map_resource)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn item(conn: &Connection, id: i64) -> AppResult<SequenceItem> {
    let mut item = conn.query_row(&format!("{ITEM_SELECT} WHERE si.id = ?1"), [id], map_item)?;
    item.resources = resources_of_item(conn, id)?;
    Ok(item)
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

/// Every step of every sequence of a course, in display order, with its
/// resources.
pub fn list_items(conn: &Connection, course_id: i64) -> AppResult<Vec<SequenceItem>> {
    let mut stmt = conn.prepare_cached(
        "SELECT si.id, si.sequence_id, si.title, si.position \
         FROM sequence_items si \
         JOIN sequences sq ON sq.id = si.sequence_id \
         WHERE sq.course_id = ?1 \
         ORDER BY sq.position, sq.id, si.position, si.id",
    )?;
    let mut items: Vec<SequenceItem> = stmt
        .query_map([course_id], map_item)?
        .collect::<Result<_, _>>()?;
    let mut resources = resources_of_course(conn, course_id)?;
    for item in &mut items {
        item.resources = resources.remove(&item.id).unwrap_or_default();
    }
    Ok(items)
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
    // The step and its document together, or neither.
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO sequence_items (sequence_id, title, position) VALUES (?1, ?2, \
         (SELECT COALESCE(MAX(position) + 1, 0) FROM sequence_items WHERE sequence_id = ?1))",
        params![sequence_id, title],
    )?;
    let id = tx.last_insert_rowid();
    if let Some(file_id) = file_id {
        add_resource(&tx, id, "file", Some(file_id), "")?;
    }
    tx.commit()?;
    item(conn, id)
}

/// Adds a resource at the end of a step's list; adding one twice keeps the
/// first. A script goes by its file name in the Python folder.
pub fn add_resource(
    conn: &Connection,
    item_id: i64,
    kind: &str,
    ref_id: Option<i64>,
    ref_name: &str,
) -> AppResult<StepResource> {
    let (ref_id, ref_name) = match kind {
        "file" | "note" | "link" => {
            let id = ref_id.ok_or_else(|| AppError::user("Élément à ajouter manquant."))?;
            let table = match kind {
                "file" => "files",
                "note" => "notes",
                _ => "links",
            };
            let exists = conn
                .query_row(
                    &format!("SELECT 1 FROM {table} WHERE id = ?1"),
                    [id],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if !exists {
                return Err(AppError::not_found("Cet élément n'existe plus."));
            }
            (Some(id), String::new())
        }
        "script" => {
            let name = crate::fsx::plain_file_name(ref_name.trim())?;
            if !name.ends_with(".py") {
                return Err(AppError::user("Ce n'est pas un script Python."));
            }
            (None, name.to_string())
        }
        _ => return Err(AppError::user("Type de ressource inconnu.")),
    };
    conn.execute(
        "INSERT OR IGNORE INTO sequence_item_resources (item_id, kind, ref_id, ref_name, position) \
         VALUES (?1, ?2, ?3, ?4, \
         (SELECT COALESCE(MAX(position) + 1, 0) FROM sequence_item_resources WHERE item_id = ?1))",
        params![item_id, kind, ref_id, ref_name],
    )?;
    Ok(conn.query_row(
        &format!(
            "{RESOURCE_SELECT} WHERE r.item_id = ?1 AND r.kind = ?2 \
             AND r.ref_id IS ?3 AND r.ref_name = ?4"
        ),
        params![item_id, kind, ref_id, ref_name],
        map_resource,
    )?)
}

/// A script renamed or deleted in the Python workspace: its resources follow
/// (`to` None removes them).
pub fn script_renamed(conn: &Connection, from: &str, to: Option<&str>) -> AppResult<()> {
    match to {
        Some(to) => conn.execute(
            "UPDATE OR IGNORE sequence_item_resources SET ref_name = ?2 \
             WHERE kind = 'script' AND ref_name = ?1",
            params![from, to],
        )?,
        None => conn.execute(
            "DELETE FROM sequence_item_resources WHERE kind = 'script' AND ref_name = ?1",
            [from],
        )?,
    };
    Ok(())
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
pub async fn rename_sequence_item(db: State<'_, Db>, id: i64, title: String) -> AppResult<()> {
    db.write(move |conn| {
        let title = clean_title(&title)?;
        conn.execute(
            "UPDATE sequence_items SET title = ?1 WHERE id = ?2",
            params![title, id],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn add_step_resource(
    db: State<'_, Db>,
    item_id: i64,
    kind: String,
    ref_id: Option<i64>,
    ref_name: Option<String>,
) -> AppResult<StepResource> {
    db.write(move |conn| {
        add_resource(
            conn,
            item_id,
            &kind,
            ref_id,
            ref_name.as_deref().unwrap_or(""),
        )
    })
    .await
}

#[tauri::command]
pub async fn remove_step_resource(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM sequence_item_resources WHERE id = ?1", [id])?;
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
        let conn = crate::db::migrations_for_tests();
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

    #[test]
    fn steps_hold_several_resources() {
        let conn = mem();
        conn.execute_batch(
            "INSERT INTO files (id, course_id, name, rel_path, kind) VALUES (5, 1, 'cours.pdf', 'documents/cours.pdf', 'pdf');
             INSERT INTO notes (id, course_id, title, body) VALUES (8, 1, 'Fiche', '');
             INSERT INTO links (id, label, url) VALUES (3, 'GeoGebra', 'https://www.geogebra.org');",
        )
        .unwrap();
        let s = create(&conn, 1, "Fonctions").unwrap();
        let step = create_item(&conn, s.id, "Carré", Some(5)).unwrap();
        assert_eq!(step.resources.len(), 1);
        assert_eq!(step.resources[0].name, "cours.pdf");
        add_resource(&conn, step.id, "note", Some(8), "").unwrap();
        add_resource(&conn, step.id, "link", Some(3), "").unwrap();
        let script = add_resource(&conn, step.id, "script", None, "tri.py").unwrap();
        assert_eq!(script.name, "tri.py");
        // Twice is once; unknown targets and kinds are refused.
        add_resource(&conn, step.id, "note", Some(8), "").unwrap();
        assert_eq!(
            add_resource(&conn, step.id, "note", Some(99), "")
                .unwrap_err()
                .code(),
            "not_found"
        );
        assert!(add_resource(&conn, step.id, "script", None, "../x.py").is_err());
        assert!(add_resource(&conn, step.id, "video", Some(1), "").is_err());

        let items = list_items(&conn, 1).unwrap();
        let kinds: Vec<_> = items[0].resources.iter().map(|r| r.kind.as_str()).collect();
        assert_eq!(kinds, ["file", "note", "link", "script"]);
        assert_eq!(
            items[0].resources[2].url.as_deref(),
            Some("https://www.geogebra.org")
        );

        script_renamed(&conn, "tri.py", Some("tri_selection.py")).unwrap();
        assert_eq!(
            item(&conn, step.id).unwrap().resources[3].name,
            "tri_selection.py"
        );
        script_renamed(&conn, "tri_selection.py", None).unwrap();
        conn.execute("DELETE FROM notes WHERE id = 8", []).unwrap();
        assert_eq!(item(&conn, step.id).unwrap().resources.len(), 2);
    }
}
