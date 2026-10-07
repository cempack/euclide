//! The Python side of Euclide (sidecar/euclide_sidecar/).
//!
//! Three warm processes, one per lane, so a slow Pronote request never
//! holds up the editor's completions or the search indexer:
//!   - `pronote`: logins, sync, lesson contents (network, slow);
//!   - `tools`: the editor's completions (Jedi);
//!   - `index`: text of PDFs for search.
//!
//! Each lane starts on first use, checks that the sidecar speaks this
//! version's protocol, answers one request at a time within a time limit
//! (past it, the process is killed and the next call starts a new one), and
//! stops after a while unused. Student scripts never run here: see runner.rs.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command as TokioCommand};
use tokio::sync::Mutex;

/// sidecar/euclide_sidecar/protocol.py's PROTOCOL.
pub const PROTOCOL: u64 = 2;

/// A frozen sidecar from slow USB, scanned by an antivirus on first launch,
/// can take a while to answer its first message.
const HANDSHAKE: Duration = Duration::from_secs(40);

const OUTDATED: &str =
    "Le module Python d'Euclide ne correspond pas à cette version. Fermez Euclide et rouvrez-le ; \
     si le message revient, réinstallez Euclide.";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lane {
    Pronote,
    Tools,
    Index,
}

impl Lane {
    const ALL: [Lane; 3] = [Lane::Pronote, Lane::Tools, Lane::Index];

    fn name(self) -> &'static str {
        match self {
            Lane::Pronote => "pronote",
            Lane::Tools => "tools",
            Lane::Index => "index",
        }
    }

    fn of(command: &str) -> Lane {
        match command {
            "python_complete" => Lane::Tools,
            "extract_pdf" => Lane::Index,
            _ => Lane::Pronote,
        }
    }

    /// Longest a request may take before the process is presumed stuck.
    fn timeout(self) -> Duration {
        match self {
            Lane::Pronote => Duration::from_secs(120),
            Lane::Tools => Duration::from_secs(10),
            Lane::Index => Duration::from_secs(60),
        }
    }

    /// Unused this long, the process stops (and frees its memory).
    fn idle(self) -> Duration {
        match self {
            Lane::Pronote => Duration::from_secs(15 * 60),
            Lane::Tools => Duration::from_secs(10 * 60),
            Lane::Index => Duration::from_secs(2 * 60),
        }
    }

    fn index(self) -> usize {
        self as usize
    }
}

struct Pipes {
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

#[derive(Default)]
struct Slot {
    /// Held for a whole request/response exchange.
    pipes: Mutex<Option<Pipes>>,
    /// Behind a lock no request holds: shutdown and timeouts kill it at once.
    process: std::sync::Mutex<Option<Child>>,
    last_used: std::sync::Mutex<Option<Instant>>,
}

impl Slot {
    fn kill(&self) {
        if let Some(mut child) = lock(&self.process).take() {
            let _ = child.start_kill();
        }
    }
}

pub struct Sidecar {
    lanes: [Slot; 3],
    /// Set when Euclide quits or updates: no restart after that.
    closed: AtomicBool,
    handle: AppHandle,
}

impl Sidecar {
    pub fn new(handle: AppHandle) -> Self {
        Self {
            lanes: Default::default(),
            closed: AtomicBool::new(false),
            handle,
        }
    }

    async fn start(&self, lane: Lane) -> Result<(Pipes, Child), String> {
        let launch = launch(&self.handle, &["--lane", lane.name()])?;
        let mut child = launch.spawn()?;
        if let Some(stderr) = child.stderr.take() {
            drain_stderr(stderr, lane.name());
        }
        let stdin = child.stdin.take().ok_or("sidecar stdin introuvable")?;
        let stdout = child.stdout.take().ok_or("sidecar stdout introuvable")?;
        let mut pipes = Pipes {
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 0,
        };
        // "command" too: a sidecar older than protocol 2 answers it with
        // « Commande inconnue », which tells us at once.
        let hello = json!({ "id": 0, "cmd": "hello", "command": "hello", "payload": {} });
        let reply = tokio::time::timeout(HANDSHAKE, exchange(&mut pipes, &hello))
            .await
            .map_err(|_| "Python ne démarre pas (pas de réponse).".to_string())
            .and_then(|r| r);
        let reply = match reply {
            Ok(v) => v,
            Err(e) => {
                let _ = child.start_kill();
                return Err(e);
            }
        };
        let protocol = reply
            .get("result")
            .and_then(|r| r.get("protocol"))
            .and_then(Value::as_u64);
        if protocol != Some(PROTOCOL) {
            let _ = child.start_kill();
            crate::applog::warn(format!(
                "[sidecar] {} : protocole {protocol:?}, attendu {PROTOCOL}",
                lane.name()
            ));
            return Err(OUTDATED.into());
        }
        Ok((pipes, child))
    }

