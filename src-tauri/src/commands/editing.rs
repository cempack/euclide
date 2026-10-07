//! Editing documents in place (whiteboards, annotated PDFs and images),
//! exports, and the versions kept before each overwrite.
//!
//! File bytes travel as raw IPC bodies (no base64 inside JSON); what would be
//! arguments goes in `x-eu-*` headers.

use super::files::{self, register};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::fsx::{
    abs_path, percent_decode, plain_file_name, rel_path, unique_dest, write_temp_beside,
};
use crate::models::FileItem;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

/// Versions kept per document, besides the original.
const KEEP_VERSIONS: usize = 20;

/// Replace the content of library file `id`, keeping the previous content as
/// a version. The new bytes are written next to the file first; only then is
/// the current file moved into documents/.versions/ (a rename, not a copy) and
/// the new one moved into place. A key pulled out at any point leaves either
/// the old or the new file whole.
pub fn replace_content(conn: &Connection, id: i64, bytes: &[u8]) -> AppResult<FileItem> {
    let item = files::get(conn, id)?;
    let abs = abs_path(&item.rel_path)?;
    let tmp = write_temp_beside(&abs, bytes)?;
    if abs.exists() {
        let dir = crate::paths::documents_dir().join(".versions");
        if let Err(e) = fs::create_dir_all(&dir) {
            let _ = fs::remove_file(&tmp);
            return Err(e.into());
        }
        let p = Path::new(&item.name);
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let ext = p
            .extension()
            .map(|s| format!(".{}", s.to_string_lossy()))
            .unwrap_or_default();
        let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup = unique_dest(&dir, &format!("{id}_{stem}__v{stamp}{ext}"));
        let old_size = fs::metadata(&abs).map(|m| m.len() as i64).unwrap_or(0);
        if let Err(e) = fs::rename(&abs, &backup) {
            // Typically: the file is open in another program on Windows.
            let _ = fs::remove_file(&tmp);
            return Err(e.into());
        }
        if let Err(e) = fs::rename(&tmp, &abs) {
            let _ = fs::rename(&backup, &abs);
            let _ = fs::remove_file(&tmp);
            return Err(e.into());
        }
        let first: bool = conn
            .query_row(
                "SELECT 1 FROM file_versions WHERE file_id=?1 LIMIT 1",
                [id],
                |_| Ok(()),
            )
            .optional()?
            .is_none();
        conn.execute(
            "INSERT INTO file_versions (file_id, rel_path, label, size) VALUES (?1, ?2, ?3, ?4)",
            params![
                id,
                rel_path(&backup),
                if first { "original" } else { "" },
                old_size
            ],
        )?;
        prune_versions(conn, id)?;
    } else if let Err(e) = fs::rename(&tmp, &abs) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    conn.execute(
        "UPDATE files SET size=?1, added_at=datetime('now') WHERE id=?2",
        params![bytes.len() as i64, id],
    )?;
    files::get(conn, id)
}

/// Keep the original and the newest `KEEP_VERSIONS` others.
fn prune_versions(conn: &Connection, id: i64) -> AppResult<()> {
    let old: Vec<(i64, String)> = conn
        .prepare(
            "SELECT id, rel_path FROM file_versions WHERE file_id=?1 AND label <> 'original' \
             ORDER BY id DESC LIMIT -1 OFFSET ?2",
        )?
        .query_map(params![id, KEEP_VERSIONS as i64], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })?
        .collect::<Result<_, _>>()?;
    for (vid, rel) in old {
        conn.execute("DELETE FROM file_versions WHERE id=?1", [vid])?;
        if let Ok(path) = abs_path(&rel) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

/// Create a new library document from bytes (exports, saved copies).
pub fn create_from_bytes(
    conn: &Connection,
    dir: &Path,
    name: &str,
    course_id: Option<i64>,
    bytes: &[u8],
) -> AppResult<FileItem> {
    let name = plain_file_name(name.trim())?;
    fs::create_dir_all(dir)?;
    let dest = unique_dest(dir, name);
    crate::fsx::atomic_write(&dest, bytes)?;
    register(conn, course_id, &dest)
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|v| v.to_str().ok())
}

fn raw_body(request: &Request<'_>) -> AppResult<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err(AppError::user("Contenu de fichier invalide.")),
    }
}

/// Overwrite a library document with the request body. Header `x-eu-file-id`.
#[tauri::command]
pub async fn write_file_bytes(db: State<'_, Db>, request: Request<'_>) -> AppResult<FileItem> {
    let id: i64 = header(&request, "x-eu-file-id")
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| AppError::user("Document inconnu."))?;
    let bytes = raw_body(&request)?;
    db.write(move |conn| replace_content(conn, id, &bytes))
        .await
}

/// Add a new document from the request body. Headers: `x-eu-name`
/// (`%`-encoded), optional `x-eu-course-id`, optional `x-eu-folder:
/// whiteboards` (default: the general library).
#[tauri::command]
pub async fn create_file_bytes(db: State<'_, Db>, request: Request<'_>) -> AppResult<FileItem> {
    let name = percent_decode(header(&request, "x-eu-name").unwrap_or(""))?;
    let course_id = header(&request, "x-eu-course-id").and_then(|v| v.parse::<i64>().ok());
    let dir = match header(&request, "x-eu-folder") {
        Some("whiteboards") => crate::paths::whiteboards_dir(),
        _ => crate::paths::documents_dir(),
    };
    let bytes = raw_body(&request)?;
    db.write(move |conn| create_from_bytes(conn, &dir, &name, course_id, &bytes))
        .await
}

