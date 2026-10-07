//! Python scripts of the teacher (python/ folder): list, edit, run through
//! the sidecar, completions. M5 replaces the runner with a separate process.

use crate::error::{AppError, AppResult};
use crate::fsx::unique_dest;
use crate::models::{PythonCompletion, PythonDemo, PythonResult};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

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

#[tauri::command(async)]
pub fn delete_python_script(path: String) -> AppResult<()> {
    let p = script_in_python_dir(&path)?;
    fs::remove_file(&p)?;
    Ok(())
}

#[tauri::command(async)]
pub fn rename_python_script(path: String, new_name: String) -> AppResult<PythonDemo> {
    let dir = crate::paths::python_dir();
    let p = script_in_python_dir(&path)?;
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
pub async fn run_python_demo(app: AppHandle, path: String) -> AppResult<PythonResult> {
    let path = script_in_python_dir(&path)?;
    let v = crate::sidecar::call(
        &app,
        "run_demo",
        &json!({ "path": path.to_string_lossy().to_string() }),
    )
    .await?;
    Ok(PythonResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v
            .get("stdout")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        stderr: v
            .get("stderr")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

#[tauri::command]
pub async fn run_python_code(app: AppHandle, code: String) -> AppResult<PythonResult> {
    // Write to a temp file inside the python dir and run it, so unsaved edits
    // can be executed immediately. We clean up the scratch file afterwards so it
    // never appears in the scripts list (we filter dotfiles anyway) and keeps
    // the python/ folder tidy.
    let dir = crate::paths::python_dir();
    let _ = fs::create_dir_all(&dir);
    let tmp = dir.join(".scratch.py");
    fs::write(&tmp, code)?;
    let v = crate::sidecar::call(
        &app,
        "run_demo",
        &json!({ "path": tmp.to_string_lossy().to_string() }),
    )
    .await?;
    let _ = fs::remove_file(&tmp);
    Ok(PythonResult {
        ok: v.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        stdout: v
            .get("stdout")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        stderr: v
            .get("stderr")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    })
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
