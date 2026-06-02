use crate::db::Db;
use crate::keepawake::KeepAwake;
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

type R<T> = Result<T, String>;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AppInfo {
    teacher_name: String,
    author: String,
    version: String,
    data_dir: String,
}

#[derive(Serialize, Deserialize)]
pub struct Course {
    id: i64,
    name: String,
    emoji: String,
    color: String,
    description: String,
    created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct Note {
    #[serde(default)]
    id: i64,
    course_id: Option<i64>,
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    updated_at: String,
}

#[derive(Serialize)]
pub struct FileItem {
    id: i64,
    course_id: Option<i64>,
    name: String,
    rel_path: String,
    kind: String,
    size: i64,
    added_at: String,
}

#[derive(Serialize)]
pub struct Reminder {
    id: i64,
    title: String,
    due_at: Option<String>,
    done: bool,
    created_at: String,
}

#[derive(Serialize)]
pub struct QuickLink {
    id: i64,
    label: String,
    url: String,
    icon: String,
}

#[derive(Serialize, Deserialize)]
pub struct ScheduleEntry {
    #[serde(default)]
    id: i64,
    day_of_week: i64,
    start_time: String,
    end_time: String,
    subject: String,
    #[serde(default)]
    room: String,
    #[serde(default)]
    course_id: Option<i64>,
    #[serde(default = "default_source")]
    source: String,
}

fn default_source() -> String {
    "manual".into()
}

#[derive(Serialize)]
pub struct SearchHit {
    doc_id: i64,
    name: String,
    rel_path: String,
    course_id: Option<i64>,
    snippet: String,
}

#[derive(Serialize)]
pub struct PronoteStatus {
    connected: bool,
    account_name: Option<String>,
    last_sync: Option<String>,
}

#[derive(Serialize)]
pub struct PythonDemo {
    name: String,
    path: String,
    code: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    kind: String, // note | file | course
    id: i64,
    title: String,
    subtitle: String,
    snippet: String,
    course_id: Option<i64>,
    file_kind: String,
}

#[derive(Serialize)]
pub struct PythonResult {
    ok: bool,
    stdout: String,
    stderr: String,
}

#[derive(Serialize)]
pub struct TopCourse {
    name: String,
    emoji: String,
    count: i64,
}

#[derive(Serialize)]
pub struct RecapData {
    period_label: String,
    files_opened: i64,
    notes_written: i64,
    demos_run: i64,
    reminders_done: i64,
    active_minutes: i64,
    top_courses: Vec<TopCourse>,
    highlights: Vec<String>,
}

// ---------------------------------------------------------------------------
// App info
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        teacher_name: "Monsieur Madrias".into(),
        author: "Elliot Moreau".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        data_dir: crate::paths::data_dir().to_string_lossy().to_string(),
    }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_courses(state: State<Db>) -> R<Vec<Course>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, emoji, color, description, created_at FROM courses ORDER BY name")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Course {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                description: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn create_course(
    state: State<Db>,
    name: String,
    emoji: String,
    color: String,
    description: String,
) -> R<Course> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO courses (name, emoji, color, description) VALUES (?1, ?2, ?3, ?4)",
        params![name, emoji, color, description],
    )
    .map_err(e)?;
    let id = conn.last_insert_rowid();
    let _ = fs::create_dir_all(crate::paths::courses_dir().join(id.to_string()));
    conn.query_row(
        "SELECT id, name, emoji, color, description, created_at FROM courses WHERE id = ?1",
        [id],
        |r| {
            Ok(Course {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                description: r.get(4)?,
                created_at: r.get(5)?,
            })
        },
    )
    .map_err(e)
}

