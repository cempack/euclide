use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

/// Spawn the updated binary and quit this process.
///
/// After an AppImage update the squashfs mount still holds the *old* payload.
/// `current_exe()` / a naive restart would relaunch that. We start the
/// `.AppImage` file (or the real exe) instead, then exit.
#[tauri::command]
pub async fn relaunch_after_update(app: AppHandle) {
    if let Some(sc) = app.try_state::<crate::sidecar::Sidecar>() {
        sc.stop().await;
    }
    if spawn_updated_binary() {
        app.exit(0);
        return;
    }
    app.restart();
}

fn spawn_updated_binary() -> bool {
    let path = crate::paths::process_launch_path();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&path) {
            let mut perms = meta.permissions();
            if perms.mode() & 0o111 == 0 {
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&path, perms);
            }
        }
    }

    let mut cmd = Command::new(&path);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd.spawn().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_of_missing_binary_is_false() {
        let _g = crate::paths::TEST_ENV_LOCK.lock().unwrap();
        let prev = std::env::var_os("APPIMAGE");
        std::env::set_var(
            "APPIMAGE",
            "/tmp/.euclide-no-such-appimage-for-relaunch-test",
        );
        // Path is resolved; spawn fails because the file is not there.
        assert!(!spawn_updated_binary());
        match prev {
            Some(v) => std::env::set_var("APPIMAGE", v),
            None => std::env::remove_var("APPIMAGE"),
        }
    }
}
