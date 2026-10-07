//! Runs the teacher's Python scripts, each in a process of its own
//! (sidecar/euclide_sidecar/runner.py), so a loop, an input() or an exit()
//! can never stall Pronote or the editor.
//!
//! The page gets the script's events (output, input requests, drawings,
//! checks) through a channel, in small batches. Stop kills the process; so
//! does the time limit, which does not count the time spent waiting for the
//! teacher to type an answer, and so does too much output. A process is kept
//! started in advance, so a run does not pay Python's start-up.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::sidecar::{drain_stderr, launch, lock, wait_all};

/// What a script may print in one run: past it, the run stops.
const OUTPUT_CAP: usize = 2 * 1024 * 1024;
const BATCH_EVERY: Duration = Duration::from_millis(30);
const DEFAULT_TIMEOUT: u32 = 30;
/// A process started in advance and never used is let go after this.
const WARM_IDLE: Duration = Duration::from_secs(10 * 60);

struct Proc {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
}

struct Warm {
    proc: Proc,
    since: Instant,
}

struct Run {
    id: u64,
    stdin: Mutex<Option<ChildStdin>>,
    child: std::sync::Mutex<Option<Child>>,
    /// Why Euclide ended it ("stopped", "timeout", "output"), if it did.
    ended_by: std::sync::Mutex<Option<&'static str>>,
    /// Set while the script waits for input(): the clock is paused.
    waiting_since: std::sync::Mutex<Option<Instant>>,
    /// Time spent waiting for input, added to the limit.
    waited: std::sync::Mutex<Duration>,
}

impl Run {
    fn end(&self, reason: &'static str) {
        let mut ended = lock(&self.ended_by);
        if ended.is_none() {
            *ended = Some(reason);
        }
        if let Some(child) = lock(&self.child).as_mut() {
            let _ = child.start_kill();
        }
    }
}

#[derive(Default)]
pub struct Runner {
    current: std::sync::Mutex<Option<Arc<Run>>>,
    warm: std::sync::Mutex<Option<Warm>>,
    next_id: AtomicU64,
    closed: AtomicBool,
}

impl Runner {
    fn spawn(app: &AppHandle) -> Result<Proc, String> {
        let mut child = launch(app, &["--run"])?.spawn()?;
        if let Some(stderr) = child.stderr.take() {
            drain_stderr(stderr, "run");
        }
        let stdin = child.stdin.take().ok_or("stdin introuvable")?;
        let stdout = child.stdout.take().ok_or("stdout introuvable")?;
        Ok(Proc {
            child,
            stdin,
            stdout,
        })
    }

    /// The warm process if it is still alive, else a new one.
    fn take_process(&self, app: &AppHandle) -> Result<Proc, String> {
        if let Some(mut warm) = lock(&self.warm).take() {
            if matches!(warm.proc.child.try_wait(), Ok(None)) {
                return Ok(warm.proc);
            }
        }
        Self::spawn(app)
    }

    /// Start a process ahead of the next run (the Python screen is open).
    pub fn prewarm(&self, app: &AppHandle) {
        if self.closed.load(Ordering::SeqCst) {
            return;
        }
        let mut warm = lock(&self.warm);
        if let Some(w) = warm.as_mut() {
            if matches!(w.proc.child.try_wait(), Ok(None)) {
                w.since = Instant::now();
                return;
            }
        }
        match Self::spawn(app) {
            Ok(proc) => {
                *warm = Some(Warm {
                    proc,
                    since: Instant::now(),
                })
            }
            Err(e) => crate::applog::warn(format!("[runner] préchauffage : {e}")),
        }
    }

    fn reap_warm(&self) {
        let mut warm = lock(&self.warm);
        if warm.as_ref().is_some_and(|w| w.since.elapsed() > WARM_IDLE) {
            if let Some(mut w) = warm.take() {
                let _ = w.proc.child.start_kill();
            }
        }
    }

    fn current(&self, id: u64) -> Option<Arc<Run>> {
        lock(&self.current).as_ref().filter(|r| r.id == id).cloned()
    }

