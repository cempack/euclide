use crate::db::Db;
use crate::keepawake::KeepAwake;
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
    windows_portable: bool,
}

#[derive(Serialize, Deserialize)]
pub struct Course {
    id: i64,
    name: String,
    emoji: String,
    color: String,
    description: String,
    matiere: String, // "Mathématiques" | "NSI" | "Maths expertes" - used to map to Pronote subject for cahier de textes contents
    created_at: String,
}

/// Attachment of a course to a Pronote class/group. Stores per-class progress (last document)
/// and professor notes specific to how far that class has gone in the course.
#[derive(Serialize, Deserialize)]
pub struct CourseClass {
    #[serde(default)]
    id: i64,
    course_id: i64,
    class_name: String,
    #[serde(default)]
    last_file_id: Option<i64>,
    #[serde(default)]
    last_file_name: Option<String>,
    #[serde(default)]
    last_file_kind: Option<String>,
    #[serde(default)]
    progress_updated_at: String,
    #[serde(default)]
    notes: String,
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

#[derive(Serialize, Clone)]
pub struct PythonCompletion {
    name: String,
    complete: Option<String>,
    #[serde(rename = "type")]
    type_: Option<String>,
    signature: Option<String>,
    doc: Option<String>,
}

#[derive(Serialize)]
pub struct TopCourse {
    name: String,
    emoji: String,
    count: i64,
}

#[derive(Serialize)]
pub struct TopItem {
    name: String,
    count: i64,
}

#[derive(Serialize)]
pub struct RecapData {
    period_label: Option<String>,
    files_opened: i64,
    notes_written: i64,
    demos_run: i64,
    reminders_done: i64,
    active_minutes: i64,
    top_courses: Vec<TopCourse>,
    top_documents: Vec<TopItem>,
    top_tools: Vec<TopItem>,
    time_by_area: Vec<TopItem>,
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
        windows_portable: crate::portable_update::is_windows_portable(),
    }
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_courses(state: State<Db>) -> R<Vec<Course>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare_cached("SELECT id, name, emoji, color, description, matiere, created_at FROM courses ORDER BY name")
        .map_err(e)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Course {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                description: r.get(4)?,
                matiere: r.get(5)?,
                created_at: r.get(6)?,
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
    matiere: String, // "Mathématiques" | "NSI" | "Maths expertes"
) -> R<Course> {
    let id = {
        let conn = state.0.lock().unwrap();
        conn.execute(
            "INSERT INTO courses (name, emoji, color, description, matiere) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![name, emoji, color, description, matiere],
        )
        .map_err(e)?;
        conn.last_insert_rowid()
    };
    let _ = fs::create_dir_all(crate::paths::courses_dir().join(id.to_string()));
    let conn = state.0.lock().unwrap();
    conn.query_row(
        "SELECT id, name, emoji, color, description, matiere, created_at FROM courses WHERE id = ?1",
        [id],
        |r| {
            Ok(Course {
                id: r.get(0)?,
                name: r.get(1)?,
                emoji: r.get(2)?,
                color: r.get(3)?,
                description: r.get(4)?,
                matiere: r.get(5)?,
                created_at: r.get(6)?,
            })
        },
    )
    .map_err(e)
}

#[tauri::command]
pub fn update_course(state: State<Db>, course: Course) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE courses SET name=?1, emoji=?2, color=?3, description=?4, matiere=?5 WHERE id=?6",
        params![course.name, course.emoji, course.color, course.description, course.matiere, course.id],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn delete_course(state: State<Db>, id: i64) -> R<()> {
    {
        let conn = state.0.lock().unwrap();
        conn.execute("DELETE FROM courses WHERE id=?1", [id]).map_err(e)?;
    }
    let _ = fs::remove_dir_all(crate::paths::courses_dir().join(id.to_string()));
    Ok(())
}

// ---------------------------------------------------------------------------
// Course classes (attachments, per-class progress & teacher notes)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_course_classes(state: State<Db>, course_id: i64) -> R<Vec<CourseClass>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare_cached(
            "SELECT cc.id, cc.course_id, cc.class_name, cc.last_file_id, \
                    f.name, f.kind, cc.progress_updated_at, cc.notes \
             FROM course_classes cc \
             LEFT JOIN files f ON f.id = cc.last_file_id \
             WHERE cc.course_id = ?1 \
             ORDER BY cc.class_name",
        )
        .map_err(e)?;
    let rows = stmt
        .query_map([course_id], |r| {
            Ok(CourseClass {
                id: r.get(0)?,
                course_id: r.get(1)?,
                class_name: r.get(2)?,
                last_file_id: r.get(3)?,
                last_file_name: r.get(4)?,
                last_file_kind: r.get(5)?,
                progress_updated_at: r.get(6)?,
                notes: r.get(7)?,
            })
        })
        .map_err(e)?;
    rows.collect::<Result<_, _>>().map_err(e)
}

#[tauri::command]
pub fn attach_class_to_course(state: State<Db>, course_id: i64, class_name: String) -> R<CourseClass> {
    let conn = state.0.lock().unwrap();
    let class_name = class_name.trim().to_string();
    if class_name.is_empty() {
        return Err("Nom de classe vide".into());
    }
    conn.execute(
        "INSERT OR IGNORE INTO course_classes (course_id, class_name) VALUES (?1, ?2)",
        params![course_id, class_name],
    )
    .map_err(e)?;
    // Return the (possibly just created) row with join for last file info
    conn.query_row(
        "SELECT cc.id, cc.course_id, cc.class_name, cc.last_file_id, \
                f.name, f.kind, cc.progress_updated_at, cc.notes \
         FROM course_classes cc \
         LEFT JOIN files f ON f.id = cc.last_file_id \
         WHERE cc.course_id = ?1 AND cc.class_name = ?2",
        params![course_id, class_name],
        |r| {
            Ok(CourseClass {
                id: r.get(0)?,
                course_id: r.get(1)?,
                class_name: r.get(2)?,
                last_file_id: r.get(3)?,
                last_file_name: r.get(4)?,
                last_file_kind: r.get(5)?,
                progress_updated_at: r.get(6)?,
                notes: r.get(7)?,
            })
        },
    )
    .map_err(e)
}

