//! The document library: import, list, rename, delete, open with the system.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::fsx::{abs_path, kind_from_ext, plain_file_name, rel_path, unique_dest};
use crate::jobs::indexer::Indexer;
use crate::models::FileItem;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub const FILE_COLS: &str = "id, course_id, name, rel_path, kind, size, added_at";

pub fn map_file(r: &Row) -> rusqlite::Result<FileItem> {
    Ok(FileItem {
        id: r.get(0)?,
        course_id: r.get(1)?,
        name: r.get(2)?,
        rel_path: r.get(3)?,
        kind: r.get(4)?,
        size: r.get(5)?,
        added_at: r.get(6)?,
    })
}

pub fn get(conn: &Connection, id: i64) -> AppResult<FileItem> {
    Ok(conn.query_row(
        &format!("SELECT {FILE_COLS} FROM files WHERE id=?1"),
        [id],
        map_file,
    )?)
}

/// Absolute path of a file of the library.
pub fn path_of(conn: &Connection, id: i64) -> AppResult<PathBuf> {
    let rel: String =
        conn.query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))?;
    abs_path(&rel)
}

/// Record a file already copied into the data folder. PDFs wait for the
/// background indexer; other kinds have nothing to extract.
pub fn register(conn: &Connection, course_id: Option<i64>, dest: &Path) -> AppResult<FileItem> {
    let name = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| AppError::user("Nom de fichier invalide."))?;
    let kind = kind_from_ext(&name);
    let size = fs::metadata(dest).map(|m| m.len() as i64).unwrap_or(0);
    conn.execute(
        "INSERT INTO files (course_id, name, rel_path, kind, size, index_state) VALUES (?1,?2,?3,?4,?5,?6)",
        params![
            course_id,
            name,
            rel_path(dest),
            kind,
            size,
            if kind == "pdf" { "pending" } else { "skip" }
        ],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// Where a course's locker, or the general library, lives on disk.
fn target_dir(course_id: Option<i64>) -> PathBuf {
    match course_id {
        Some(id) => crate::paths::courses_dir().join(id.to_string()),
        None => crate::paths::documents_dir(),
    }
}

/// Copy `sources` into the library and record them. Files that cannot be read
/// are skipped, not fatal: the rest of the batch is imported.
fn import_all(db: &Db, sources: Vec<PathBuf>, course_id: Option<i64>) -> AppResult<Vec<FileItem>> {
    let dir = target_dir(course_id);
    fs::create_dir_all(&dir)?;
    let mut copied = vec![];
    for src in sources {
        if !src.is_file() {
            continue;
        }
        let Some(name) = src.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        let dest = unique_dest(&dir, &name);
        if fs::copy(&src, &dest).is_ok() {
            copied.push(dest);
        }
    }
    let conn = db.lock();
    copied
        .iter()
        .map(|dest| register(&conn, course_id, dest))
        .collect()
}

#[tauri::command]
pub async fn list_files(db: State<'_, Db>, course_id: Option<i64>) -> AppResult<Vec<FileItem>> {
    db.read(move |conn| {
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {FILE_COLS} FROM files WHERE course_id IS ?1 ORDER BY added_at DESC"
        ))?;
        let rows = stmt.query_map([course_id], map_file)?;
        Ok(rows.collect::<Result<_, _>>()?)
    })
    .await
}

#[tauri::command]
pub async fn recent_files(db: State<'_, Db>, limit: i64) -> AppResult<Vec<FileItem>> {
    db.read(move |conn| {
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {FILE_COLS} FROM files ORDER BY added_at DESC LIMIT ?1"
        ))?;
        let rows = stmt.query_map([limit], map_file)?;
        Ok(rows.collect::<Result<_, _>>()?)
    })
    .await
}

/// Ask the teacher for files to import (system dialog).
#[tauri::command]
pub async fn import_files(
    app: AppHandle,
    db: State<'_, Db>,
    indexer: State<'_, Indexer>,
    course_id: Option<i64>,
) -> AppResult<Vec<FileItem>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_files(move |files| {
        let _ = tx.send(files);
    });
    let Some(picked) = rx.await.ok().flatten() else {
        return Ok(vec![]);
    };
    let sources: Vec<PathBuf> = picked
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .collect();
    let db = db.inner().clone();
    let items =
        tauri::async_runtime::spawn_blocking(move || import_all(&db, sources, course_id)).await??;
    indexer.kick();
    Ok(items)
}

/// Import files dropped on the window.
#[tauri::command]
pub async fn import_paths(
    db: State<'_, Db>,
    indexer: State<'_, Indexer>,
    paths: Vec<String>,
    course_id: Option<i64>,
) -> AppResult<Vec<FileItem>> {
    let sources = paths.into_iter().map(PathBuf::from).collect();
    let db = db.inner().clone();
    let items =
        tauri::async_runtime::spawn_blocking(move || import_all(&db, sources, course_id)).await??;
    indexer.kick();
    Ok(items)
}

/// Put copies of library documents in a course's locker, without the webview
/// ever handling their paths.
#[tauri::command]
pub async fn attach_files_to_course(
    db: State<'_, Db>,
    indexer: State<'_, Indexer>,
    course_id: i64,
    file_ids: Vec<i64>,
) -> AppResult<Vec<FileItem>> {
    let db = db.inner().clone();
    let items = tauri::async_runtime::spawn_blocking(move || {
        let sources = {
            let conn = db.lock();
            file_ids
                .iter()
                .map(|id| path_of(&conn, *id))
                .collect::<AppResult<Vec<_>>>()?
        };
        import_all(&db, sources, Some(course_id))
    })
    .await??;
    indexer.kick();
    Ok(items)
}