    /// Kill the running script and the warm process (Euclide quits or updates).
    pub fn shutdown(&self, wait: Duration) {
        self.closed.store(true, Ordering::SeqCst);
        let mut children = vec![];
        if let Some(run) = lock(&self.current).take() {
            *lock(&run.ended_by) = Some("stopped");
            if let Some(c) = lock(&run.child).take() {
                children.push(c);
            }
        }
        if let Some(w) = lock(&self.warm).take() {
            children.push(w.proc.child);
        }
        for c in &mut children {
            let _ = c.start_kill();
        }
        wait_all(&mut children, wait);
    }
}

/// Every minute, a warm process nobody used lately stops.
pub fn start_reaper(app: AppHandle) {
    use tauri::Manager;
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let Some(runner) = app.try_state::<Runner>() else {
                return;
            };
            if runner.closed.load(Ordering::SeqCst) {
                return;
            }
            runner.reap_warm();
        }
    });
}

/// `name`'s companion checks (`suite.checks.py` for `suite.py`), or "" to use
/// the script's doctests.
fn checks_source(name: &str) -> String {
    let stem = name.strip_suffix(".py").unwrap_or(name);
    let path = crate::paths::python_dir().join(format!("{stem}.checks.py"));
    std::fs::read_to_string(path).unwrap_or_default()
}

/// A display name for tracebacks: the file name only, ending in .py.
fn script_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    match base {
        "" => "script.py".into(),
        b if b.ends_with(".py") => b.into(),
        b => format!("{b}.py"),
    }
}

/// Runs `code` (the editor's text, saved or not); returns the run's id.
/// Events arrive on `on_event` until one of type "done".
#[tauri::command]
pub async fn python_run(
    app: AppHandle,
    runner: State<'_, Runner>,
    name: String,
    code: String,
    checks: bool,
    timeout_s: Option<u32>,
    on_event: Channel<Vec<Value>>,
) -> AppResult<u64> {
    // One run at a time: a new one replaces the last.
    if let Some(previous) = lock(&runner.current).take() {
        previous.end("stopped");
    }
    let name = script_name(&name);
    let start = json!({
        "code": code,
        "name": name,
        "cwd": crate::paths::python_dir().to_string_lossy(),
        "checks": if checks { json!({ "source": checks_source(&name) }) } else { Value::Null },
    });
    let mut proc = runner.take_process(&app).map_err(AppError::user)?;
    let line = start.to_string() + "\n";
    proc.stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| AppError::user(format!("Python n'a pas démarré : {e}")))?;
    proc.stdin.flush().await.ok();

    let id = runner.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    let run = Arc::new(Run {
        id,
        stdin: Mutex::new(Some(proc.stdin)),
        child: std::sync::Mutex::new(Some(proc.child)),
        ended_by: Default::default(),
        waiting_since: Default::default(),
        waited: Default::default(),
    });
    *lock(&runner.current) = Some(run.clone());

    let limit = Duration::from_secs(u64::from(
        timeout_s.unwrap_or(DEFAULT_TIMEOUT).clamp(1, 3600),
    ));
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        pump(run.clone(), proc.stdout, limit, on_event).await;
        use tauri::Manager;
        if let Some(runner) = app2.try_state::<Runner>() {
            let mut current = lock(&runner.current);
            if current.as_ref().is_some_and(|r| r.id == run.id) {
                *current = None;
            }
            drop(current);
            runner.prewarm(&app2);
        }
    });
    Ok(id)
}

