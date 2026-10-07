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
/// just updated (none on the very first launch).
pub fn record_version(conn: &Connection, current: &str) -> Option<String> {
    let previous = get_setting_raw(conn, "last_version");
    if previous.as_deref() == Some(current) {
        return None;
    }
    set_setting_raw(conn, "last_version", current);
    previous
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
}