#[tauri::command]
pub fn update_course(state: State<Db>, course: Course) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE courses SET name=?1, emoji=?2, color=?3, description=?4 WHERE id=?5",
        params![course.name, course.emoji, course.color, course.description, course.id],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn delete_course(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM courses WHERE id=?1", [id]).map_err(e)?;
    let _ = fs::remove_dir_all(crate::paths::courses_dir().join(id.to_string()));
    Ok(())
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_notes(state: State<Db>, course_id: Option<i64>) -> R<Vec<Note>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, course_id, title, body, updated_at FROM notes \
             WHERE course_id IS ?1 ORDER BY updated_at DESC",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([course_id], |r| {
            Ok(Note {
                id: r.get(0)?,
                course_id: r.get(1)?,
                title: r.get(2)?,
                body: r.get(3)?,
                updated_at: r.get(4)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn all_notes(state: State<Db>) -> R<Vec<Note>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, course_id, title, body, updated_at FROM notes ORDER BY updated_at DESC",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Note {
                id: r.get(0)?,
                course_id: r.get(1)?,
                title: r.get(2)?,
                body: r.get(3)?,
                updated_at: r.get(4)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn save_note(state: State<Db>, note: Note) -> R<Note> {
    let conn = state.0.lock().unwrap();
    let id = if note.id > 0 {
        conn.execute(
            "UPDATE notes SET title=?1, body=?2, updated_at=datetime('now') WHERE id=?3",
            params![note.title, note.body, note.id],
        )
        .map_err(e)?;
        note.id
    } else {
        conn.execute(
            "INSERT INTO notes (course_id, title, body) VALUES (?1, ?2, ?3)",
            params![note.course_id, note.title, note.body],
        )
        .map_err(e)?;
        conn.last_insert_rowid()
    };
    conn.query_row(
        "SELECT id, course_id, title, body, updated_at FROM notes WHERE id=?1",
        [id],
        |r| {
            Ok(Note {
                id: r.get(0)?,
                course_id: r.get(1)?,
                title: r.get(2)?,
                body: r.get(3)?,
                updated_at: r.get(4)?,
            })
        },
    )
    .map_err(e)
}

#[tauri::command]
pub fn delete_note(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM notes WHERE id=?1", [id]).map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Files & documents
// ---------------------------------------------------------------------------

fn kind_from_ext(name: &str) -> String {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "euboard" => "board",
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => "image",
        "doc" | "docx" | "odt" | "txt" | "md" | "rtf" => "doc",
        "xls" | "xlsx" | "ods" | "csv" => "sheet",
        "ppt" | "pptx" | "odp" => "slides",
        _ => "file",
    }
    .into()
}

fn map_file(r: &rusqlite::Row) -> rusqlite::Result<FileItem> {
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

#[tauri::command]
pub fn list_files(state: State<Db>, course_id: Option<i64>) -> R<Vec<FileItem>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files \
             WHERE course_id IS ?1 ORDER BY added_at DESC",
        )
        .map_err(e)?;
    let rows = stmt.query_map([course_id], map_file).map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn recent_files(state: State<Db>, limit: i64) -> R<Vec<FileItem>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files \
             ORDER BY added_at DESC LIMIT ?1",
        )
        .map_err(e)?;
    let rows = stmt.query_map([limit], map_file).map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub async fn import_files(
    app: AppHandle,
    state: State<'_, Db>,
    course_id: Option<i64>,
) -> R<Vec<FileItem>> {
    // Non-blocking picker driven via a channel so the UI thread never stalls
    // (blocking_pick_files can deadlock the main thread on macOS).
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_files(move |files| {
        let _ = tx.send(files);
    });
    let picked = rx.recv().ok().flatten();
    let Some(picked) = picked else {
        return Ok(vec![]);
    };

    let target_dir = match course_id {
        Some(id) => crate::paths::courses_dir().join(id.to_string()),
        None => crate::paths::documents_dir(),
    };
    let _ = fs::create_dir_all(&target_dir);

    let mut imported = vec![];
    for fp in picked {
        let Ok(src) = fp.into_path() else { continue };
        let Some(file_name) = src.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        let dest = unique_dest(&target_dir, &file_name);
        if fs::copy(&src, &dest).is_err() {
            continue;
        }
        let item = register_file(&state, course_id, &dest)?;
        if item.kind == "pdf" {
            index_pdf(&app, &state, item.id, &item.name, &dest);
        }
        imported.push(item);
    }
    Ok(imported)
}

/// Imports files from explicit absolute paths (used by drag-and-drop).
#[tauri::command]
pub fn import_paths(
    app: AppHandle,
    state: State<Db>,
    paths: Vec<String>,
    course_id: Option<i64>,
) -> R<Vec<FileItem>> {
    let target_dir = match course_id {
        Some(id) => crate::paths::courses_dir().join(id.to_string()),
        None => crate::paths::documents_dir(),
    };
    let _ = fs::create_dir_all(&target_dir);

    let mut imported = vec![];
    for p in paths {
        let src = PathBuf::from(&p);
        if !src.is_file() {
            continue;
        }
        let Some(file_name) = src.file_name().map(|n| n.to_string_lossy().to_string()) else {
            continue;
        };
        let dest = unique_dest(&target_dir, &file_name);
        if fs::copy(&src, &dest).is_err() {
            continue;
        }
        let item = register_file(&state, course_id, &dest)?;
        if item.kind == "pdf" {
            index_pdf(&app, &state, item.id, &item.name, &dest);
        }
        imported.push(item);
    }
    Ok(imported)
}

fn unique_dest(dir: &PathBuf, name: &str) -> PathBuf {
    let mut dest = dir.join(name);
    if !dest.exists() {
        return dest;
    }
    let stem = PathBuf::from(name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| name.to_string());
    let ext = PathBuf::from(name)
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    let mut i = 1;
    loop {
        dest = dir.join(format!("{stem} ({i}){ext}"));
        if !dest.exists() {
            return dest;
        }
        i += 1;
    }
}

fn register_file(state: &State<Db>, course_id: Option<i64>, dest: &PathBuf) -> R<FileItem> {
    let name = dest.file_name().unwrap().to_string_lossy().to_string();
    let rel = rel_path(dest);
    let size = fs::metadata(dest).map(|m| m.len() as i64).unwrap_or(0);
    let kind = kind_from_ext(&name);
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO files (course_id, name, rel_path, kind, size) VALUES (?1,?2,?3,?4,?5)",
        params![course_id, name, rel, kind, size],
    )
    .map_err(e)?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files WHERE id=?1",
        [id],
        map_file,
    )
    .map_err(e)
}

