use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;

/// Keeps the screen on and the PC awake while a lesson needs it.
///
/// The `keepawake` crate uses `SetThreadExecutionState` on Windows, which
/// belongs to the calling thread: the request ends when that thread exits, and
/// only that thread can lift it. So one dedicated thread owns the guard for the
/// whole run, and `set` just sends it on/off. It also keeps the Linux D-Bus
/// call and the macOS assertion off the UI thread.
pub struct KeepAwake {
    on: AtomicBool,
    tx: Mutex<Sender<bool>>,
}

impl Default for KeepAwake {
    fn default() -> Self {
        let (tx, rx) = channel::<bool>();
        let spawned = std::thread::Builder::new()
            .name("keep-awake".into())
            .spawn(move || {
                let mut guard: Option<keepawake::KeepAwake> = None;
                for on in rx {
                    if !on {
                        guard = None;
                    } else if guard.is_none() {
                        match keepawake::Builder::default()
                            .display(true)
                            .idle(true)
                            .reason("Euclide - cours en cours (écran et système éveillés)")
                            .app_name("Euclide")
                            .app_reverse_domain("fr.elliotmoreau.euclide")
                            .create()
                        {
                            Ok(g) => guard = Some(g),
                            Err(e) => {
                                crate::applog::warn(format!("[keepawake] failed to enable: {e}"))
                            }
                        }
                    }
                }
            });
        if let Err(e) = spawned {
            crate::applog::warn(format!("[keepawake] thread not started: {e}"));
        }
        KeepAwake {
            on: AtomicBool::new(false),
            tx: Mutex::new(tx),
        }
    }
}

/// Turn keep-awake on or off. Returns immediately; the guard thread applies it.
pub fn set(ka: &KeepAwake, on: bool) {
    ka.on.store(on, Ordering::Relaxed);
    let tx = ka.tx.lock().unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(on);
}

/// What the teacher asked for (used by the command and the UI).
pub fn is_on(ka: &KeepAwake) -> bool {
    ka.on.load(Ordering::Relaxed)
}

/// When the screen is kept on: during classes (the timetable says when),
/// always, or never. Saved as `keep_awake_mode`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Auto,
    On,
    Off,
}

impl Mode {
    pub fn parse(value: Option<&str>) -> Mode {
        match value {
            Some("on") => Mode::On,
            Some("off") => Mode::Off,
            _ => Mode::Auto,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Auto => "auto",
            Mode::On => "on",
            Mode::Off => "off",
        }
    }
}

/// The saved mode. Before modes there was only on/off, written « on » at the
/// first launch: those installs move to « during classes », unless the
/// teacher had turned it off.
pub fn saved_mode(conn: &rusqlite::Connection) -> Mode {
    use crate::commands::{get_setting_raw, set_setting_raw};
    if let Some(mode) = get_setting_raw(conn, "keep_awake_mode") {
        return Mode::parse(Some(&mode));
    }
    let mode = if get_setting_raw(conn, "keep_awake").as_deref() == Some("0") {
        Mode::Off
    } else {
        Mode::Auto
    };
    set_setting_raw(conn, "keep_awake_mode", mode.as_str());
    mode
}

/// A lesson is on now (or about to be): from five minutes before it starts
/// to five minutes after it ends.
pub fn in_class(conn: &rusqlite::Connection, now: chrono::NaiveDateTime) -> bool {
    use chrono::{Datelike, Duration, NaiveTime};
    let day = now.weekday().number_from_monday() as i64;
    let Ok(mut stmt) =
        conn.prepare_cached("SELECT start_time, end_time FROM schedule WHERE day_of_week=?1")
    else {
        return false;
    };
    let rows: Vec<(String, String)> = match stmt.query_map([day], |r| Ok((r.get(0)?, r.get(1)?))) {
        Ok(rows) => rows.flatten().collect(),
        Err(_) => return false,
    };
    let t = now.time();
    rows.iter().any(|(start, end)| {
        let (Ok(start), Ok(end)) = (
            NaiveTime::parse_from_str(start, "%H:%M"),
            NaiveTime::parse_from_str(end, "%H:%M"),
        ) else {
            return false;
        };
        t >= start - Duration::minutes(5) && t <= end + Duration::minutes(5)
    })
}

/// Applies the mode now, and every half minute in « during classes » (a
/// lesson starts, another ends). Tells the page when the state changes.
pub fn spawn_auto(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let spawned = std::thread::Builder::new()
        .name("keep-awake-auto".into())
        .spawn(move || loop {
            let (Some(ka), Some(db)) = (
                app.try_state::<KeepAwake>(),
                app.try_state::<crate::db::Db>(),
            ) else {
                return;
            };
            let wanted = {
                let conn = db.lock();
                match saved_mode(&conn) {
                    Mode::On => true,
                    Mode::Off => false,
                    Mode::Auto => in_class(&conn, chrono::Local::now().naive_local()),
                }
            };
            if wanted != is_on(&ka) {
                set(&ka, wanted);
                let _ = app.emit(
                    crate::jobs::indexer::INVALIDATE_EVENT,
                    serde_json::json!({ "scope": "keepAwake" }),
                );
            }
            std::thread::sleep(std::time::Duration::from_secs(30));
        });
    if let Err(e) = spawned {
        crate::applog::warn(format!("[keepawake] auto thread not started: {e}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keepawake_toggle_works_everywhere() {
        let ka = KeepAwake::default();
        assert!(!is_on(&ka));
        set(&ka, true);
        assert!(is_on(&ka));
        set(&ka, false);
        assert!(!is_on(&ka));
        // Toggling twice must be safe: the guard is dropped and recreated on its thread.
        set(&ka, true);
        set(&ka, true);
        assert!(is_on(&ka));
        set(&ka, false);
        assert!(!is_on(&ka));
    }

    #[test]
    fn during_classes_means_around_the_timetable() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE schedule (day_of_week INTEGER, start_time TEXT, end_time TEXT);
             INSERT INTO schedule VALUES (2, '10:00', '11:00');",
        )
        .unwrap();
        let at = |s: &str| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap();
        // 2026-10-06 is a Tuesday.
        assert!(in_class(&conn, at("2026-10-06 10:30")));
        assert!(
            in_class(&conn, at("2026-10-06 09:56")),
            "five minutes before"
        );
        assert!(
            in_class(&conn, at("2026-10-06 11:04")),
            "five minutes after"
        );
        assert!(!in_class(&conn, at("2026-10-06 11:10")));
        assert!(!in_class(&conn, at("2026-10-07 10:30")), "another day");
    }

    #[test]
    fn modes_read_back_and_unknown_means_auto() {
        assert_eq!(Mode::parse(Some("on")), Mode::On);
        assert_eq!(Mode::parse(Some("off")), Mode::Off);
        assert_eq!(Mode::parse(Some("?")), Mode::Auto);
        assert_eq!(Mode::parse(None), Mode::Auto);
    }
}
