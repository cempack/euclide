use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

/// Spawn the updated binary and quit this process.
///
/// After an AppImage update the squashfs mount still holds the *old* payload.
/// `current_exe()` / a naive restart would relaunch that. We start the
/// `.AppImage` file (or the real exe) instead, then exit.
///
/// The new process must not start while this one is still alive: the portable
/// AppImage would race on `euclide.db`, and Linux often refuses to exec a file
/// the current process still maps (ETXTBSY). A detached helper waits for our
/// PID, then launches the updated file.
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
    if !path.is_file() {
        return false;
    }
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
        return spawn_unix_relaunch_helper(&path).is_ok();
    }
    #[cfg(not(unix))]
    {
        Command::new(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok()
    }
}

/// Wait until `EUCLIDE_RELAUNCH_PID` is gone, then exec the updated binary
/// from the same directory the user launched (so `Euclide-Data` stays next to it).
#[cfg(unix)]
fn spawn_unix_relaunch_helper(path: &Path) -> std::io::Result<std::process::Child> {
    use std::os::unix::process::CommandExt;

    let cwd = path.parent().filter(|p| !p.as_os_str().is_empty());
    let mut cmd = Command::new("sh");
    cmd.arg("-c")
        .arg(
            "pid=$EUCLIDE_RELAUNCH_PID
bin=$EUCLIDE_RELAUNCH_BIN
i=0
while kill -0 \"$pid\" 2>/dev/null; do
  i=$((i + 1))
  [ \"$i\" -gt 80 ] && break
  sleep 0.15
done
sleep 0.35
exec \"$bin\"
",
        )
        .env("EUCLIDE_RELAUNCH_PID", std::process::id().to_string())
        .env("EUCLIDE_RELAUNCH_BIN", path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.process_group(0);
    cmd.spawn()
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
        assert!(!spawn_updated_binary());
        match prev {
            Some(v) => std::env::set_var("APPIMAGE", v),
            None => std::env::remove_var("APPIMAGE"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn helper_spawns_for_existing_appimage() {
        let _g = crate::paths::TEST_ENV_LOCK.lock().unwrap();
        let tmp = std::env::temp_dir().join(format!(
            "euclide-relaunch-ok-{}.AppImage",
            std::process::id()
        ));
        std::fs::write(&tmp, b"#!/bin/sh\nexit 0\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&tmp).unwrap().permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&tmp, perms).unwrap();

        let prev = std::env::var_os("APPIMAGE");
        std::env::set_var("APPIMAGE", &tmp);
        let child = spawn_unix_relaunch_helper(&tmp);
        match prev {
            Some(v) => std::env::set_var("APPIMAGE", v),
            None => std::env::remove_var("APPIMAGE"),
        }
        let _ = std::fs::remove_file(&tmp);
        let mut child = child.expect("helper should spawn");
        let _ = child.kill();
        let _ = child.wait();
    }
}