/// Path relative to the Euclide-Data folder, stored so the USB stays portable.
fn rel_path(abs: &PathBuf) -> String {
    let base = crate::paths::data_dir();
    abs.strip_prefix(&base)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| abs.to_string_lossy().to_string())
}

fn abs_path(rel: &str) -> PathBuf {
    crate::paths::data_dir().join(rel)
}

#[tauri::command]
pub fn file_path(state: State<Db>, id: i64) -> R<String> {
    let conn = state.0.lock().unwrap();
    let rel: String = conn
        .query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
        .map_err(e)?;
    Ok(abs_path(&rel).to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_file(app: AppHandle, state: State<Db>, id: i64) -> R<()> {
    let path = file_path(state, id)?;
    app.opener().open_path(path, None::<&str>).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn delete_file(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    let rel: Option<String> = conn
        .query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
        .optional()
        .map_err(e)?;
    conn.execute("DELETE FROM files WHERE id=?1", [id]).map_err(e)?;
    conn.execute("DELETE FROM doc_index WHERE file_id=?1", [id]).map_err(e)?;
    if let Some(rel) = rel {
        let _ = fs::remove_file(abs_path(&rel));
    }
    Ok(())
}

#[tauri::command]
pub fn search_documents(state: State<Db>, query: String) -> R<Vec<SearchHit>> {
    let fts = build_fts_query(&query);
    if fts.is_empty() {
        return Ok(vec![]);
    }
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT d.file_id, f.name, f.rel_path, f.course_id, \
                    snippet(doc_index, 1, '<mark>', '</mark>', '…', 12) \
             FROM doc_index d JOIN files f ON f.id = d.file_id \
             WHERE doc_index MATCH ?1 ORDER BY rank LIMIT 40",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([fts], |r| {
            Ok(SearchHit {
                doc_id: r.get(0)?,
                name: r.get(1)?,
                rel_path: r.get(2)?,
                course_id: r.get(3)?,
                snippet: r.get(4)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

/// One-shot search across courses, files (by name + PDF content) and notes.
#[tauri::command]
pub fn global_search(state: State<Db>, query: String) -> R<Vec<SearchResult>> {
    let q = query.trim().to_lowercase();
    if q.len() < 2 {
        return Ok(vec![]);
    }
    let like = format!("%{q}%");
    let conn = state.0.lock().unwrap();
    let mut results: Vec<SearchResult> = vec![];

    // Courses
    let mut stmt = conn
        .prepare("SELECT id, name, emoji FROM courses WHERE LOWER(name) LIKE ?1 LIMIT 6")
        .map_err(e)?;
    let rows = stmt
        .query_map([&like], |r| {
            Ok(SearchResult {
                kind: "course".into(),
                id: r.get(0)?,
                title: r.get(1)?,
                subtitle: r.get::<_, String>(2)?,
                snippet: String::new(),
                course_id: Some(r.get(0)?),
                file_kind: String::new(),
            })
        })
        .map_err(e)?;
    for row in rows.flatten() {
        results.push(row);
    }

    // Files by name
    let mut stmt = conn
        .prepare(
            "SELECT id, name, kind, course_id FROM files WHERE LOWER(name) LIKE ?1 \
             ORDER BY added_at DESC LIMIT 12",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([&like], |r| {
            Ok(SearchResult {
                kind: "file".into(),
                id: r.get(0)?,
                title: r.get(1)?,
                subtitle: "document".into(),
                snippet: String::new(),
                course_id: r.get(3)?,
                file_kind: r.get::<_, String>(2)?,
            })
        })
        .map_err(e)?;
    for row in rows.flatten() {
        results.push(row);
    }

    // Notes by title / body
    let mut stmt = conn
        .prepare(
            "SELECT id, title, body, course_id FROM notes \
             WHERE LOWER(title) LIKE ?1 OR LOWER(body) LIKE ?1 ORDER BY updated_at DESC LIMIT 10",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([&like], |r| {
            let body: String = r.get(2)?;
            let snippet: String = body.chars().take(120).collect();
            Ok(SearchResult {
                kind: "note".into(),
                id: r.get(0)?,
                title: r.get(1)?,
                subtitle: "note".into(),
                snippet,
                course_id: r.get(3)?,
                file_kind: String::new(),
            })
        })
        .map_err(e)?;
    for row in rows.flatten() {
        results.push(row);
    }

    // PDF content via FTS
    let fts = build_fts_query(&query);
    if !fts.is_empty() {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT f.id, f.name, f.kind, f.course_id, snippet(doc_index, 1, '', '', '…', 8) \
             FROM doc_index JOIN files f ON f.id = doc_index.file_id \
             WHERE doc_index MATCH ?1 LIMIT 8",
        ) {
            if let Ok(rows) = stmt.query_map([&fts], |r| {
                Ok(SearchResult {
                    kind: "file".into(),
                    id: r.get(0)?,
                    title: r.get(1)?,
                    subtitle: "contenu".into(),
                    snippet: r.get::<_, String>(4)?,
                    course_id: r.get(3)?,
                    file_kind: r.get::<_, String>(2)?,
                })
            }) {
                for row in rows.flatten() {
                    if !results.iter().any(|x| x.kind == "file" && x.id == row.id) {
                        results.push(row);
                    }
                }
            }
        }
    }

    Ok(results)
}

fn build_fts_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|t| t.replace('"', " ").trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    if tokens.is_empty() {
        return String::new();
    }
    let n = tokens.len();
    tokens
        .iter()
        .enumerate()
        .map(|(i, t)| {
            if i == n - 1 {
                format!("\"{t}\"*")
            } else {
                format!("\"{t}\"")
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn index_pdf(app: &AppHandle, state: &State<Db>, file_id: i64, name: &str, path: &PathBuf) {
    let text = crate::sidecar::run(
        app,
        "extract_pdf",
        &json!({ "path": path.to_string_lossy() }),
    )
    .ok()
    .and_then(|v| v.get("text").and_then(|t| t.as_str().map(String::from)))
    .unwrap_or_default();
    let conn = state.0.lock().unwrap();
    let _ = conn.execute("DELETE FROM doc_index WHERE file_id=?1", [file_id]);
    let _ = conn.execute(
        "INSERT INTO doc_index (name, content, file_id) VALUES (?1, ?2, ?3)",
        params![name, text, file_id],
    );
}

#[tauri::command]
pub fn reindex_documents(app: AppHandle, state: State<Db>) -> R<i64> {
    let pdfs: Vec<(i64, String, String)> = {
        let conn = state.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, rel_path FROM files WHERE kind='pdf'")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)?
    };
    let count = pdfs.len() as i64;
    for (id, name, rel) in pdfs {
        index_pdf(&app, &state, id, &name, &abs_path(&rel));
    }
    Ok(count)
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_reminders(state: State<Db>) -> R<Vec<Reminder>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, title, due_at, done, created_at FROM reminders \
             ORDER BY done, COALESCE(due_at, created_at)",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Reminder {
                id: r.get(0)?,
                title: r.get(1)?,
                due_at: r.get(2)?,
                done: r.get::<_, i64>(3)? != 0,
                created_at: r.get(4)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn create_reminder(state: State<Db>, title: String, due_at: Option<String>) -> R<Reminder> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO reminders (title, due_at) VALUES (?1, ?2)",
        params![title, due_at],
    )
    .map_err(e)?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, title, due_at, done, created_at FROM reminders WHERE id=?1",
        [id],
        |r| {
            Ok(Reminder {
                id: r.get(0)?,
                title: r.get(1)?,
                due_at: r.get(2)?,
                done: r.get::<_, i64>(3)? != 0,
                created_at: r.get(4)?,
            })
        },
    )
    .map_err(e)
}

#[tauri::command]
pub fn toggle_reminder(state: State<Db>, id: i64, done: bool) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE reminders SET done=?1 WHERE id=?2",
        params![done as i64, id],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn delete_reminder(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM reminders WHERE id=?1", [id]).map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Quick links
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_links(state: State<Db>) -> R<Vec<QuickLink>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, label, url, icon FROM links ORDER BY id")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(QuickLink {
                id: r.get(0)?,
                label: r.get(1)?,
                url: r.get(2)?,
                icon: r.get(3)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn create_link(state: State<Db>, label: String, url: String, icon: String) -> R<QuickLink> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO links (label, url, icon) VALUES (?1,?2,?3)",
        params![label, url, icon],
    )
    .map_err(e)?;
    let id = conn.last_insert_rowid();
    Ok(QuickLink { id, label, url, icon })
}

#[tauri::command]
pub fn delete_link(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM links WHERE id=?1", [id]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> R<()> {
    app.opener().open_url(url, None::<&str>).map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

fn map_schedule(r: &rusqlite::Row) -> rusqlite::Result<ScheduleEntry> {
    Ok(ScheduleEntry {
        id: r.get(0)?,
        day_of_week: r.get(1)?,
        start_time: r.get(2)?,
        end_time: r.get(3)?,
        subject: r.get(4)?,
        room: r.get(5)?,
        course_id: r.get(6)?,
        source: r.get(7)?,
    })
}

#[tauri::command]
pub fn list_schedule(state: State<Db>) -> R<Vec<ScheduleEntry>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, day_of_week, start_time, end_time, subject, room, course_id, source \
             FROM schedule ORDER BY day_of_week, start_time",
        )
        .map_err(e)?;
    let rows = stmt.query_map([], map_schedule).map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn get_today_classes(state: State<Db>) -> R<Vec<ScheduleEntry>> {
    let today = chrono::Local::now()
        .date_naive()
        .format("%u")
        .to_string()
        .parse::<i64>()
        .unwrap_or(1);
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, day_of_week, start_time, end_time, subject, room, course_id, source \
             FROM schedule WHERE day_of_week=?1 ORDER BY start_time",
        )
        .map_err(e)?;
    let rows = stmt.query_map([today], map_schedule).map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn save_schedule_entry(state: State<Db>, entry: ScheduleEntry) -> R<ScheduleEntry> {
    let conn = state.0.lock().unwrap();
    let id = if entry.id > 0 {
        conn.execute(
            "UPDATE schedule SET day_of_week=?1, start_time=?2, end_time=?3, subject=?4, room=?5, course_id=?6, source=?7 WHERE id=?8",
            params![entry.day_of_week, entry.start_time, entry.end_time, entry.subject, entry.room, entry.course_id, entry.source, entry.id],
        ).map_err(e)?;
        entry.id
    } else {
        conn.execute(
            "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, course_id, source) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![entry.day_of_week, entry.start_time, entry.end_time, entry.subject, entry.room, entry.course_id, entry.source],
        ).map_err(e)?;
        conn.last_insert_rowid()
    };
    conn.query_row(
        "SELECT id, day_of_week, start_time, end_time, subject, room, course_id, source FROM schedule WHERE id=?1",
        [id],
        map_schedule,
    ).map_err(e)
}

#[tauri::command]
pub fn delete_schedule_entry(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM schedule WHERE id=?1", [id]).map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Whiteboard
// ---------------------------------------------------------------------------

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

/// Saves a whiteboard in Euclide's own editable vector format (`.euboard`, JSON of
/// strokes). Re-opening a board restores every stroke so it stays editable.
#[tauri::command]
pub fn save_board(state: State<Db>, save: BoardSave) -> R<FileItem> {
    if let Some(id) = save.file_id {
        let rel: String = {
            let conn = state.0.lock().unwrap();
            conn.query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
                .map_err(e)?
        };
        let abs = abs_path(&rel);
        fs::write(&abs, save.json).map_err(e)?;
        let size = fs::metadata(&abs).map(|m| m.len() as i64).unwrap_or(0);
        let conn = state.0.lock().unwrap();
        conn.execute("UPDATE files SET size=?1, added_at=datetime('now') WHERE id=?2", params![size, id])
            .map_err(e)?;
        return conn
            .query_row(
                "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files WHERE id=?1",
                [id],
                map_file,
            )
            .map_err(e);
    }

    let base = save
        .name
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| {
            format!("Tableau {}", chrono::Local::now().format("%d-%m %H-%M"))
        });
    let file_name = if base.ends_with(".euboard") {
        base
    } else {
        format!("{base}.euboard")
    };
    let dest = unique_dest(&crate::paths::whiteboards_dir(), &file_name);
    fs::write(&dest, save.json).map_err(e)?;
    register_file(&state, save.course_id, &dest)
}

/// PDF annotations are stored as JSON keyed by the file id, so a PDF can be
/// marked up (pen, highlight, text) and reopened with the marks intact.
#[tauri::command]
pub fn save_annotations(state: State<Db>, file_id: i64, json: String) -> R<()> {
    let conn = state.0.lock().unwrap();
    set_setting_raw(&conn, &format!("pdf_annot_{file_id}"), &json);
    Ok(())
}

#[tauri::command]
pub fn read_annotations(state: State<Db>, file_id: i64) -> R<Option<String>> {
    let conn = state.0.lock().unwrap();
    Ok(get_setting_raw(&conn, &format!("pdf_annot_{file_id}")))
}

/// Saves a generated file (e.g. an annotated PDF exported from the viewer)
/// into the documents library from a data URL.
#[tauri::command]
pub fn save_export(state: State<Db>, name: String, data_url: String) -> R<FileItem> {
    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or_else(|| "donnee invalide".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(e)?;
    let dest = unique_dest(&crate::paths::documents_dir(), &name);
    fs::write(&dest, bytes).map_err(e)?;
    register_file(&state, None, &dest)
}

#[tauri::command]
pub fn read_board(state: State<Db>, id: i64) -> R<String> {
    let rel: String = {
        let conn = state.0.lock().unwrap();
        conn.query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
            .map_err(e)?
    };
    fs::read_to_string(abs_path(&rel)).map_err(e)
}

/// Optional PNG export of a board (e.g. to attach elsewhere).
#[tauri::command]
pub fn export_board_png(state: State<Db>, course_id: Option<i64>, name: String, data_url: String) -> R<FileItem> {
    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or_else(|| "image invalide".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(e)?;
    let file_name = if name.to_lowercase().ends_with(".png") {
        name
    } else {
        format!("{name}.png")
    };
    let dest = unique_dest(&crate::paths::documents_dir(), &file_name);
    fs::write(&dest, bytes).map_err(e)?;
    register_file(&state, course_id, &dest)
}

// ---------------------------------------------------------------------------
// Python demos
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_python_demos() -> R<Vec<PythonDemo>> {
    let dir = crate::paths::python_dir();
    let mut demos = vec![];
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|x| x == "py").unwrap_or(false) {
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().replace('_', " "))
                    .unwrap_or_default();
                let code = fs::read_to_string(&path).unwrap_or_default();
                demos.push(PythonDemo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    code,
                });
            }
        }
    }
    demos.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(demos)
}

fn slugify(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let s = s.trim_matches('_').to_string();
    if s.is_empty() { "script".into() } else { s }
}

#[tauri::command]
pub fn create_python_script(name: String, code: String) -> R<PythonDemo> {
    let dir = crate::paths::python_dir();
    let _ = fs::create_dir_all(&dir);
    let dest = unique_dest(&dir, &format!("{}.py", slugify(&name)));
    fs::write(&dest, &code).map_err(e)?;
    let display = dest
        .file_stem()
        .map(|s| s.to_string_lossy().replace('_', " "))
        .unwrap_or_default();
    Ok(PythonDemo {
        name: display,
        path: dest.to_string_lossy().to_string(),
        code,
    })
}

#[tauri::command]
pub fn save_python_script(path: String, code: String) -> R<()> {
    // keep edits inside the python scripts directory
    let dir = crate::paths::python_dir();
    let p = PathBuf::from(&path);
    if !p.starts_with(&dir) {
        return Err("Chemin de script invalide.".into());
    }
    fs::write(&p, code).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn delete_python_script(path: String) -> R<()> {
    let dir = crate::paths::python_dir();
    let p = PathBuf::from(&path);
    if !p.starts_with(&dir) {
        return Err("Chemin de script invalide.".into());
    }
    fs::remove_file(&p).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub async fn import_python_script(app: AppHandle) -> R<Option<PythonDemo>> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter("Scripts Python", &["py"])
        .pick_file(move |f| {
            let _ = tx.send(f);
        });
    let Some(picked) = rx.recv().ok().flatten() else {
        return Ok(None);
    };
    let Ok(src) = picked.into_path() else {
        return Ok(None);
    };
    let dir = crate::paths::python_dir();
    let _ = fs::create_dir_all(&dir);
    let file_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "script.py".into());
    let dest = unique_dest(&dir, &file_name);
    fs::copy(&src, &dest).map_err(e)?;
    let code = fs::read_to_string(&dest).unwrap_or_default();
    let display = dest
        .file_stem()
        .map(|s| s.to_string_lossy().replace('_', " "))
        .unwrap_or_default();
    Ok(Some(PythonDemo {
        name: display,
        path: dest.to_string_lossy().to_string(),
        code,
    }))
}

#[tauri::command]
pub fn run_python_demo(app: AppHandle, path: String) -> R<PythonResult> {
    let v = crate::sidecar::run(&app, "run_demo", &json!({ "path": path }))?;
    Ok(PythonResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v.get("stdout").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        stderr: v.get("stderr").and_then(|x| x.as_str()).unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub fn run_python_code(app: AppHandle, code: String) -> R<PythonResult> {
    // Write to a temp file inside the python dir and run it, so unsaved edits
    // can be executed immediately.
    let dir = crate::paths::python_dir();
    let _ = fs::create_dir_all(&dir);
    let tmp = dir.join(".scratch.py");
    fs::write(&tmp, code).map_err(e)?;
    let v = crate::sidecar::run(
        &app,
        "run_demo",
        &json!({ "path": tmp.to_string_lossy().to_string() }),
    )?;
    Ok(PythonResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v.get("stdout").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        stderr: v.get("stderr").and_then(|x| x.as_str()).unwrap_or("").to_string(),
    })
}

// ---------------------------------------------------------------------------
// Keep awake
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn set_keep_awake(ka: State<KeepAwake>, on: bool) -> bool {
    crate::keepawake::set(on);
    *ka.0.lock().unwrap() = on;
    on
}

#[tauri::command]
pub fn keep_awake_status(ka: State<KeepAwake>) -> bool {
    *ka.0.lock().unwrap()
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

fn get_setting_raw(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
        .optional()
        .ok()
        .flatten()
}

fn set_setting_raw(conn: &rusqlite::Connection, key: &str, value: &str) {
    let _ = conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    );
}

#[tauri::command]
pub fn get_setting(state: State<Db>, key: String) -> R<Option<String>> {
    let conn = state.0.lock().unwrap();
    Ok(get_setting_raw(&conn, &key))
}

#[tauri::command]
pub fn set_setting(state: State<Db>, key: String, value: String) -> R<()> {
    let conn = state.0.lock().unwrap();
    set_setting_raw(&conn, &key, &value);
    Ok(())
}

// ---------------------------------------------------------------------------
// Usage events & recap
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn log_event(state: State<Db>, kind: String, label: String, course_id: Option<i64>) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO usage_events (kind, label, course_id) VALUES (?1,?2,?3)",
        params![kind, label, course_id],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn get_recap(state: State<Db>, period: String) -> R<RecapData> {
    let (clause, label) = match period.as_str() {
        "week" => (
            "created_at >= datetime('now', '-7 days')",
            "Cette semaine",
        ),
        "all" => ("1=1", "Depuis le debut"),
        _ => ("date(created_at) = date('now', 'localtime')", "Aujourd'hui"),
    };
    let conn = state.0.lock().unwrap();

    let count = |kind: &str| -> i64 {
        conn.query_row(
            &format!("SELECT COUNT(*) FROM usage_events WHERE kind=?1 AND {clause}"),
            [kind],
            |r| r.get(0),
        )
        .unwrap_or(0)
    };

    let files_opened = count("file_open");
    let notes_written = count("note_new");
    let demos_run = count("demo_run");
    let reminders_done = count("reminder_done");

    let active_minutes: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(DISTINCT strftime('%Y-%m-%d %H:%M', created_at)) \
                 FROM usage_events WHERE {clause}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut top_courses = vec![];
    {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT c.name, c.emoji, COUNT(*) as n FROM usage_events u \
                 JOIN courses c ON c.id = u.course_id \
                 WHERE u.course_id IS NOT NULL AND {clause} \
                 GROUP BY u.course_id ORDER BY n DESC LIMIT 4"
            ))
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(TopCourse {
                    name: r.get(0)?,
                    emoji: r.get(1)?,
                    count: r.get(2)?,
                })
            })
            .map_err(e)?;
        for row in rows {
            top_courses.push(row.map_err(e)?);
        }
    }

    let mut highlights = vec![];
    if files_opened > 0 {
        highlights.push(format!("Vous avez ouvert {files_opened} fichier(s)."));
    }
    if notes_written > 0 {
        highlights.push(format!("{notes_written} nouvelle(s) note(s) preparee(s)."));
    }
    if let Some(top) = top_courses.first() {
        highlights.push(format!("Cours le plus actif : {} {}.", top.emoji, top.name));
    }
    if reminders_done > 0 {
        highlights.push(format!("{reminders_done} rappel(s) accompli(s). Bravo !"));
    }
    if highlights.is_empty() {
        highlights.push("Rien d'enregistre pour cette periode. Bonne classe !".into());
    }

    Ok(RecapData {
        period_label: label.into(),
        files_opened,
        notes_written,
        demos_run,
        reminders_done,
        active_minutes,
        top_courses,
        highlights,
    })
}

// ---------------------------------------------------------------------------
// Pronote
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn pronote_status(state: State<Db>) -> R<PronoteStatus> {
    let conn = state.0.lock().unwrap();
    let connected = get_setting_raw(&conn, "pronote_connected").as_deref() == Some("1");
    Ok(PronoteStatus {
        connected,
        account_name: get_setting_raw(&conn, "pronote_account"),
        last_sync: get_setting_raw(&conn, "pronote_last_sync"),
    })
}

#[tauri::command]
pub fn pronote_qr_login(app: AppHandle, state: State<Db>, qr_json: String, pin: String) -> R<PronoteStatus> {
    // Stable UUID must never change between logins.
    let uuid = {
        let conn = state.0.lock().unwrap();
        match get_setting_raw(&conn, "pronote_uuid") {
            Some(u) => u,
            None => {
                let u = uuid::Uuid::new_v4().to_string();
                set_setting_raw(&conn, "pronote_uuid", &u);
                u
            }
        }
    };

    let qr_value: serde_json::Value =
        serde_json::from_str(&qr_json).unwrap_or(serde_json::Value::String(qr_json.clone()));

    let res = crate::sidecar::run(
        &app,
        "pronote_login",
        &json!({ "qr": qr_value, "pin": pin, "uuid": uuid }),
    )?;

    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        return Ok(PronoteStatus {
            connected: false,
            account_name: None,
            last_sync: None,
        });
    }

    let account = res.get("account_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    {
        let conn = state.0.lock().unwrap();
        set_setting_raw(&conn, "pronote_connected", "1");
        set_setting_raw(&conn, "pronote_mode", "qr");
        set_setting_raw(&conn, "pronote_account", &account);
        for key in ["url", "username", "password"] {
            if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
                set_setting_raw(&conn, &format!("pronote_{key}"), v);
            }
        }
    }

    Ok(PronoteStatus {
        connected: true,
        account_name: Some(account),
        last_sync: None,
    })
}

