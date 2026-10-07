//! Timing log for diagnosing slowness on the teacher's machine.
//!
//! `Euclide-Data/logs/perf.log` receives a few lines at startup and a summary
//! from the frontend every few minutes (IPC durations, tab switches, long
//! tasks). It is capped so it never grows on the USB key.

use std::io::Write;
use std::sync::OnceLock;
use std::time::Instant;

static PROCESS_START: OnceLock<Instant> = OnceLock::new();

const MAX_BYTES: u64 = 512 * 1024;

/// Call first thing in `run()`.
pub fn start() {
    PROCESS_START.get_or_init(Instant::now);
}

/// Milliseconds since the process started.
pub fn uptime_ms() -> u128 {
    PROCESS_START
        .get()
        .map(|t| t.elapsed().as_millis())
        .unwrap_or(0)
}

/// Append lines to perf.log, each prefixed with the UTC time. Keeps one
/// previous file (perf.log.1) once the current one passes 512 KB.
pub fn append(lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    let dir = crate::paths::data_dir().join("logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("perf.log");
    if std::fs::metadata(&path)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = std::fs::rename(&path, dir.join("perf.log.1"));
    }
    let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    else {
        return;
    };
    let stamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
    let mut out = String::new();
    for line in lines {
        // One record per line: never let a caller inject a newline.
        out.push_str(&format!("{stamp} {}\n", line.replace(['\n', '\r'], " ")));
    }
    let _ = f.write_all(out.as_bytes());
}

/// Frontend timings. `app.ready` also records how long the whole process
/// took to get there, which includes WebView startup.
#[tauri::command]
pub async fn log_perf(lines: Vec<String>) -> Result<(), String> {
    let mut lines: Vec<String> = lines.into_iter().take(200).collect();
    if lines.iter().any(|l| l.starts_with("app.ready")) {
        lines.push(format!("rust.process_to_app_ready_ms={}", uptime_ms()));
    }
    tauri::async_runtime::spawn_blocking(move || append(&lines))
        .await
        .map_err(|e| e.to_string())
}
