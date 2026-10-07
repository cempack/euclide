//! Static facts about this copy of Euclide.

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
