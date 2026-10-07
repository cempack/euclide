use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command as TokioCommand};
use tokio::sync::Mutex;

/// The Python sidecar: one process, started on first use and kept warm.
/// Commands go over stdin/stdout as JSON lines, so Pronote, scripts and Jedi
/// pay the Python startup (PyInstaller unpacking, imports) only once.
pub struct Sidecar {
    /// The pipes, held for a whole request/response exchange.
    pipes: Mutex<Option<Pipes>>,
    /// The process, behind a lock no request ever holds: quitting or
    /// updating can kill it even while a call waits on a stuck script.
    process: std::sync::Mutex<Option<Child>>,
    /// Set when Euclide quits or updates: no restart after that.
    closed: AtomicBool,
    handle: AppHandle,
}

struct Pipes {
    stdin: tokio::process::ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
}

impl Sidecar {
    pub fn new(handle: AppHandle) -> Self {
        Self {
            pipes: Mutex::new(None),
            process: std::sync::Mutex::new(None),
            closed: AtomicBool::new(false),
            handle,
        }
    }

    /// Start the process unless it is running.
    pub async fn start(&self) -> Result<(), String> {
        let mut guard = self.pipes.lock().await;
        if guard.is_some() {
            return Ok(());
        }
        if self.closed.load(Ordering::SeqCst) {
            return Err("Euclide se ferme : Python n'est plus disponible.".into());
        }

        let (program, leading_args) = resolve(&self.handle)?;

        let mut tcmd = TokioCommand::new(&program);
        tcmd.args(&leading_args);
        tcmd.stdin(std::process::Stdio::piped());
        tcmd.stdout(std::process::Stdio::piped());
        tcmd.stderr(std::process::Stdio::piped());
        // A replaced or dropped handle takes its process with it.
        tcmd.kill_on_drop(true);

        // Still apply no-window on Windows (defense in depth, works for both frozen and dev python).
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            tcmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = tcmd
            .spawn()
            .map_err(|e| format!("Impossible de démarrer le sidecar Python ({program}): {e}"))?;

        // Drain stderr in background so a chatty sidecar doesn't block on full pipe.
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let mut r = BufReader::new(stderr);
                let mut l = String::new();
                loop {
                    l.clear();
                    match r.read_line(&mut l).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            let t = l.trim();
                            if !t.is_empty() {
                                eprintln!("[sidecar] {}", t);
                            }
                        }
                    }
                }
            });
        }

        let stdin = child.stdin.take().ok_or("sidecar stdin introuvable")?;
        let stdout = child.stdout.take().ok_or("sidecar stdout introuvable")?;
        *lock_process(&self.process) = Some(child);
        *guard = Some(Pipes {
            stdin,
            stdout: BufReader::new(stdout),
        });

        Ok(())
    }

    /// Send a command to the warm sidecar and get the JSON response.
    /// Automatically restarts the sidecar on comms error (robust for long sessions / low-end).
    pub async fn call(&self, command: &str, payload: &Value) -> Result<Value, String> {
        for attempt in 0..2u32 {
            // Ensure we have a live process
            {
                let g = self.pipes.lock().await;
                if g.is_none() {
                    drop(g);
                    self.start().await?;
                }
            }

            let mut guard = self.pipes.lock().await;
            let inner = match guard.as_mut() {
                Some(i) => i,
                None => continue,
            };

            // Protocol: one JSON line request, one JSON line response (with \n)
            let msg = serde_json::json!({ "command": command, "payload": payload });
            let line = serde_json::to_string(&msg).map_err(|e| e.to_string())? + "\n";

            if inner.stdin.write_all(line.as_bytes()).await.is_err()
                || inner.stdin.flush().await.is_err()
            {
                *guard = None;
                if attempt == 0 {
                    continue;
                }
                return Err("sidecar write failed".into());
            }

            let mut resp_line = String::new();
            if inner.stdout.read_line(&mut resp_line).await.is_err() {
                *guard = None;
                if attempt == 0 {
                    continue;
                }
                return Err("sidecar read failed".into());
            }

            let trimmed = resp_line.trim();
            if trimmed.is_empty() {
                *guard = None;
                if attempt == 0 {
                    continue;
                }
                return Err("sidecar empty response".into());
            }

            let val: Value = match serde_json::from_str(trimmed) {
                Ok(v) => v,
                Err(e) => return Err(format!("réponse sidecar invalide: {} :: {}", e, trimmed)),
            };

            if let Some(false) = val.get("ok").and_then(|b| b.as_bool()) {
                if let Some(err) = error_from_sidecar(&val) {
                    return Err(err);
                }
            }
            return Ok(val);
        }
        Err("sidecar indisponible après plusieurs tentatives".into())
    }

    /// Kill the process for good (Euclide quits or updates) and wait up to
    /// `wait` for it to exit, so its files are released. Synchronous: it
    /// never waits on a running call. A call in flight fails, and no later
    /// call restarts Python.
    pub fn shutdown(&self, wait: Duration) {
        self.closed.store(true, Ordering::SeqCst);
        let Some(mut child) = lock_process(&self.process).take() else {
            return;
        };
        let _ = child.start_kill();
        let deadline = Instant::now() + wait;
        while Instant::now() < deadline {
            if !matches!(child.try_wait(), Ok(None)) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

fn lock_process(m: &std::sync::Mutex<Option<Child>>) -> std::sync::MutexGuard<'_, Option<Child>> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Public helper so call sites stay almost identical:
///   crate::sidecar::call(&app, "pronote_sync", &creds).await?
pub async fn call(app: &AppHandle, command: &str, payload: &Value) -> Result<Value, String> {
    let state: tauri::State<Sidecar> = app.state();
    state.call(command, payload).await
}

/// Returns (program, leading_args) used to *spawn the base process* (no command/payload args anymore).
/// The persistent sidecar uses a JSON-line protocol over stdin/stdout instead.
fn resolve(app: &AppHandle) -> Result<(String, Vec<String>), String> {
    // 1. Bundled PyInstaller binary (flat or onedir/) next to the exe or in the
    //    resource dir. Debug builds run the script instead, so edits to it apply.
    if !cfg!(debug_assertions) {
        if let Some(bin) = frozen_binary(app) {
            return Ok((bin.to_string_lossy().to_string(), vec![]));
        }
    }

    // 2. Dev fallback: a Python interpreter + the sidecar script.
    let script = sidecar_script(app)
        .ok_or_else(|| "Script du sidecar (euclide_sidecar.py) introuvable.".to_string())?;
    let python = dev_python(&script);
    Ok((python, vec![script.to_string_lossy().to_string()]))
}

/// Picks the dev Python interpreter, preferring (1) the EUCLIDE_PYTHON override,
/// then (2) a `sidecar/.venv` next to the project (where pronotepy/pypdf are
/// installed), and finally (3) the system Python.
fn dev_python(script: &Path) -> String {
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

    if cfg!(windows) {
        "python".to_string()
    } else {
        "python3".to_string()
    }
}

fn frozen_binary(app: &AppHandle) -> Option<PathBuf> {
    let name = if cfg!(windows) {
        "euclide-sidecar.exe"
    } else {
        "euclide-sidecar"
    };
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
    // is_file: the onedir folder itself (or the empty placeholder in a source
    // checkout) has the same name as the binary.
    candidates.into_iter().find(|p| p.is_file())
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

/// Sidecar `{ok:false, error}` payloads are JSON strings. `Value::to_string()`
/// would wrap them in extra quotes and that quoted dump was what the toast showed.
pub(crate) fn error_from_sidecar(val: &Value) -> Option<String> {
    val.get("error").map(|err| {
        err.as_str()
            .map(str::to_string)
            .unwrap_or_else(|| err.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::error_from_sidecar;
    use serde_json::json;

    #[test]
    fn error_from_sidecar_does_not_quote_strings() {
        let v = json!({
            "ok": false,
            "error": "Connexion refusee : ('Decryption failed while trying to un pad.', 'probably bad username/password')"
        });
        let msg = error_from_sidecar(&v).unwrap();
        assert!(!msg.starts_with('"'), "got {msg:?}");
        assert!(msg.starts_with("Connexion refusee"));
    }
}