#[tauri::command]
pub fn detach_course_class(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM course_classes WHERE id=?1", [id]).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn set_course_class_progress(
    state: State<Db>,
    course_id: i64,
    class_name: String,
    file_id: Option<i64>,
) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE course_classes \
         SET last_file_id = ?1, progress_updated_at = datetime('now') \
         WHERE course_id = ?2 AND class_name = ?3",
        params![file_id, course_id, class_name],
    )
    .map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn update_course_class_notes(
    state: State<Db>,
    course_id: i64,
    class_name: String,
    notes: String,
) -> R<()> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE course_classes SET notes = ?1 WHERE course_id = ?2 AND class_name = ?3",
        params![notes, course_id, class_name],
    )
    .map_err(e)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_notes(state: State<Db>, course_id: Option<i64>) -> R<Vec<Note>> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare_cached(
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
        .prepare_cached(
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
            "UPDATE notes SET title=?1, body=?2, course_id=?3, updated_at=datetime('now') WHERE id=?4",
            params![note.title, note.body, note.course_id, note.id],
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

#[tauri::command]
pub fn rename_note(state: State<Db>, id: i64, new_title: String) -> R<Note> {
    let title = new_title.trim().to_string();
    if title.is_empty() {
        return Err("Le titre ne peut pas être vide.".into());
    }
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE notes SET title=?1, updated_at=datetime('now') WHERE id=?2",
        params![title, id],
    )
    .map_err(e)?;
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
        .prepare_cached(
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
        .prepare_cached(
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
            index_pdf(&app, &state, item.id, &item.name, &dest).await;
        }
        imported.push(item);
    }
    Ok(imported)
}

/// Imports files from explicit absolute paths (used by drag-and-drop).
#[tauri::command]
pub async fn import_paths(
    app: AppHandle,
    state: State<'_, Db>,
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
            index_pdf(&app, &state, item.id, &item.name, &dest).await;
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
pub fn open_file(app: AppHandle, state: State<Db>, id: i64, with_app: Option<String>) -> R<()> {
    let path = file_path(state, id)?;
    app.opener().open_path(path, with_app).map_err(e)?;
    Ok(())
}

#[tauri::command]
pub fn reveal_file(app: AppHandle, state: State<Db>, id: i64) -> R<()> {
    let path = file_path(state, id)?;
    app.opener().reveal_item_in_dir(path).map_err(e)?;
    Ok(())
}

#[derive(Serialize)]
pub struct Opener {
    name: String,
    app: Option<String>,
    is_reveal: bool,
}

#[tauri::command]
pub fn list_openers(_state: State<Db>, _id: i64) -> R<Vec<Opener>> {
    Ok(vec![
        Opener {
            name: "Navigateur par défaut".to_string(),
            app: None,
            is_reveal: false,
        },
        Opener {
            name: "Application par défaut".to_string(),
            app: None,
            is_reveal: false,
        },
        Opener {
            name: "Afficher dans le dossier".to_string(),
            app: None,
            is_reveal: true,
        },
    ])
}



#[tauri::command]
pub fn delete_file(state: State<Db>, id: i64) -> R<()> {
    let conn = state.0.lock().unwrap();
    let rel: Option<String> = conn
        .query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
        .optional()
        .map_err(e)?;
    let versions_key = format!("file_versions_{id}");
    let annot_key = format!("pdf_annot_{id}");
    if let Some(vstr) = get_setting_raw(&conn, &versions_key) {
        if let Ok(versions) = serde_json::from_str::<Vec<Value>>(&vstr) {
            let vdir = crate::paths::documents_dir().join(".versions");
            for v in versions {
                if let Some(name) = v.get("backup_name").and_then(|x| x.as_str()) {
                    let _ = fs::remove_file(vdir.join(name));
                }
            }
        }
    }
    let _ = conn.execute("DELETE FROM settings WHERE key=?1", [&versions_key]);
    let _ = conn.execute("DELETE FROM settings WHERE key=?1", [&annot_key]);
    conn.execute("DELETE FROM files WHERE id=?1", [id]).map_err(e)?;
    conn.execute("DELETE FROM doc_index WHERE file_id=?1", [id]).map_err(e)?;
    if let Some(rel) = rel {
        let _ = fs::remove_file(abs_path(&rel));
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_file(app: AppHandle, state: State<'_, Db>, id: i64, new_name: String) -> R<FileItem> {
    let trimmed = new_name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Le nom ne peut pas être vide.".into());
    }

    // Load current metadata (outside long lock)
    let (old_rel, old_name, old_kind, _course_id): (String, String, String, Option<i64>) = {
        let conn = state.0.lock().unwrap();
        let rel: String = conn
            .query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0))
            .map_err(e)?;
        let nm: String = conn
            .query_row("SELECT name FROM files WHERE id=?1", [id], |r| r.get(0))
            .map_err(e)?;
        let k: String = conn
            .query_row("SELECT kind FROM files WHERE id=?1", [id], |r| r.get(0))
            .map_err(e)?;
        let c: Option<i64> = conn
            .query_row("SELECT course_id FROM files WHERE id=?1", [id], |r| r.get(0))
            .map_err(e)?;
        (rel, nm, k, c)
    };

    if trimmed == old_name {
        // No change; return fresh record
        let conn = state.0.lock().unwrap();
        return conn
            .query_row(
                "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files WHERE id=?1",
                [id],
                map_file,
            )
            .map_err(e);
    }

    let old_abs = abs_path(&old_rel);
    let dir = old_abs
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Chemin de fichier invalide.".to_string())?;

    // If user didn't include an extension in the new name, preserve the old one (nice UX for boards/pdfs etc.)
    let old_ext = PathBuf::from(&old_name)
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    let candidate_has_ext = PathBuf::from(&trimmed).extension().is_some();
    let candidate = if !candidate_has_ext && !old_ext.is_empty() {
        format!("{}{}", trimmed, old_ext)
    } else {
        trimmed.clone()
    };

    let abs_candidate = dir.join(&candidate);
    let (abs_new, final_name): (PathBuf, String) = if abs_candidate == old_abs || !abs_candidate.exists() {
        (abs_candidate, candidate)
    } else {
        // collision with a *different* file: uniquify (like import)
        let dest = unique_dest(&dir, &candidate);
        (dest.clone(), dest.file_name().unwrap().to_string_lossy().to_string())
    };

    if abs_new != old_abs {
        fs::rename(&old_abs, &abs_new).map_err(e)?;
    }

    let new_rel = rel_path(&abs_new);
    let new_kind = kind_from_ext(&final_name);

    {
        let conn = state.0.lock().unwrap();
        conn.execute(
            "UPDATE files SET name=?1, rel_path=?2, kind=?3 WHERE id=?4",
            params![final_name, new_rel, new_kind, id],
        )
        .map_err(e)?;
    }

    // Keep search index consistent for PDFs (name + content); drop if no longer a PDF
    if new_kind == "pdf" {
        index_pdf(&app, &state, id, &final_name, &abs_new).await;
    } else if old_kind == "pdf" {
        let conn = state.0.lock().unwrap();
        let _ = conn.execute("DELETE FROM doc_index WHERE file_id=?1", [id]);
    }

    // Return fresh record
    let conn = state.0.lock().unwrap();
    conn.query_row(
        "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files WHERE id=?1",
        [id],
        map_file,
    )
    .map_err(e)
}

/// One-shot search across courses, files (by name + PDF content) and notes.
/// Uses fuzzy name matching (typos + partial) + FTS for PDF content.
#[tauri::command]
pub fn global_search(state: State<Db>, query: String) -> R<Vec<SearchResult>> {
    let q = query.trim();
    if q.len() < 2 {
        return Ok(vec![]);
    }
    let conn = state.0.lock().unwrap();
    let mut scored: Vec<(f32, SearchResult)> = vec![];

    // Courses (fuzzy on name)
    if let Ok(mut stmt) = conn.prepare_cached("SELECT id, name, emoji FROM courses LIMIT 100") {
        if let Ok(rows) = stmt.query_map([], |r| {
            let id: i64 = r.get(0)?;
            let name: String = r.get(1)?;
            let emoji: String = r.get(2)?;
            let s = match_score(&name, q);
            if s > 5.0 {
                Ok(Some((s, SearchResult {
                    kind: "course".into(),
                    id,
                    title: name,
                    subtitle: emoji,
                    snippet: String::new(),
                    course_id: Some(id),
                    file_kind: String::new(),
                })))
            } else {
                Ok(None)
            }
        }) {
            for r in rows.flatten().flatten() {
                scored.push(r);
            }
        }
    }

    // Files by name (fuzzy)
    if let Ok(mut stmt) = conn.prepare_cached(
        "SELECT id, name, kind, course_id FROM files ORDER BY added_at DESC LIMIT 200",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            let id: i64 = r.get(0)?;
            let name: String = r.get(1)?;
            let kind: String = r.get(2)?;
            let course_id: Option<i64> = r.get(3)?;
            let s = match_score(&name, q);
            if s > 5.0 {
                Ok(Some((s, SearchResult {
                    kind: "file".into(),
                    id,
                    title: name,
                    subtitle: "document".into(),
                    snippet: String::new(),
                    course_id,
                    file_kind: kind,
                })))
            } else {
                Ok(None)
            }
        }) {
            for r in rows.flatten().flatten() {
                scored.push(r);
            }
        }
    }

    // Notes by title/body (fuzzy)
    if let Ok(mut stmt) = conn.prepare_cached(
        "SELECT id, title, body, course_id FROM notes ORDER BY updated_at DESC LIMIT 100",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            let id: i64 = r.get(0)?;
            let title: String = r.get(1)?;
            let body: String = r.get(2)?;
            let course_id: Option<i64> = r.get(3)?;
            let s = match_score(&title, q).max(match_score(&body, q));
            if s > 5.0 {
                let snippet: String = body.chars().take(120).collect();
                Ok(Some((s, SearchResult {
                    kind: "note".into(),
                    id,
                    title: if title.is_empty() { "Note".into() } else { title },
                    subtitle: "note".into(),
                    snippet,
                    course_id,
                    file_kind: String::new(),
                })))
            } else {
                Ok(None)
            }
        }) {
            for r in rows.flatten().flatten() {
                scored.push(r);
            }
        }
    }

    // PDF content via FTS (still precise for inside docs)
    let fts = build_fts_query(q);
    if !fts.is_empty() {
        if let Ok(mut stmt) = conn.prepare_cached(
            "SELECT f.id, f.name, f.kind, f.course_id, snippet(doc_index, 1, '', '', '…', 8) \
             FROM doc_index JOIN files f ON f.id = doc_index.file_id \
             WHERE doc_index MATCH ?1 LIMIT 8",
        ) {
            if let Ok(rows) = stmt.query_map([&fts], |r| {
                let id: i64 = r.get(0)?;
                let name: String = r.get(1)?;
                let kind: String = r.get(2)?;
                let course_id: Option<i64> = r.get(3)?;
                let snip: String = r.get(4)?;
                // give content matches a solid but not top score unless name also good
                let name_s = match_score(&name, q);
                let s = if name_s > 0.0 { name_s } else { 52.0 };
                Ok(Some((s, SearchResult {
                    kind: "file".into(),
                    id,
                    title: name,
                    subtitle: "contenu".into(),
                    snippet: snip,
                    course_id,
                    file_kind: kind,
                })))
            }) {
                for r in rows.flatten().flatten() {
                    // dedup later
                    scored.push(r);
                }
            }
        }
    }

    // rank by score desc, dedup files, cap results
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut results: Vec<SearchResult> = vec![];
    let mut seen_file: std::collections::HashSet<i64> = std::collections::HashSet::new();
    for (_s, r) in scored {
        if r.kind == "file" {
            if seen_file.contains(&r.id) {
                continue;
            }
            seen_file.insert(r.id);
        }
        results.push(r);
        if results.len() >= 20 {
            break;
        }
    }

    Ok(results)
}