    /// One request on the command's lane; the handler's result, or its
    /// error message.
    pub async fn call(&self, command: &str, payload: &Value) -> Result<Value, String> {
        let lane = Lane::of(command);
        let slot = &self.lanes[lane.index()];
        let mut guard = slot.pipes.lock().await;
        for attempt in 0..2 {
            if self.closed.load(Ordering::SeqCst) {
                return Err("Euclide se ferme : Python n'est plus disponible.".into());
            }
            if guard.is_none() {
                let (pipes, child) = self.start(lane).await?;
                *lock(&slot.process) = Some(child);
                *guard = Some(pipes);
            }
            *lock(&slot.last_used) = Some(Instant::now());
            let Some(pipes) = guard.as_mut() else {
                continue;
            };
            pipes.next_id += 1;
            let id = pipes.next_id;
            let request = json!({ "id": id, "cmd": command, "payload": payload });
            match tokio::time::timeout(lane.timeout(), exchange(pipes, &request)).await {
                Err(_) => {
                    slot.kill();
                    *guard = None;
                    crate::applog::warn(format!("[sidecar] {command} : délai dépassé"));
                    return Err("Python n'a pas répondu à temps. Réessayez.".into());
                }
                Ok(Err(e)) => {
                    // The process died (or never spoke): one fresh start.
                    slot.kill();
                    *guard = None;
                    if attempt == 0 {
                        continue;
                    }
                    return Err(e);
                }
                Ok(Ok(reply)) => {
                    if reply.get("id").and_then(Value::as_u64) != Some(id) {
                        slot.kill();
                        *guard = None;
                        return Err("Réponse de Python inattendue.".into());
                    }
                    *lock(&slot.last_used) = Some(Instant::now());
                    if reply.get("ok").and_then(Value::as_bool) == Some(true) {
                        return Ok(reply.get("result").cloned().unwrap_or(Value::Null));
                    }
                    return Err(
                        error_from_sidecar(&reply).unwrap_or_else(|| "Erreur Python.".to_string())
                    );
                }
            }
        }
        Err("Python est indisponible.".into())
    }

    /// Stops the lanes unused for a while. A lane busy right now is left alone.
    fn reap_idle(&self) {
        for lane in Lane::ALL {
            let slot = &self.lanes[lane.index()];
            let idle = lock(&slot.last_used).is_some_and(|t| t.elapsed() > lane.idle());
            if !idle {
                continue;
            }
            if let Ok(mut guard) = slot.pipes.try_lock() {
                if guard.is_some() {
                    slot.kill();
                    *guard = None;
                    *lock(&slot.last_used) = None;
                }
            }
        }
    }

    /// Kill every lane for good (Euclide quits or updates) and wait up to
    /// `wait` for them to exit, so their files are released. Never waits
    /// on a running call: a call in flight fails, and nothing restarts.
    pub fn shutdown(&self, wait: Duration) {
        self.closed.store(true, Ordering::SeqCst);
        let mut children: Vec<Child> = self
            .lanes
            .iter()
            .filter_map(|slot| lock(&slot.process).take())
            .collect();
        for child in &mut children {
            let _ = child.start_kill();
        }
        wait_all(&mut children, wait);
    }
}

/// Every minute, the lanes nobody used lately stop.
pub fn start_reaper(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let Some(sidecar) = app.try_state::<Sidecar>() else {
                return;
            };
            if sidecar.closed.load(Ordering::SeqCst) {
                return;
            }
            sidecar.reap_idle();
        }
    });
}

/// Writes one message, reads one line back.
async fn exchange(pipes: &mut Pipes, message: &Value) -> Result<Value, String> {
    let line = serde_json::to_string(message).map_err(|e| e.to_string())? + "\n";
    pipes
        .stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|_| "Python s'est arrêté.".to_string())?;
    pipes
        .stdin
        .flush()
        .await
        .map_err(|_| "Python s'est arrêté.".to_string())?;
    let mut reply = String::new();
    let n = pipes
        .stdout
        .read_line(&mut reply)
        .await
        .map_err(|_| "Python s'est arrêté.".to_string())?;
    if n == 0 {
        return Err("Python s'est arrêté.".into());
    }
    serde_json::from_str(reply.trim()).map_err(|e| format!("Réponse de Python illisible : {e}"))
}

pub(crate) fn drain_stderr(stderr: tokio::process::ChildStderr, label: &'static str) {
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
                        eprintln!("[sidecar {label}] {t}");
                    }
                }
            }
        }
    });
}