/// Indexing now happens in the background: this only wakes the indexer.
/// Kept for the frontend of the previous release.
#[tauri::command]
pub fn index_files(indexer: State<'_, Indexer>) -> i64 {
    indexer.kick();
    0
}

/// Index every PDF again (e.g. after the sidecar learned to read more).
#[tauri::command]
pub async fn reindex_documents(db: State<'_, Db>, indexer: State<'_, Indexer>) -> AppResult<i64> {
    let n = db
        .write(|conn| {
            Ok(conn.execute(
                "UPDATE files SET index_state='pending' WHERE kind='pdf'",
                [],
            )? as i64)
        })
        .await?;
    indexer.kick();
    Ok(n)
}

#[tauri::command]
pub async fn file_path(db: State<'_, Db>, id: i64) -> AppResult<String> {
    let path = db.read(move |conn| path_of(conn, id)).await?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_file(app: AppHandle, db: State<'_, Db>, id: i64) -> AppResult<()> {
    let path = db.read(move |conn| path_of(conn, id)).await?;
    // Always the system's default application: the webview never picks the program.
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::user(format!("Impossible d'ouvrir le fichier : {e}")))
}

#[tauri::command]
pub async fn reveal_file(app: AppHandle, db: State<'_, Db>, id: i64) -> AppResult<()> {
    let path = db.read(move |conn| path_of(conn, id)).await?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| AppError::user(format!("Impossible d'afficher le fichier : {e}")))
}

#[derive(Serialize)]
pub struct Opener {
    name: &'static str,
    is_reveal: bool,
}

#[tauri::command]
pub fn list_openers() -> Vec<Opener> {
    vec![
        Opener {
            name: "Application par défaut",
            is_reveal: false,
        },
        Opener {
            name: "Afficher dans le dossier",
            is_reveal: true,
        },
    ]
}

/// Delete a document, its versions and annotations. The row goes first (in
/// a transaction): files left on disk by an interruption are harmless,
/// rows pointing at nothing are not.
#[tauri::command]
pub async fn delete_file(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        let tx = conn.transaction()?;
        let rel: Option<String> = tx
            .query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
            .optional()?;
        let versions: Vec<String> = tx
            .prepare("SELECT rel_path FROM file_versions WHERE file_id=?1")?
            .query_map([id], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        tx.execute("DELETE FROM files WHERE id=?1", [id])?;
        // Leftovers of the pre-format-1 bookkeeping, kept for one release.
        tx.execute(
            "DELETE FROM settings WHERE key IN (?1, ?2, ?3)",
            params![
                format!("file_versions_{id}"),
                format!("pdf_versions_{id}"),
                format!("pdf_annot_{id}")
            ],
        )?;
        tx.execute("DELETE FROM doc_index WHERE file_id=?1", [id])?;
        tx.commit()?;
        for rel in versions.iter().chain(rel.iter()) {
            if let Ok(path) = abs_path(rel) {
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    })
    .await
}

/// Rename a document on disk and in the library. The extension is kept when
/// the new name has none; a name already taken gets « (1) ».
pub fn rename(conn: &Connection, id: i64, new_name: &str) -> AppResult<FileItem> {
    let wanted = plain_file_name(new_name.trim())?;
    let current = get(conn, id)?;
    if wanted == current.name {
        return Ok(current);
    }
    let old_abs = abs_path(&current.rel_path)?;
    let dir = old_abs
        .parent()
        .ok_or_else(|| AppError::user("Chemin de fichier invalide."))?
        .to_path_buf();
    let candidate = match (
        Path::new(wanted).extension(),
        Path::new(&current.name).extension(),
    ) {
        (None, Some(ext)) => format!("{wanted}.{}", ext.to_string_lossy()),
        _ => wanted.to_string(),
    };
    let new_abs = if dir.join(&candidate) == old_abs || !dir.join(&candidate).exists() {
        dir.join(&candidate)
    } else {
        unique_dest(&dir, &candidate)
    };
    if new_abs != old_abs {
        fs::rename(&old_abs, &new_abs)?;
    }
    let final_name = new_abs
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or(candidate);
    let kind = kind_from_ext(&final_name);
    let kind_changed = kind != current.kind;
    let renamed = conn.execute(
        "UPDATE files SET name=?1, rel_path=?2, kind=?3, \
         index_state = CASE WHEN ?4 THEN (CASE WHEN ?3 = 'pdf' THEN 'pending' ELSE 'skip' END) ELSE index_state END \
         WHERE id=?5",
        params![final_name, rel_path(&new_abs), kind, kind_changed, id],
    );
    if let Err(e) = renamed {
        // Keep disk and library in step.
        let _ = fs::rename(&new_abs, &old_abs);
        return Err(e.into());
    }
    if kind_changed && kind != "pdf" {
        conn.execute("UPDATE doc_fts SET content = '' WHERE rowid = ?1", [id])?;
    }
    get(conn, id)
}

#[tauri::command]
pub async fn rename_file(
    db: State<'_, Db>,
    indexer: State<'_, Indexer>,
    id: i64,
    new_name: String,
) -> AppResult<FileItem> {
    let item = db.write(move |conn| rename(conn, id, &new_name)).await?;
    indexer.kick();
    Ok(item)
}
