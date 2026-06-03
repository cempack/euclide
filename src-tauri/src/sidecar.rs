use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Calls the Python sidecar with a command name and a JSON payload, returning
/// the parsed JSON response. Prefers a bundled PyInstaller binary; in dev it
/// falls back to running the sidecar script with system Python.
pub fn run(
    app: &AppHandle,
    command: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let (program, mut args) = resolve(app)?;
    args.push(command.to_string());
    args.push(payload.to_string());

    let mut cmd = Command::new(&program);
    cmd.args(&args);

    // On Windows, prevent the child (even if console subsystem or python.exe) from
    // popping a visible cmd window when the main Tauri app (GUI subsystem) spawns it.
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Sidecar Python introuvable ({program}) : {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("");

    if line.is_empty() {
        return Err(format!(
            "Le sidecar n'a rien renvoye. {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    serde_json::from_str(line).map_err(|e| format!("Reponse sidecar invalide : {e} :: {line}"))
}

/// Async version of `run` that offloads the blocking `Command::output()` (subprocess +
/// network for Pronote, PDF parsing, etc.) to a background thread from the async runtime's
/// blocking pool. This ensures long Pronote loads (or other sidecar work) never freeze
/// the main UI thread or starve Tauri's command dispatch.
pub async fn run_async(
    app: &AppHandle,
    command: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let app = app.clone();
    let command = command.to_owned();
    let payload = payload.clone();
    tauri::async_runtime::spawn_blocking(move || run(&app, &command, &payload))
        .await
        .map_err(|join_err| format!("Erreur d'exécution sidecar (spawn_blocking): {join_err}"))?
}

/// Returns (program, leading_args). For a frozen binary (onefile or onedir) leading_args is empty;
/// for the dev fallback it is `[script_path]` run through a Python interpreter.
fn resolve(app: &AppHandle) -> Result<(String, Vec<String>), String> {
    // 1. Bundled PyInstaller binary (flat or onedir/) next to the exe or in the resource dir.
    if let Some(bin) = frozen_binary(app) {
        return Ok((bin.to_string_lossy().to_string(), vec![]));
    }

    // 2. Dev fallback: a Python interpreter + the sidecar script.
    let script = sidecar_script(app).ok_or_else(|| {
        "Script du sidecar (euclide_sidecar.py) introuvable.".to_string()
    })?;
    let python = dev_python(&script);
    Ok((python, vec![script.to_string_lossy().to_string()]))
}

/// Picks the dev Python interpreter, preferring (1) the EUCLIDE_PYTHON override,
/// then (2) a `sidecar/.venv` next to the project (where pronotepy/pypdf are
/// installed), and finally (3) the system Python.
fn dev_python(script: &PathBuf) -> String {
    if let Ok(p) = std::env::var("EUCLIDE_PYTHON") {
        if !p.trim().is_empty() {
            return p;
        }
    }

    let venv_rel = if cfg!(windows) {
        ".venv/Scripts/python.exe"
    } else {
        ".venv/bin/python"
    };
    // Walk up from the script towards the repo root looking for sidecar/.venv.
    let mut dir = script.parent().map(|p| p.to_path_buf());
    for _ in 0..8 {
        if let Some(d) = &dir {
            for cand in [d.join("sidecar").join(venv_rel), d.join(venv_rel)] {
                if cand.exists() {
                    return cand.to_string_lossy().to_string();
                }
            }
            dir = d.parent().map(|p| p.to_path_buf());
        }
    }

    if cfg!(windows) { "python".to_string() } else { "python3".to_string() }
}

fn frozen_binary(app: &AppHandle) -> Option<PathBuf> {
    let name = if cfg!(windows) { "euclide-sidecar.exe" } else { "euclide-sidecar" };
    let onedir = "euclide-sidecar"; // layout from `pyinstaller --onedir --name euclide-sidecar`
    let mut candidates: Vec<PathBuf> = vec![];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // onedir layout first (recommended: fast startup, no repeated extraction)
            candidates.push(dir.join(onedir).join(name));
            // legacy flat file (next to main exe)
            candidates.push(dir.join(name));
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        // onedir inside the bundle resources first
        candidates.push(res.join(onedir).join(name));
        candidates.push(res.join("resources").join(onedir).join(name));
        // flat in resources root or resources/resources/
        candidates.push(res.join(name));
        candidates.push(res.join("resources").join(name));
    }
    candidates.into_iter().find(|p| p.exists())
}

fn sidecar_script(app: &AppHandle) -> Option<PathBuf> {
    // Bundled as a resource in production-without-frozen-binary.
    if let Ok(res) = app.path().resource_dir() {
        for p in [
            res.join("resources").join("euclide_sidecar.py"),
            res.join("euclide_sidecar.py"),
        ] {
            if p.exists() {
                return Some(p);
            }
        }
    }
    // Search upward from the executable for the dev source.
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..7 {
            if let Some(d) = &dir {
                for rel in [
                    "resources/euclide_sidecar.py",
                    "src-tauri/resources/euclide_sidecar.py",
                    "sidecar/euclide_sidecar.py",
                ] {
                    let cand = d.join(rel);
                    if cand.exists() {
                        return Some(cand);
                    }
                }
                dir = d.parent().map(|p| p.to_path_buf());
            }
        }
    }
    None
}