// --- fuzzy helpers for name search (typo tolerant + partial matches) ---
fn normalize(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter_map(|c| match c {
            'é' | 'è' | 'ê' | 'ë' => Some('e'),
            'à' | 'â' | 'ä' => Some('a'),
            'î' | 'ï' => Some('i'),
            'ô' | 'ö' => Some('o'),
            'ù' | 'û' | 'ü' => Some('u'),
            'ç' => Some('c'),
            c if c.is_alphanumeric() || c.is_whitespace() => Some(c),
            _ => None,
        })
        .collect()
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let len_a = a.len();
    let len_b = b.len();
    if len_a == 0 { return len_b; }
    if len_b == 0 { return len_a; }
    let mut prev: Vec<usize> = (0..=len_b).collect();
    let mut curr = vec![0usize; len_b + 1];
    for i in 1..=len_a {
        curr[0] = i;
        for j in 1..=len_b {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            curr[j] = prev[j].min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[len_b]
}

fn match_score(text: &str, query: &str) -> f32 {
    let t = normalize(text);
    let q = normalize(query);
    if q.is_empty() { return 0.0; }
    if t == q { return 100.0; }
    if t.starts_with(&q) { return 95.0; }
    if t.contains(&q) { return 80.0; }
    // small edit distance tolerates typos (replace/insert/delete)
    let d = levenshtein(&t, &q);
    if d <= 1 { return 85.0; }
    if d <= 2 && q.len() >= 4 { return 72.0; }
    // subsequence (good for partial typing "docu" in "document-foo.pdf")
    let mut qi = 0usize;
    let qchars: Vec<char> = q.chars().collect();
    for tc in t.chars() {
        if qi < qchars.len() && tc == qchars[qi] {
            qi += 1;
        }
    }
    if qi == qchars.len() { return 62.0; }
    if qi >= qchars.len().saturating_mul(2) / 3 && qi >= 2 { return 45.0; }
    0.0
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

async fn index_pdf(app: &AppHandle, state: &State<'_, Db>, file_id: i64, name: &str, path: &PathBuf) {
    let text = crate::sidecar::call(
        app,
        "extract_pdf",
        &json!({ "path": path.to_string_lossy() }),
    )
    .await
    .ok()
    .and_then(|v: Value| v.get("text").and_then(|t| t.as_str().map(String::from)))
    .unwrap_or_default();
    let conn = state.0.lock().unwrap();
    let _ = conn.execute("DELETE FROM doc_index WHERE file_id=?1", [file_id]);
    let _ = conn.execute(
        "INSERT INTO doc_index (name, content, file_id) VALUES (?1, ?2, ?3)",
        params![name, text, file_id],
    );
}

#[tauri::command]
pub async fn reindex_documents(app: AppHandle, state: State<'_, Db>) -> R<i64> {
    let pdfs: Vec<(i64, String, String)> = {
        let conn = state.0.lock().unwrap();
        let mut stmt = conn
            .prepare_cached("SELECT id, name, rel_path FROM files WHERE kind='pdf'")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)?
    };
    let count = pdfs.len() as i64;
    for (id, name, rel) in pdfs {
        index_pdf(&app, &state, id, &name, &abs_path(&rel)).await;
    }
    Ok(count)
}

#[tauri::command]
pub async fn index_files(app: AppHandle, state: State<'_, Db>, ids: Vec<i64>) -> R<i64> {
    if ids.is_empty() {
        return Ok(0);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, name, rel_path FROM files WHERE kind='pdf' AND id IN ({placeholders})"
    );
    let pdfs: Vec<(i64, String, String)> = {
        let conn = state.0.lock().unwrap();
        let mut stmt = conn.prepare(&sql).map_err(e)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(ids.iter()), |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .map_err(e)?;
        rows.collect::<Result<_, _>>().map_err(e)?
    };
    let count = pdfs.len() as i64;
    for (id, name, rel) in pdfs {
        index_pdf(&app, &state, id, &name, &abs_path(&rel)).await;
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
        .prepare_cached(
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
        .prepare_cached("SELECT id, label, url, icon FROM links ORDER BY id")
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
        .prepare_cached(
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
        .prepare_cached(
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
        let (rel, current_name) = {
            let conn = state.0.lock().unwrap();
            let rel: String = conn.query_row("SELECT rel_path FROM files WHERE id=?1", [id], |r| r.get(0)).map_err(e)?;
            let name: String = conn.query_row("SELECT name FROM files WHERE id=?1", [id], |r| r.get(0)).map_err(e)?;
            (rel, name)
        };
        let abs = abs_path(&rel);
        // simple versioning for boards (same as PDFs): backup current before overwrite
        let vdir = crate::paths::documents_dir().join(".versions");
        let _ = fs::create_dir_all(&vdir);
        if abs.exists() {
            let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
            let base = current_name.rsplit_once('.').map(|(b, _)| b.to_string()).unwrap_or_else(|| current_name.clone());
            let backup_name = format!("{}_{base}__v{ts}.euboard", id);
            let backup_path = vdir.join(&backup_name);
            let _ = fs::copy(&abs, &backup_path);
            let versions_key = format!("file_versions_{}", id);
            let mut versions: Vec<serde_json::Value> = {
                let conn = state.0.lock().unwrap();
                if let Some(vstr) = get_setting_raw(&conn, &versions_key) {
                    serde_json::from_str(&vstr).unwrap_or_default()
                } else {
                    vec![]
                }
            };
            let ver_num = versions.len() + 1;
            versions.push(serde_json::json!({
                "version": ver_num,
                "timestamp": ts,
                "backup_name": backup_name
            }));
            {
                let conn = state.0.lock().unwrap();
                set_setting_raw(&conn, &versions_key, &serde_json::to_string(&versions).unwrap_or("[]".into()));
            }
        }
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

/// Updates an existing file's content in-place (e.g. to save PDF annotations back to the same document).
/// Creates a timestamped backup in .versions/ for simple history/rollback.
#[tauri::command]
pub fn update_file(state: State<Db>, file_id: i64, data_url: String) -> R<FileItem> {
    let b64 = data_url
        .split(',')
        .nth(1)
        .ok_or_else(|| "donnee invalide".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(e)?;
    let (rel, current_name) = {
        let conn = state.0.lock().unwrap();
        let rel: String = conn.query_row("SELECT rel_path FROM files WHERE id=?1", [file_id], |r| r.get(0)).map_err(e)?;
        let name: String = conn.query_row("SELECT name FROM files WHERE id=?1", [file_id], |r| r.get(0)).map_err(e)?;
        (rel, name)
    };
    let abs = abs_path(&rel);
    // simple versioning: backup current state before overwrite
    let vdir = crate::paths::documents_dir().join(".versions");
    let _ = fs::create_dir_all(&vdir);
    if abs.exists() {
        let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let base = current_name.rsplit_once('.').map(|(b, _)| b.to_string()).unwrap_or_else(|| current_name.clone());
        let backup_name = format!("{}_{base}__v{ts}.pdf", file_id);
        let backup_path = vdir.join(&backup_name);
        let _ = fs::copy(&abs, &backup_path);
        // persist versions list (not registered as docs, hidden)
        let versions_key = format!("file_versions_{}", file_id);
        let mut versions: Vec<serde_json::Value> = {
            let conn = state.0.lock().unwrap();
            if let Some(vstr) = get_setting_raw(&conn, &versions_key) {
                serde_json::from_str(&vstr).unwrap_or_default()
            } else {
                vec![]
            }
        };
        let ver_num = versions.len() + 1;
        versions.push(serde_json::json!({
            "version": ver_num,
            "timestamp": ts,
            "backup_name": backup_name
        }));
        {
            let conn = state.0.lock().unwrap();
            set_setting_raw(&conn, &versions_key, &serde_json::to_string(&versions).unwrap_or("[]".into()));
        }
    }
    // overwrite the main file
    fs::write(&abs, &bytes).map_err(e)?;
    let new_size = bytes.len() as i64;
    {
        let conn = state.0.lock().unwrap();
        conn.execute(
            "UPDATE files SET size=?1, added_at=datetime('now') WHERE id=?2",
            params![new_size, file_id]
        ).map_err(e)?;
    }
    // return refreshed file item
    let conn = state.0.lock().unwrap();
    conn.query_row(
        "SELECT id, course_id, name, rel_path, kind, size, added_at FROM files WHERE id=?1",
        [file_id],
        map_file,
    ).map_err(e)
}

#[tauri::command]
pub fn get_file_versions(state: State<Db>, file_id: i64) -> R<Vec<serde_json::Value>> {
    let conn = state.0.lock().unwrap();
    let new_key = format!("file_versions_{}", file_id);
    if let Some(vstr) = get_setting_raw(&conn, &new_key) {
        let v: Vec<serde_json::Value> = serde_json::from_str(&vstr).unwrap_or_default();
        if !v.is_empty() {
            return Ok(v);
        }
    }
    // fallback + migrate from legacy pdf_ key
    let old_key = format!("pdf_versions_{}", file_id);
    if let Some(vstr) = get_setting_raw(&conn, &old_key) {
        let v: Vec<serde_json::Value> = serde_json::from_str(&vstr).unwrap_or_default();
        if !v.is_empty() {
            // migrate for future
            set_setting_raw(&conn, &new_key, &serde_json::to_string(&v).unwrap_or("[]".into()));
            return Ok(v);
        }
    }
    Ok(vec![])
}

#[tauri::command]
pub fn read_version_data(name: String) -> R<String> {
    let vdir = crate::paths::documents_dir().join(".versions");
    let p = vdir.join(&name);
    if !p.exists() {
        return Err("version introuvable".to_string());
    }
    let bytes = fs::read(p).map_err(e)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:application/pdf;base64,{}", b64))
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

/// Ensure that the pristine original file (as it was when first added/opened for editing)
/// is snapshotted into .versions/ and recorded in the per-file versions list.
/// Called by the PDF editor on first load so the "default file" can always be reverted to,
/// even before any user annotations have been saved.
#[tauri::command]
pub fn ensure_original_version(state: State<Db>, file_id: i64) -> R<()> {
    let (rel, current_name) = {
        let conn = state.0.lock().unwrap();
        let rel: String = conn.query_row("SELECT rel_path FROM files WHERE id=?1", [file_id], |r| r.get(0)).map_err(e)?;
        let name: String = conn.query_row("SELECT name FROM files WHERE id=?1", [file_id], |r| r.get(0)).map_err(e)?;
        (rel, name)
    };
    let abs = abs_path(&rel);
    if !abs.exists() {
        return Ok(());
    }
    let versions_key = format!("file_versions_{}", file_id);
    let mut versions: Vec<serde_json::Value> = {
        let conn = state.0.lock().unwrap();
        if let Some(vstr) = get_setting_raw(&conn, &versions_key) {
            serde_json::from_str(&vstr).unwrap_or_default()
        } else {
            vec![]
        }
    };
    if !versions.is_empty() {
        return Ok(()); // already snapshotted previously (on first editor open or first save)
    }
    let vdir = crate::paths::documents_dir().join(".versions");
    let _ = fs::create_dir_all(&vdir);
    let base = current_name.rsplit_once('.').map(|(b, _)| b.to_string()).unwrap_or_else(|| current_name.clone());
    let ext = current_name.rsplit_once('.').map(|(_, e)| e.to_string()).unwrap_or_else(|| "bin".to_string());
    let backup_name = format!("{}_{base}__original.{}", file_id, ext);
    let backup_path = vdir.join(&backup_name);
    if !backup_path.exists() {
        let _ = fs::copy(&abs, &backup_path);
    }
    versions.push(serde_json::json!({
        "version": 1,
        "timestamp": "original",
        "backup_name": backup_name
    }));
    {
        let conn = state.0.lock().unwrap();
        set_setting_raw(&conn, &versions_key, &serde_json::to_string(&versions).unwrap_or("[]".into()));
    }
    Ok(())
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
                let stem = path
                    .file_stem()
                    .map(|s| s.to_string_lossy())
                    .unwrap_or_default();
                if stem == ".scratch" {
                    continue; // hide the internal temp exec helper (never shown in UI)
                }
                let name = stem.replace('_', " ");
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
pub fn rename_python_script(path: String, new_name: String) -> R<PythonDemo> {
    let dir = crate::paths::python_dir();
    let p = PathBuf::from(&path);
    if !p.starts_with(&dir) || !p.exists() {
        return Err("Chemin de script invalide ou introuvable.".into());
    }
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default();
    if stem == ".scratch" {
        return Err("Impossible de renommer un script temporaire interne.".into());
    }
    let new_stem = slugify(&new_name);
    if new_stem == stem {
        // Effectively the same name after slugify, just return current
        let code = fs::read_to_string(&p).unwrap_or_default();
        let display = stem.replace('_', " ");
        return Ok(PythonDemo {
            name: display,
            path: path.clone(),
            code,
        });
    }
    let new_file_name = format!("{}.py", new_stem);
    let dest = unique_dest(&dir, &new_file_name);
    fs::rename(&p, &dest).map_err(e)?;
    let code = fs::read_to_string(&dest).unwrap_or_default();
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
pub async fn run_python_demo(app: AppHandle, path: String) -> R<PythonResult> {
    let v = crate::sidecar::call(&app, "run_demo", &json!({ "path": path })).await?;
    Ok(PythonResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v.get("stdout").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        stderr: v.get("stderr").and_then(|x| x.as_str()).unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub async fn run_python_code(app: AppHandle, code: String) -> R<PythonResult> {
    // Write to a temp file inside the python dir and run it, so unsaved edits
    // can be executed immediately. We clean up the scratch file afterwards so it
    // never appears in the scripts list (we filter dotfiles anyway) and keeps
    // the python/ folder tidy.
    let dir = crate::paths::python_dir();
    let _ = fs::create_dir_all(&dir);
    let tmp = dir.join(".scratch.py");
    fs::write(&tmp, code).map_err(e)?;
    let v = crate::sidecar::call(
        &app,
        "run_demo",
        &json!({ "path": tmp.to_string_lossy().to_string() }),
    )
    .await?;
    let _ = fs::remove_file(&tmp);
    Ok(PythonResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v.get("stdout").and_then(|x| x.as_str()).unwrap_or("").to_string(),
        stderr: v.get("stderr").and_then(|x| x.as_str()).unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub async fn python_complete(
    app: AppHandle,
    code: String,
    line: u32,
    column: u32,
    filename: Option<String>,
) -> R<Vec<PythonCompletion>> {
    let payload = json!({
        "code": code,
        "line": line,
        "column": column,
        "path": filename.unwrap_or_else(|| "<script>.py".to_string()),
    });
    let v = crate::sidecar::call(&app, "python_complete", &payload).await?;
    let mut out: Vec<PythonCompletion> = vec![];
    if let Some(arr) = v.get("completions").and_then(|c| c.as_array()) {
        for c in arr {
            out.push(PythonCompletion {
                name: c.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                complete: c.get("complete").and_then(|x| x.as_str()).map(|s| s.to_string()),
                type_: c.get("type").and_then(|x| x.as_str()).map(|s| s.to_string()),
                signature: c.get("signature").and_then(|x| x.as_str()).map(|s| s.to_string()),
                doc: c.get("doc").and_then(|x| x.as_str()).map(|s| s.to_string()),
            });
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Data folder / portable storage root selection
// (chosen folder becomes the root that directly contains euclide.db + courses/ + documents/ + ...)
// The pointer (euclide-data.json) lives next to the executable for USB portability.
// Changing requires restart because DB + caches are opened at launch against the root.
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn choose_data_dir(app: AppHandle) -> R<Option<String>> {
    // Non-blocking folder picker (same pattern as import_files / import_python_script)
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let picked = rx.recv().ok().flatten();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let Ok(p) = picked.into_path() else {
        return Ok(None);
    };
    let path_str = p.to_string_lossy().to_string();

    // Always write the config next to the *executable* (never inside the data root itself).
    let cfg_path = crate::paths::data_root_config_path();
    let cfg = json!({ "dataDir": path_str });
    if let Ok(s) = serde_json::to_string_pretty(&cfg) {
        let _ = fs::write(&cfg_path, s);
    }
    Ok(Some(path_str))
}

#[tauri::command]
pub fn reset_data_dir() -> R<()> {
    let _ = fs::remove_file(crate::paths::data_root_config_path());
    Ok(())
}

// ---------------------------------------------------------------------------
// Keep awake
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn set_keep_awake(ka: State<KeepAwake>, db: State<Db>, on: bool) -> bool {
    crate::keepawake::set(&ka, on);
    let conn = db.0.lock().unwrap();
    set_setting_raw(&conn, "keep_awake", if on { "1" } else { "0" });
    on
}

#[tauri::command]
pub fn keep_awake_status(ka: State<KeepAwake>) -> bool {
    crate::keepawake::is_on(&ka)
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

pub(crate) fn get_setting_raw(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0))
        .optional()
        .ok()
        .flatten()
}

pub(crate) fn set_setting_raw(conn: &rusqlite::Connection, key: &str, value: &str) {
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

fn recap_day_sql(column: &str, period: &str) -> String {
    match period {
        "week" => format!(
            "date({column}, 'localtime') >= date('now', 'localtime', '-6 days')"
        ),
        _ => format!("date({column}, 'localtime') = date('now', 'localtime')"),
    }
}

fn recap_from_conn(conn: &rusqlite::Connection, period: &str) -> RecapData {
    let day_events = recap_day_sql("created_at", period);
    let day_events_u = recap_day_sql("u.created_at", period);
    let day_notes = recap_day_sql("updated_at", period);

    let files_opened: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM usage_events WHERE kind IN ('file_open', 'file_import') AND {day_events}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Count notes actually edited today (autosave would inflate usage_events).
    let notes_written: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM notes WHERE {day_notes}"),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let demos_run: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM usage_events WHERE kind = 'demo_run' AND {day_events}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let reminders_done: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM usage_events WHERE kind = 'reminder_done' AND {day_events}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let active_minutes: i64 = conn
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM usage_events WHERE kind = 'active_tick' AND {day_events}"
            ),
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut top_courses: Vec<TopCourse> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT c.name, c.emoji, COUNT(*) as cnt FROM usage_events u \
         JOIN courses c ON u.course_id = c.id WHERE {day_events_u} GROUP BY c.id ORDER BY cnt DESC LIMIT 5"
    )) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok(TopCourse {
                name: r.get(0)?,
                emoji: r.get(1)?,
                count: r.get(2)?,
            })
        }) {
            for r in rows {
                if let Ok(tc) = r {
                    top_courses.push(tc);
                }
            }
        }
    }

    let mut top_documents: Vec<TopItem> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT label, COUNT(*) as cnt FROM usage_events WHERE kind IN ('file_open','file_import') AND {day_events} \
         GROUP BY label ORDER BY cnt DESC LIMIT 5"
    )) {
        if let Ok(rows) = stmt.query_map([], |r| Ok(TopItem { name: r.get(0)?, count: r.get(1)? })) {
            for r in rows {
                if let Ok(ti) = r {
                    top_documents.push(ti);
                }
            }
        }
    }

    let mut top_tools: Vec<TopItem> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT label, COUNT(*) as cnt FROM usage_events WHERE kind IN ('demo_run','whiteboard_save') AND {day_events} \
         GROUP BY label ORDER BY cnt DESC"
    )) {
        if let Ok(rows) = stmt.query_map([], |r| Ok(TopItem { name: r.get(0)?, count: r.get(1)? })) {
            for r in rows {
                if let Ok(ti) = r {
                    top_tools.push(ti);
                }
            }
        }
    }

    let mut time_by_area: Vec<TopItem> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(&format!(
        "SELECT label, COUNT(*) as cnt FROM usage_events WHERE kind = 'active_tick' AND {day_events} \
         GROUP BY label ORDER BY cnt DESC"
    )) {
        if let Ok(rows) = stmt.query_map([], |r| Ok(TopItem { name: r.get(0)?, count: r.get(1)? })) {
            for r in rows {
                if let Ok(ti) = r {
                    time_by_area.push(ti);
                }
            }
        }
    }

    RecapData {
        period_label: Some(period.to_string()),
        files_opened,
        notes_written,
        demos_run,
        reminders_done,
        active_minutes,
        top_courses,
        top_documents,
        top_tools,
        time_by_area,
    }
}

#[tauri::command]
pub fn get_recap(state: State<Db>, period: String) -> R<RecapData> {
    let conn = state.0.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM usage_events WHERE created_at < datetime('now', '-30 days')",
        [],
    );
    Ok(recap_from_conn(&conn, &period))
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
pub async fn pronote_qr_login(app: AppHandle, state: State<'_, Db>, qr_json: String, pin: String) -> R<PronoteStatus> {
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

    let res = crate::sidecar::call(
        &app,
        "pronote_login",
        &json!({ "qr": qr_value, "pin": pin, "uuid": uuid }),
    )
    .await?;

    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("Connexion QR impossible");
        return Err(err.to_string());
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
pub async fn pronote_password_login(
    app: AppHandle,
    state: State<'_, Db>,
    url: String,
    username: String,
    password: String,
    pin: Option<String>,
) -> R<PronoteStatus> {
    // Generate or retrieve a stable device name for PIN-based device registration
    let device_name = {
        let conn = state.0.lock().unwrap();
        match get_setting_raw(&conn, "pronote_device_name") {
            Some(d) => d,
            None => {
                let d = format!("Euclide-{}", &uuid::Uuid::new_v4().to_string()[..8]);
                set_setting_raw(&conn, "pronote_device_name", &d);
                d
            }
        }
    };
    // Load previously saved client_identifier (skips PIN on repeat logins)
    let client_id = {
        let conn = state.0.lock().unwrap();
        get_setting_raw(&conn, "pronote_client_identifier")
    };

    let mut payload = json!({
        "url": url,
        "username": username,
        "password": password,
        "device_name": device_name,
    });
    if let Some(p) = &pin {
        payload["pin"] = serde_json::Value::String(p.clone());
    }
    if let Some(cid) = &client_id {
        payload["client_identifier"] = serde_json::Value::String(cid.clone());
    }

    let res = crate::sidecar::call(&app, "pronote_password_login", &payload).await?;

    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("Connexion echouee");
        // Surface needs_pin flag in the error message so the frontend can detect it
        if res.get("needs_pin").and_then(|x| x.as_bool()) == Some(true) {
            return Err(format!("NEEDS_PIN:{}", err));
        }
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
        // Persist client_identifier for future logins (skips PIN next time)
        if let Some(cid) = res.get("client_identifier").and_then(|x| x.as_str()) {
            if !cid.is_empty() {
                set_setting_raw(&conn, "pronote_client_identifier", cid);
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
pub async fn pronote_sync(app: AppHandle, state: State<'_, Db>) -> R<i64> {
    let creds = {
        let conn = state.0.lock().unwrap();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "device_name": get_setting_raw(&conn, "pronote_device_name"),
            "client_identifier": get_setting_raw(&conn, "pronote_client_identifier"),
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::call(&app, "pronote_sync", &creds).await?;
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
    // Persist client_identifier if returned (PIN device registration)
    if let Some(cid) = res.get("client_identifier").and_then(|x| x.as_str()) {
        if !cid.is_empty() {
            set_setting_raw(&conn, "pronote_client_identifier", cid);
        }
    }

    let tx = conn.unchecked_transaction().map_err(e)?;
    tx.execute("DELETE FROM schedule WHERE source='pronote'", []).map_err(e)?;
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
            tx.execute(
                "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, source) VALUES (?1,?2,?3,?4,?5,'pronote')",
                params![day, start, end, subject, room],
            ).map_err(e)?;
            count += 1;
        }
    }
    set_setting_raw(
        &tx,
        "pronote_last_sync",
        &chrono::Local::now().format("%d/%m %H:%M").to_string(),
    );
    tx.commit().map_err(e)?;
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
        "pronote_client_identifier",
        "pronote_device_name",
    ] {
        let _ = conn.execute("DELETE FROM settings WHERE key=?1", [key]);
    }
    conn.execute("DELETE FROM schedule WHERE source='pronote'", []).map_err(e)?;
    Ok(())
}

/// Fetches "le contenu des cours" (lesson contents from cahier de textes) via the sidecar.
/// See the Python sidecar (pronote_contents + _lesson_contents) for full details.
/// - subject: optional subject filter (partial match)
/// - class_name: optional class / group name (will try to scope the query on multi-class accounts)
/// - from_date: optional start date (YYYY-MM-DD or DD/MM/YYYY) for the "depuis" filter
/// Always returns fresh credentials (for token rotation) + a `matieres` summary for sidebars.
#[tauri::command]
pub async fn pronote_contents(
    app: AppHandle,
    state: State<'_, Db>,
    subject: Option<String>,
    class_name: Option<String>,
    from_date: Option<String>,
) -> R<serde_json::Value> {
    let creds = {
        let conn = state.0.lock().unwrap();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "device_name": get_setting_raw(&conn, "pronote_device_name"),
            "client_identifier": get_setting_raw(&conn, "pronote_client_identifier"),
            "subject": subject,
            "class": class_name,
            "from_date": from_date,
            // also accept the camelCase key that the TS side may send for deserialization
            "fromDate": from_date,
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::call(&app, "pronote_contents", &creds).await?;
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
    // Persist client_identifier if returned (PIN device registration)
    if let Some(cid) = res.get("client_identifier").and_then(|x| x.as_str()) {
        if !cid.is_empty() {
            set_setting_raw(&conn, "pronote_client_identifier", cid);
        }
    }

    Ok(res)
}

/// Returns the list of classes/groups available for the connected prof account
/// (from Pronote listeClasses). Used to populate class dropdowns instead of free text.
#[tauri::command]
pub async fn pronote_classes(app: AppHandle, state: State<'_, Db>) -> R<serde_json::Value> {
    let creds = {
        let conn = state.0.lock().unwrap();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "device_name": get_setting_raw(&conn, "pronote_device_name"),
            "client_identifier": get_setting_raw(&conn, "pronote_client_identifier"),
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::call(&app, "pronote_classes", &creds).await?;
    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("recuperation des classes echouee");
        return Err(err.to_string());
    }

    // Persist rotated token
    let conn = state.0.lock().unwrap();
    for key in ["username", "password"] {
        if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
            set_setting_raw(&conn, &format!("pronote_{key}"), v);
        }
    }
    // Persist client_identifier if returned (PIN device registration)
    if let Some(cid) = res.get("client_identifier").and_then(|x| x.as_str()) {
        if !cid.is_empty() {
            set_setting_raw(&conn, "pronote_client_identifier", cid);
        }
    }

    Ok(res)
}

// ---------------------------------------------------------------------------

fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

#[cfg(test)]
mod recap_tests {
    use super::recap_from_conn;
    use rusqlite::Connection;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn
    }

    #[test]
    fn recap_today_ignores_old_events_and_counts_notes() {
        let conn = mem();
        conn.execute(
            "INSERT INTO usage_events (kind, label, course_id, created_at) VALUES ('file_open', 'old.pdf', NULL, '2020-01-01 12:00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO usage_events (kind, label, created_at) VALUES ('file_open', 'today.pdf', datetime('now'))",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO usage_events (kind, label, created_at) VALUES ('active_tick', 'python', datetime('now'))",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO usage_events (kind, label, created_at) VALUES ('active_tick', 'dashboard', '2020-01-01 12:00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (title, body, updated_at) VALUES ('n1', 'x', datetime('now'))",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (title, body, updated_at) VALUES ('n2', 'y', '2020-01-01 12:00:00')",
            [],
        )
        .unwrap();

        let today = recap_from_conn(&conn, "today");
        assert_eq!(today.files_opened, 1);
        assert_eq!(today.notes_written, 1);
        assert_eq!(today.active_minutes, 1);
        assert_eq!(today.time_by_area.len(), 1);
        assert_eq!(today.time_by_area[0].name, "python");
        assert_eq!(today.top_documents.len(), 1);
        assert_eq!(today.top_documents[0].name, "today.pdf");
    }
}