#[derive(Deserialize)]
pub struct BoardSave {
    #[serde(default)]
    file_id: Option<i64>,
    #[serde(default)]
    course_id: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    json: String,
}

/// Save a whiteboard in Euclide's editable vector format (`.euboard`, JSON).
#[tauri::command]
pub async fn save_board(db: State<'_, Db>, save: BoardSave) -> AppResult<FileItem> {
    db.write(move |conn| {
        if let Some(id) = save.file_id {
            return replace_content(conn, id, save.json.as_bytes());
        }
        let base = save
            .name
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| format!("Tableau {}", chrono::Local::now().format("%d-%m %H-%M")));
        let name = if base.ends_with(".euboard") {
            base
        } else {
            format!("{base}.euboard")
        };
        create_from_bytes(
            conn,
            &crate::paths::whiteboards_dir(),
            &name,
            save.course_id,
            save.json.as_bytes(),
        )
    })
    .await
}

#[tauri::command]
pub async fn read_board(db: State<'_, Db>, id: i64) -> AppResult<String> {
    db.read(move |conn| Ok(fs::read_to_string(files::path_of(conn, id)?)?))
        .await
}

/// One saved version of a document. `version` counts from 1 in save order;
/// the file itself is served at `eufile://…/version/<id>`.
#[derive(Debug, Serialize)]
pub struct FileVersion {
    id: i64,
    version: i64,
    /// "original", or the save time as "YYYYMMDD_HHMMSS" (shown in the UI).
    timestamp: String,
    label: String,
    created_at: String,
    size: i64,
}

pub fn list_versions(conn: &Connection, file_id: i64) -> AppResult<Vec<FileVersion>> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, label, created_at, size, \
                strftime('%Y%m%d_%H%M%S', created_at, 'localtime') \
         FROM file_versions WHERE file_id=?1 ORDER BY id",
    )?;
    let rows = stmt.query_map([file_id], |r| {
        let label: String = r.get(1)?;
        let local: String = r.get(4)?;
        Ok((
            r.get::<_, i64>(0)?,
            label,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
            local,
        ))
    })?;
    let mut out = vec![];
    for (i, row) in rows.enumerate() {
        let (id, label, created_at, size, local) = row?;
        out.push(FileVersion {
            id,
            version: i as i64 + 1,
            timestamp: if label == "original" {
                "original".into()
            } else {
                local
            },
            label,
            created_at,
            size,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_file_versions(db: State<'_, Db>, file_id: i64) -> AppResult<Vec<FileVersion>> {
    db.read(move |conn| list_versions(conn, file_id)).await
}

/// Annotations of an image (JSON of strokes), kept beside the untouched image.
#[tauri::command]
pub async fn save_annotations(db: State<'_, Db>, file_id: i64, json: String) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute(
            "INSERT INTO file_annotations (file_id, json, updated_at) VALUES (?1, ?2, datetime('now')) \
             ON CONFLICT(file_id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at",
            params![file_id, json],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn read_annotations(db: State<'_, Db>, file_id: i64) -> AppResult<Option<String>> {
    db.read(move |conn| {
        Ok(conn
            .query_row(
                "SELECT json FROM file_annotations WHERE file_id=?1",
                [file_id],
                |r| r.get(0),
            )
            .optional()?)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_from_headers_are_decoded() {
        assert_eq!(
            percent_decode("Th%C3%A9or%C3%A8me%20(annot%C3%A9).png").unwrap(),
            "Théorème (annoté).png"
        );
        assert_eq!(percent_decode("100%").unwrap(), "100%");
    }

    #[test]
    fn overwriting_keeps_the_original_and_recent_versions() {
        let _env = crate::paths::temp_data_dir("editing");
        let conn = crate::db::migrations_for_tests();
        let docs = crate::paths::documents_dir();
        let item = create_from_bytes(&conn, &docs, "cours.pdf", None, b"v0").unwrap();
        assert_eq!(item.kind, "pdf");
        for n in 1..=KEEP_VERSIONS + 3 {
            replace_content(&conn, item.id, format!("v{n}").as_bytes()).unwrap();
        }
        let path = files::path_of(&conn, item.id).unwrap();
        assert_eq!(
            fs::read(&path).unwrap(),
            format!("v{}", KEEP_VERSIONS + 3).as_bytes()
        );
        let versions = list_versions(&conn, item.id).unwrap();
        assert_eq!(versions.len(), KEEP_VERSIONS + 1);
        assert_eq!(versions[0].timestamp, "original");
        let rel: String = conn
            .query_row(
                "SELECT rel_path FROM file_versions WHERE id=?1",
                [versions[0].id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(fs::read(abs_path(&rel).unwrap()).unwrap(), b"v0");
        // Pruned versions are gone from disk too.
        let on_disk = fs::read_dir(docs.join(".versions")).unwrap().count();
        assert_eq!(on_disk, KEEP_VERSIONS + 1);
        // No temporary file left beside the document.
        assert_eq!(
            fs::read_dir(&docs)
                .unwrap()
                .filter(|e| e.as_ref().unwrap().path().is_file())
                .count(),
            1
        );
    }
}
