//! Key/value settings and the keep-awake switch.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::keepawake::KeepAwake;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

/// Settings the webview may read and write. Everything else in the table
/// (Pronote credentials, internal bookkeeping) stays on the Rust side.
pub(crate) const UI_SETTINGS: &[&str] = &[
    "theme",
    "density",
    "max_tabs",
    "max_tabs_mode",
    "open_tabs",
    "remote_favicons",
    "class_end_notice",
    "class_end_lead",
    "teacher_display_name",
    "sidebar",
    "note_view",
    "python_timeout",
    "python_output_height",
    "documents_view",
    "keep_awake_mode",
    "note_templates",
    "python_templates",
    "usage_stats",
];

fn ui_key(key: &str) -> AppResult<&str> {
    if UI_SETTINGS.contains(&key) {
        Ok(key)
    } else {
        Err(AppError::user(format!("Réglage inconnu : {key}")))
    }
}

pub(crate) fn get_setting_raw(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
        r.get(0)
    })
    .optional()
    .ok()
    .flatten()
}

pub(crate) fn put(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// For callers that cannot report a failure (startup, best-effort bookkeeping).
pub(crate) fn set_setting_raw(conn: &Connection, key: &str, value: &str) {
    if let Err(e) = put(conn, key, value) {
        crate::applog::warn(format!("[settings] {key}: {}", e.message()));
    }
}

#[tauri::command]
pub async fn get_setting(db: State<'_, Db>, key: String) -> AppResult<Option<String>> {
    ui_key(&key)?;
    db.read(move |conn| Ok(get_setting_raw(conn, &key))).await
}

#[tauri::command]
pub async fn set_setting(db: State<'_, Db>, key: String, value: String) -> AppResult<()> {
    ui_key(&key)?;
    db.write(move |conn| put(conn, &key, &value)).await
}

#[tauri::command]
pub async fn set_keep_awake(
    ka: State<'_, KeepAwake>,
    db: State<'_, Db>,
    on: bool,
) -> AppResult<bool> {
    // A toggle by hand (palette, Outils) is a choice: on or off, not « during classes ».
    crate::keepawake::set(&ka, on);
    let mode = if on { "on" } else { "off" };
    db.write(move |conn| put(conn, "keep_awake_mode", mode))
        .await?;
    Ok(on)
}

/// « auto » (during classes), « on » or « off »; applied at once.
#[tauri::command]
pub async fn set_keep_awake_mode(
    ka: State<'_, KeepAwake>,
    db: State<'_, Db>,
    mode: String,
) -> AppResult<bool> {
    let mode = crate::keepawake::Mode::parse(Some(&mode));
    let on = db
        .write(move |conn| {
            put(conn, "keep_awake_mode", mode.as_str())?;
            Ok(match mode {
                crate::keepawake::Mode::On => true,
                crate::keepawake::Mode::Off => false,
                crate::keepawake::Mode::Auto => {
                    crate::keepawake::in_class(conn, chrono::Local::now().naive_local())
                }
            })
        })
        .await?;
    crate::keepawake::set(&ka, on);
    Ok(on)
}

#[tauri::command]
pub fn keep_awake_status(ka: State<KeepAwake>) -> bool {
    crate::keepawake::is_on(&ka)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_round_trip_and_only_ui_keys_are_exposed() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        put(&conn, "theme", "dark").unwrap();
        put(&conn, "theme", "light").unwrap();
        assert_eq!(get_setting_raw(&conn, "theme").as_deref(), Some("light"));
        assert_eq!(get_setting_raw(&conn, "missing"), None);
        assert!(ui_key("density").is_ok());
        assert_eq!(ui_key("pronote_password").unwrap_err().code(), "user");
    }
}