pub(crate) fn wait_all(children: &mut [Child], wait: Duration) {
    let deadline = Instant::now() + wait;
    while Instant::now() < deadline {
        if children
            .iter_mut()
            .all(|c| !matches!(c.try_wait(), Ok(None)))
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

pub(crate) fn lock<T>(m: &std::sync::Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Same call sites as before the lanes: `sidecar::call(&app, "pronote_sync", &creds)`.
pub async fn call(app: &AppHandle, command: &str, payload: &Value) -> Result<Value, String> {
    let state: tauri::State<Sidecar> = app.state();
    state.call(command, payload).await
}

/// How to start the sidecar in a given mode (`--lane tools`, `--run`).
pub(crate) struct Launch {
    program: PathBuf,
    args: Vec<String>,
    pythonpath: Option<PathBuf>,
}

impl Launch {
    pub(crate) fn spawn(&self) -> Result<Child, String> {
        let mut cmd = TokioCommand::new(&self.program);
        cmd.args(&self.args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            // A replaced or dropped handle takes its process with it.
            .kill_on_drop(true)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONDONTWRITEBYTECODE", "1");
        if let Some(path) = &self.pythonpath {
            cmd.env("PYTHONPATH", path);
        }
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.spawn().map_err(|e| {
            format!(
                "Impossible de démarrer Python ({}) : {e}",
                self.program.display()
            )
        })
    }
}

/// The bundled sidecar (PyInstaller onedir) next to the executable or in
/// the resources; in a debug build, the package in the source tree, run by
/// a development Python, so edits apply without rebuilding the bundle.
pub(crate) fn launch(app: &AppHandle, mode: &[&str]) -> Result<Launch, String> {
    let args: Vec<String> = mode.iter().map(|s| s.to_string()).collect();
    if !cfg!(debug_assertions) {
        return frozen_binary(app)
            .map(|program| Launch {
                program,
                args,
                pythonpath: None,
            })
            .ok_or_else(|| "Le module Python d'Euclide (euclide-sidecar) est introuvable.".into());
    }
    let package_dir = source_package_dir()
        .ok_or_else(|| "Le dossier sidecar/euclide_sidecar est introuvable.".to_string())?;
    let mut full = vec!["-m".to_string(), "euclide_sidecar".to_string()];
    full.extend(args);
    Ok(Launch {
        program: dev_python(&package_dir).into(),
        args: full,
        pythonpath: Some(package_dir),
    })
}

/// `sidecar/` in the source tree (the folder holding the euclide_sidecar package).
fn source_package_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent().map(Path::to_path_buf);
    for _ in 0..8 {
        let d = dir?;
        let cand = d.join("sidecar");
        if cand.join("euclide_sidecar").join("__main__.py").is_file() {
            return Some(cand);
        }
        dir = d.parent().map(Path::to_path_buf);
    }
    None
}

/// EUCLIDE_PYTHON, else `sidecar/.venv` (where pronotepy, jedi and pypdf are
/// installed), else the system Python.
fn dev_python(sidecar_dir: &Path) -> String {
    if let Ok(p) = std::env::var("EUCLIDE_PYTHON") {
        if !p.trim().is_empty() {
            return p;
        }
    }
    let venv = if cfg!(windows) {
        sidecar_dir.join(".venv/Scripts/python.exe")
    } else {
        sidecar_dir.join(".venv/bin/python")
    };
    if venv.is_file() {
        return venv.to_string_lossy().to_string();
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
            candidates.push(dir.join(onedir).join(name));
            candidates.push(dir.join(name));
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join(onedir).join(name));
        candidates.push(res.join("resources").join(onedir).join(name));
        candidates.push(res.join(name));
        candidates.push(res.join("resources").join(name));
    }
    // is_file: the onedir folder itself (or the empty placeholder in a source
    // checkout) has the same name as the binary.
    candidates.into_iter().find(|p| p.is_file())
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
    use super::*;

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

    /// A lane from the source tree answers the handshake and a request.
    #[test]
    fn a_lane_speaks_the_protocol() {
        let sidecar_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../sidecar");
        let launch = Launch {
            program: dev_python(&sidecar_dir).into(),
            args: ["-m", "euclide_sidecar", "--lane", "index"]
                .map(String::from)
                .to_vec(),
            pythonpath: Some(sidecar_dir),
        };
        tauri::async_runtime::block_on(async {
            let mut child = launch.spawn().expect("python");
            let mut pipes = Pipes {
                stdin: child.stdin.take().unwrap(),
                stdout: BufReader::new(child.stdout.take().unwrap()),
                next_id: 0,
            };
            let hello = exchange(&mut pipes, &json!({ "id": 0, "cmd": "hello" }))
                .await
                .unwrap();
            assert_eq!(hello["result"]["protocol"], PROTOCOL);
            let reply = exchange(
                &mut pipes,
                &json!({ "id": 1, "cmd": "extract_pdf", "payload": { "path": "" } }),
            )
            .await
            .unwrap();
            assert_eq!(reply["id"], 1);
            assert_eq!(reply["result"]["text"], "");
            let unknown = exchange(&mut pipes, &json!({ "id": 2, "cmd": "nope" }))
                .await
                .unwrap();
            assert_eq!(unknown["ok"], false);
            let _ = child.start_kill();
        });
    }

    #[test]
    fn commands_go_to_their_lane() {
        assert_eq!(Lane::of("python_complete"), Lane::Tools);
        assert_eq!(Lane::of("extract_pdf"), Lane::Index);
        assert_eq!(Lane::of("pronote_sync"), Lane::Pronote);
        assert!(Lane::Tools.timeout() < Lane::Pronote.timeout());
    }
}
