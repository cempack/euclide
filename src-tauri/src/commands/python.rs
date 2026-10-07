//! Python scripts of the teacher (python/ folder): list, edit, run through
//! completions through the sidecar's tools lane. Running them is runner.rs.

use crate::error::{AppError, AppResult};
use crate::fsx::unique_dest;
use crate::models::{PythonCompletion, PythonDemo};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::Db;

#[tauri::command(async)]
pub fn list_python_demos() -> AppResult<Vec<PythonDemo>> {
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

/// The webview only sends back script paths it got from `list_python_demos`.
/// Anything that is not a `.py` file directly inside `python/` is refused:
/// `Path::starts_with` compares components without resolving `..`, so the
/// parent folder is canonicalised and compared instead.
fn script_in_python_dir(path: &str) -> AppResult<PathBuf> {
    let dir = crate::paths::python_dir();
    let p = PathBuf::from(path);
    let invalid = || AppError::user("Chemin de script invalide.");
    let file_name = p.file_name().ok_or_else(invalid)?.to_owned();
    if p.extension().map(|x| x != "py").unwrap_or(true) {
        return Err(invalid());
    }
    let parent = p.parent().ok_or_else(invalid)?;
    match (fs::canonicalize(parent), fs::canonicalize(&dir)) {
        (Ok(a), Ok(b)) if a == b => Ok(dir.join(file_name)),
        _ => Err(invalid()),
    }
}

fn slugify(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let s = s.trim_matches('_').to_string();
    if s.is_empty() {
        "script".into()
    } else {
        s
    }
}

#[tauri::command(async)]
pub fn create_python_script(name: String, code: String) -> AppResult<PythonDemo> {
    let dir = crate::paths::python_dir();
    let _ = fs::create_dir_all(&dir);
    let dest = unique_dest(&dir, &format!("{}.py", slugify(&name)));
    fs::write(&dest, &code)?;
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

#[tauri::command(async)]
pub fn save_python_script(path: String, code: String) -> AppResult<()> {
    let p = script_in_python_dir(&path)?;
    fs::write(&p, code)?;
    Ok(())
}

fn file_name_of(p: &std::path::Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Deletes a script; lesson steps that opened it forget it.
#[tauri::command]
pub async fn delete_python_script(db: State<'_, Db>, path: String) -> AppResult<()> {
    let p = script_in_python_dir(&path)?;
    fs::remove_file(&p)?;
    let name = file_name_of(&p);
    db.write(move |conn| crate::commands::sequences::script_renamed(conn, &name, None))
        .await
}

/// Renames a script; lesson steps that open it follow.
#[tauri::command]
pub async fn rename_python_script(
    db: State<'_, Db>,
    path: String,
    new_name: String,
) -> AppResult<PythonDemo> {
    let renamed = rename_script(&path, &new_name)?;
    let from = file_name_of(&script_in_python_dir(&path).unwrap_or_default());
    let to = file_name_of(std::path::Path::new(&renamed.path));
    if from != to {
        db.write(move |conn| crate::commands::sequences::script_renamed(conn, &from, Some(&to)))
            .await?;
    }
    Ok(renamed)
}

fn rename_script(path: &str, new_name: &str) -> AppResult<PythonDemo> {
    let dir = crate::paths::python_dir();
    let p = script_in_python_dir(path)?;
    if !p.exists() {
        return Err("Script introuvable.".into());
    }
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default();
    if stem == ".scratch" {
        return Err("Impossible de renommer un script temporaire interne.".into());
    }
    let new_stem = slugify(new_name);
    if new_stem == stem {
        // Effectively the same name after slugify, just return current
        let code = fs::read_to_string(&p).unwrap_or_default();
        let display = stem.replace('_', " ");
        return Ok(PythonDemo {
            name: display,
            path: path.to_string(),
            code,
        });
    }
    let new_file_name = format!("{}.py", new_stem);
    let dest = unique_dest(&dir, &new_file_name);
    fs::rename(&p, &dest)?;
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
pub async fn import_python_script(app: AppHandle) -> AppResult<Option<PythonDemo>> {
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
    fs::copy(&src, &dest)?;
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
pub async fn python_complete(
    app: AppHandle,
    code: String,
    line: u32,
    column: u32,
    filename: Option<String>,
) -> AppResult<Vec<PythonCompletion>> {
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
                name: c
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                complete: c
                    .get("complete")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                type_: c
                    .get("type")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                signature: c
                    .get("signature")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                doc: c.get("doc").and_then(|x| x.as_str()).map(|s| s.to_string()),
            });
        }
    }
    Ok(out)
}