#[tauri::command]
pub fn pronote_password_login(
    app: AppHandle,
    state: State<Db>,
    url: String,
    username: String,
    password: String,
) -> R<PronoteStatus> {
    let res = crate::sidecar::run(
        &app,
        "pronote_password_login",
        &json!({ "url": url, "username": username, "password": password }),
    )?;

    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("Connexion echouee");
        return Err(err.to_string());
    }

    let account = res.get("account_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    {
        let conn = state.0.lock().unwrap();
        set_setting_raw(&conn, "pronote_connected", "1");
        set_setting_raw(&conn, "pronote_mode", "password");
        set_setting_raw(&conn, "pronote_account", &account);
        set_setting_raw(&conn, "pronote_url", &url);
        set_setting_raw(&conn, "pronote_username", &username);
        set_setting_raw(&conn, "pronote_password", &password);
    }

    Ok(PronoteStatus {
        connected: true,
        account_name: Some(account),
        last_sync: None,
    })
}

#[tauri::command]
pub fn pronote_sync(app: AppHandle, state: State<Db>) -> R<i64> {
    let creds = {
        let conn = state.0.lock().unwrap();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::run(&app, "pronote_sync", &creds)?;
    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res.get("error").and_then(|x| x.as_str()).unwrap_or("synchronisation echouee");
        return Err(err.to_string());
    }

    let conn = state.0.lock().unwrap();
    // The password token rotates on every login: persist the new one or future
    // logins will fail.
    for key in ["username", "password"] {
        if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
            set_setting_raw(&conn, &format!("pronote_{key}"), v);
        }
    }
    if let Some(name) = res.get("account_name").and_then(|x| x.as_str()) {
        if !name.is_empty() {
            set_setting_raw(&conn, "pronote_account", name);
        }
    }

    conn.execute("DELETE FROM schedule WHERE source='pronote'", []).map_err(e)?;
    let mut count = 0i64;
    if let Some(lessons) = res.get("lessons").and_then(|x| x.as_array()) {
        for l in lessons {
            let day = l.get("day_of_week").and_then(|x| x.as_i64()).unwrap_or(0);
            if day < 1 || day > 7 {
                continue;
            }
            let start = l.get("start_time").and_then(|x| x.as_str()).unwrap_or("");
            let end = l.get("end_time").and_then(|x| x.as_str()).unwrap_or("");
            let subject = l.get("subject").and_then(|x| x.as_str()).unwrap_or("Cours");
            let room = l.get("room").and_then(|x| x.as_str()).unwrap_or("");
            let group = l.get("group").and_then(|x| x.as_str()).unwrap_or("");
            let subject = if group.is_empty() {
                subject.to_string()
            } else {
                format!("{subject} · {group}")
            };
            conn.execute(
                "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, source) VALUES (?1,?2,?3,?4,?5,'pronote')",
                params![day, start, end, subject, room],
            ).map_err(e)?;
            count += 1;
        }
    }
    set_setting_raw(
        &conn,
        "pronote_last_sync",
        &chrono::Local::now().format("%d/%m %H:%M").to_string(),
    );
    Ok(count)
}

