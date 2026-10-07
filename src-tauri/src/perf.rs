//! Timing log for diagnosing slowness on the teacher's machine.
//!
//! `Euclide-Data/logs/perf.log` receives a few lines at startup and a summary
//! from the frontend every few minutes (IPC durations, tab switches, long
//! tasks). It is capped so it never grows on the USB key.

use std::sync::OnceLock;
use std::time::Instant;

static PROCESS_START: OnceLock<Instant> = OnceLock::new();

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

/// Append lines to perf.log, each prefixed with the UTC time.
pub fn append(lines: &[String]) {
    crate::applog::append(crate::applog::PERF, lines);
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