/// Reads the script's events and forwards them in batches until it ends.
async fn pump(run: Arc<Run>, stdout: ChildStdout, limit: Duration, channel: Channel<Vec<Value>>) {
    let started = Instant::now();
    let mut lines = BufReader::new(stdout).lines();
    let mut batch: Vec<Value> = vec![];
    let mut printed = 0usize;
    let mut saw_done = false;
    let mut flush_at = tokio::time::Instant::now() + BATCH_EVERY;
    let send = |batch: &mut Vec<Value>| {
        if !batch.is_empty() {
            let _ = channel.send(std::mem::take(batch));
        }
    };
    loop {
        // The time limit, minus the time spent waiting for the teacher's answer.
        // Waiting for an answer, or already ended: the clock does not apply.
        let waiting = lock(&run.waiting_since).is_some() || lock(&run.ended_by).is_some();
        let deadline = started + limit + *lock(&run.waited);
        let until_deadline = deadline.saturating_duration_since(Instant::now());
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(line)) => {
                    let Ok(event) = serde_json::from_str::<Value>(&line) else { continue };
                    match event.get("t").and_then(Value::as_str) {
                        Some("out") | Some("err") => {
                            printed += event.get("s").and_then(Value::as_str).map_or(0, str::len);
                            if printed > OUTPUT_CAP {
                                run.end("output");
                            }
                        }
                        Some("input") => *lock(&run.waiting_since) = Some(Instant::now()),
                        Some("done") => saw_done = true,
                        _ => {}
                    }
                    let urgent = matches!(event.get("t").and_then(Value::as_str), Some("input") | Some("done"));
                    batch.push(event);
                    if urgent || batch.len() >= 200 {
                        send(&mut batch);
                    }
                }
                _ => break,
            },
            _ = tokio::time::sleep_until(flush_at) => {
                send(&mut batch);
                flush_at = tokio::time::Instant::now() + BATCH_EVERY;
            }
            _ = tokio::time::sleep(until_deadline), if !waiting => {
                run.end("timeout");
            }
        }
    }
    // The process is gone: its exit code, and why, if Euclide ended it.
    let code = {
        let mut child = lock(&run.child).take();
        match child.as_mut() {
            Some(c) => {
                let deadline = Instant::now() + Duration::from_secs(2);
                loop {
                    match c.try_wait() {
                        Ok(Some(status)) => break status.code(),
                        Ok(None) if Instant::now() < deadline => {
                            tokio::time::sleep(Duration::from_millis(20)).await
                        }
                        _ => {
                            let _ = c.start_kill();
                            break None;
                        }
                    }
                }
            }
            None => None,
        }
    };
    let ended_by = *lock(&run.ended_by);
    if ended_by.is_some() || !saw_done {
        batch.push(json!({
            "t": "done",
            "ok": false,
            "code": code,
            "reason": ended_by.unwrap_or("crash"),
        }));
    }
    send(&mut batch);
}

/// The teacher's answer to the script's input().
#[tauri::command]
pub async fn python_input(runner: State<'_, Runner>, run_id: u64, text: String) -> AppResult<()> {
    let Some(run) = runner.current(run_id) else {
        return Err(AppError::user("Le script est terminé."));
    };
    if let Some(since) = lock(&run.waiting_since).take() {
        *lock(&run.waited) += since.elapsed();
    }
    let line = json!({ "t": "input", "s": text }).to_string() + "\n";
    let mut stdin = run.stdin.lock().await;
    match stdin.as_mut() {
        Some(pipe) => {
            pipe.write_all(line.as_bytes())
                .await
                .map_err(|_| AppError::user("Le script est terminé."))?;
            pipe.flush().await.ok();
            Ok(())
        }
        None => Err(AppError::user("Le script est terminé.")),
    }
}

// Async commands run on the Tokio runtime, which spawning and killing
// processes need (a plain command runs on the main thread, outside it).
#[tauri::command]
pub async fn python_stop(runner: State<'_, Runner>, run_id: u64) -> AppResult<()> {
    if let Some(run) = runner.current(run_id) {
        run.end("stopped");
    }
    Ok(())
}

/// The Python screen is open: have a process ready for the first run.
#[tauri::command]
pub async fn python_prewarm(app: AppHandle, runner: State<'_, Runner>) -> AppResult<()> {
    runner.prewarm(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::script_name;

    #[test]
    fn script_names_are_file_names() {
        assert_eq!(script_name("suite.py"), "suite.py");
        assert_eq!(script_name("C:\\x\\..\\évil"), "évil.py");
        assert_eq!(script_name("a/b/c.py"), "c.py");
        assert_eq!(script_name("  "), "script.py");
    }
}
