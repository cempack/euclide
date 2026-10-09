//! Small previews of library documents (page 1 of a PDF, an image), shown
//! in the Documents grid. The page draws them with PDFium when Euclide is
//! idle and hands them over; they live in `Euclide-Data/.cache/thumbs/`,
//! named after the file and its modification time, so a saved document
//! gets a new one. A dot-folder: backups skip it, and losing it costs only
//! the time to draw them again.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::ipc::Request;
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};

/// Documents previewed per request: the page asks again when it is done.
const BATCH: usize = 6;
/// A preview larger than this is not a preview.
const MAX_BYTES: usize = 512 * 1024;

pub fn dir() -> PathBuf {
    crate::paths::data_dir().join(".cache").join("thumbs")
}

/// The file's modification time in seconds: part of the preview's name.
fn stamp(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

fn path_for(id: i64, stamp: u64) -> PathBuf {
    dir().join(format!("{id}-{stamp}.jpg"))
}

/// The current preview of document `id` at `doc`, if it was drawn.
pub fn current(id: i64, doc: &Path) -> Option<PathBuf> {
    let path = path_for(id, stamp(doc)?);
    path.is_file().then_some(path)
}

/// Removes every preview of document `id` (deleted, or replaced by a new one).
pub fn forget(id: i64) {
    let prefix = format!("{id}-");
    let Ok(entries) = fs::read_dir(dir()) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with(&prefix) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Previews of documents that no longer exist (startup chores).
pub fn prune(existing: &std::collections::HashSet<i64>) -> usize {
    let Ok(entries) = fs::read_dir(dir()) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let id = name.split('-').next().and_then(|s| s.parse::<i64>().ok());
        if id.is_some_and(|id| !existing.contains(&id)) && fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[derive(Debug, Serialize)]
pub struct ThumbJob {
    pub id: i64,
    pub kind: String,
    pub name: String,
}

/// The next documents without an up-to-date preview, newest first.
#[tauri::command]
pub async fn missing_thumbnails(db: State<'_, Db>) -> AppResult<Vec<ThumbJob>> {
    db.read(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, kind, name, rel_path FROM files WHERE kind IN ('pdf', 'image') \
             ORDER BY added_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?;
        let mut jobs = vec![];
        for row in rows {
            let (id, kind, name, rel) = row?;
            let Ok(doc) = crate::fsx::abs_path(&rel) else {
                continue;
            };
            if doc.is_file() && current(id, &doc).is_none() {
                jobs.push(ThumbJob { id, kind, name });
                if jobs.len() >= BATCH {
                    break;
                }
            }
        }
        Ok(jobs)
    })
    .await
}

/// Stores the preview drawn by the page (JPEG in the request body; header
/// `x-eu-file-id`).
#[tauri::command]
pub async fn save_thumbnail(db: State<'_, Db>, request: Request<'_>) -> AppResult<()> {
    let id: i64 = crate::commands::editing::header(&request, "x-eu-file-id")
        .and_then(|v| v.parse().ok())
        .ok_or_else(|| AppError::user("Document inconnu."))?;
    let bytes = crate::commands::editing::raw_body(&request)?;
    if bytes.len() > MAX_BYTES || !bytes.starts_with(&[0xFF, 0xD8]) {
        return Err(AppError::user("Aperçu refusé."));
    }
    let rel: String = db
        .read(move |conn| {
            Ok(conn.query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))?)
        })
        .await?;
    tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let doc = crate::fsx::abs_path(&rel)?;
        let stamp = stamp(&doc).ok_or_else(|| AppError::user("Document introuvable."))?;
        forget(id);
        fs::create_dir_all(dir())?;
        let tmp = dir().join(format!(".{id}.tmp"));
        fs::write(&tmp, &bytes)?;
        fs::rename(&tmp, path_for(id, stamp))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn previews_follow_the_file_and_go_with_it() {
        let _env = crate::paths::temp_data_dir("thumbs");
        let doc = crate::paths::documents_dir().join("cours.pdf");
        fs::write(&doc, b"%PDF").unwrap();
        assert!(current(7, &doc).is_none());

        fs::create_dir_all(dir()).unwrap();
        fs::write(path_for(7, stamp(&doc).unwrap()), [0xFF, 0xD8]).unwrap();
        fs::write(path_for(8, 1), [0xFF, 0xD8]).unwrap();
        assert!(current(7, &doc).is_some());

        let existing = std::collections::HashSet::from([7]);
        assert_eq!(prune(&existing), 1);
        forget(7);
        assert!(current(7, &doc).is_none());
    }
}
