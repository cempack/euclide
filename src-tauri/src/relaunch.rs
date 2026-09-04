use tauri::{AppHandle, Manager};

/// Quit after an in-place update. The new binary is not started from here —
/// the user closes (or we already exited) and opens Euclide again.
#[tauri::command]
pub async fn relaunch_after_update(app: AppHandle) {
    if let Some(sc) = app.try_state::<crate::sidecar::Sidecar>() {
        sc.stop().await;
    }
    app.exit(0);
}
