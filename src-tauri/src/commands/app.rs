//! Static facts about this copy of Euclide.

use rusqlite::Connection;

use super::settings::{get_setting_raw, set_setting_raw};
use crate::error::AppResult;
use crate::models::AppInfo;

#[tauri::command]
pub async fn get_app_info() -> AppResult<AppInfo> {
    // Reads the folder next to the executable on Windows: keep it off the UI thread.
    Ok(tauri::async_runtime::spawn_blocking(|| AppInfo {
        teacher_name: "Monsieur Madrias".into(),
        author: "Elliot Moreau".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        data_dir: crate::paths::data_dir().to_string_lossy().to_string(),
        windows_portable: crate::portable_update::is_windows_portable(),
    })
    .await?)
}

/// Remember which version ran last. Returns the previous one when Euclide was
/// just updated (none on the very first launch). Versions before 0.3.0 did
/// not record it, but left settings behind: they show as "0.1".
pub fn record_version(conn: &Connection, current: &str) -> Option<String> {
    let previous = get_setting_raw(conn, "last_version");
    if previous.as_deref() == Some(current) {
        return None;
    }
    let used_before = previous.is_some()
        || conn
            .query_row("SELECT EXISTS(SELECT 1 FROM settings)", [], |r| {
                r.get::<_, bool>(0)
            })
            .unwrap_or(false);
    set_setting_raw(conn, "last_version", current);
    used_before.then(|| previous.unwrap_or_else(|| "0.1".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_an_update_once_and_not_the_first_launch() {
        let conn = crate::db::migrations_for_tests();
        assert_eq!(record_version(&conn, "0.3.0"), None);
        assert_eq!(record_version(&conn, "0.3.0"), None);
        assert_eq!(record_version(&conn, "0.4.0").as_deref(), Some("0.3.0"));
        assert_eq!(record_version(&conn, "0.4.0"), None);
    }

    #[test]
    fn an_install_from_before_0_3_counts_as_an_update() {
        let conn = crate::db::migrations_for_tests();
        set_setting_raw(&conn, "keep_awake", "1");
        assert_eq!(record_version(&conn, "0.3.0").as_deref(), Some("0.1"));
    }
}
