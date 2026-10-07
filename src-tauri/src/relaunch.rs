use std::time::Duration;

use tauri::{AppHandle, Manager};

/// Quit after an in-place update (AppImage / after the new file is on disk).
/// Does not start the new binary — the user opens Euclide again.
#[tauri::command]
pub async fn relaunch_after_update(app: AppHandle) {
    let handle = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let Some(sc) = handle.try_state::<crate::sidecar::Sidecar>() {
            sc.shutdown(Duration::from_secs(1));
        }
    })
    .await;
    app.exit(0);
}
