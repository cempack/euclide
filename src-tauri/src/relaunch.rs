use tauri::{AppHandle, Manager};

/// Quit after an in-place update (AppImage / after the new file is on disk).
/// Does not start the new binary — the user opens Euclide again.
#[tauri::command]
pub async fn relaunch_after_update(app: AppHandle) {
    if let Some(sc) = app.try_state::<crate::sidecar::Sidecar>() {
        sc.stop().await;
    }
    app.exit(0);
}
