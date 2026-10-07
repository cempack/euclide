//! Plain-text logs in `Euclide-Data/logs/`, for diagnosing problems on the
//! teacher's machine, where a release build has no console: `perf.log` for
//! timings, `euclide.log` for warnings, frontend errors and crashes. Each file
//! is capped and keeps one previous file, so logs never grow on the USB key.

use std::io::Write;

pub const PERF: &str = "perf.log";
pub const EVENTS: &str = "euclide.log";

const MAX_BYTES: u64 = 512 * 1024;

/// Append lines to `logs/<file>`, each prefixed with the UTC time. Never
/// panics, since the panic hook calls it.
pub fn append(file: &str, lines: &[String]) {
    if lines.is_empty() {
        return;
    }
    let dir = crate::paths::data_dir().join("logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join(file);
    if std::fs::metadata(&path)
        .map(|m| m.len() > MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = std::fs::rename(&path, dir.join(format!("{file}.1")));
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

/// A line in euclide.log, also printed to stderr for `tauri dev`.
pub fn warn(line: impl Into<String>) {
    let line = line.into();
    eprintln!("{line}");
    append(EVENTS, &[line]);
}

/// Panics also land in euclide.log with their location (release builds are
/// stripped, so a backtrace would only hold addresses), then the default hook
/// runs as before.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("sans nom");
        append(EVENTS, &[format!("panic ({name}) {info}")]);
        default(info);
    }));
}

/// Errors seen by the frontend (uncaught errors, rejected promises, blocked
/// by the content security policy). Bounded, since a render loop could
/// report the same error many times.
#[tauri::command]
pub async fn log_errors(lines: Vec<String>) -> Result<(), String> {
    let lines: Vec<String> = lines
        .into_iter()
        .take(20)
        .map(|l| format!("web {}", l.chars().take(1000).collect::<String>()))
        .collect();
    tauri::async_runtime::spawn_blocking(move || append(EVENTS, &lines))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_record_per_line_and_rotation() {
        let _env = crate::paths::temp_data_dir("applog");
        let logs = crate::paths::data_dir().join("logs");
        append(EVENTS, &["un".into(), "deux\nfaux: injecté".into()]);
        let path = logs.join(EVENTS);
        let text = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with(" un"));
        assert!(lines[1].ends_with(" deux faux: injecté"));

        std::fs::write(&path, vec![b'x'; MAX_BYTES as usize + 1]).unwrap();
        append(EVENTS, &["après".into()]);
        assert!(logs.join("euclide.log.1").is_file());
        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(text.lines().count(), 1);
    }
}