#[tauri::command]
pub fn pronote_logout(state: State<Db>) -> R<()> {
    let conn = state.0.lock().unwrap();
    for key in [
        "pronote_connected",
        "pronote_mode",
        "pronote_account",
        "pronote_url",
        "pronote_username",
        "pronote_password",
        "pronote_last_sync",
    ] {
        let _ = conn.execute("DELETE FROM settings WHERE key=?1", [key]);
    }
    conn.execute("DELETE FROM schedule WHERE source='pronote'", []).map_err(e)?;
    Ok(())
}

/// Fetches "le contenu des cours" (lesson contents from cahier de textes) via the sidecar.
/// Filters by optional subject and class/group name if provided. Always returns fresh
/// credentials in the response so callers can persist rotated tokens (QR mode).
/// "Just make it available" - the frontend binding + Rust wrapper; usage TBD.
#[tauri::command]
pub fn pronote_contents(
    app: AppHandle,
    state: State<Db>,
    subject: Option<String>,
    class_name: Option<String>,
) -> R<serde_json::Value> {
    let creds = {
        let conn = state.0.lock().unwrap();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "subject": subject,
            "class": class_name,
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::run(&app, "pronote_contents", &creds)?;
    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("recuperation des contenus echouee");
        return Err(err.to_string());
    }

    // Persist rotated token (QR) for future calls, like sync does.
    let conn = state.0.lock().unwrap();
    for key in ["username", "password"] {
        if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
            set_setting_raw(&conn, &format!("pronote_{key}"), v);
        }
    }

    Ok(res)
}

// ---------------------------------------------------------------------------

fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}
