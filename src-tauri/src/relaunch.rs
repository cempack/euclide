use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

/// Wait until this PID is gone, then start the updated exe from its folder.
/// Same race as Linux: spawning while we still hold `euclide.exe` / SQLite fails
/// or starts a second instance that dies. Portable Windows must *not* call
/// `relaunch_after_update` — the overlay helper replaces the exe only after exit.
#[cfg_attr(not(any(windows, test)), allow(dead_code))]
const WINDOWS_RELAUNCH_PS1: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$appPid = [int]$env:EUCLIDE_RELAUNCH_PID
$bin = $env:EUCLIDE_RELAUNCH_BIN
$cwd = $env:EUCLIDE_RELAUNCH_CWD
if (-not $bin -or -not (Test-Path -LiteralPath $bin)) { exit 1 }
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Process -Id $appPid -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) {
  Start-Sleep -Milliseconds 200
}
Start-Sleep -Milliseconds 500
if ($cwd -and (Test-Path -LiteralPath $cwd)) {
  Start-Process -FilePath $bin -WorkingDirectory $cwd
} else {
  Start-Process -FilePath $bin
}
"#;

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
    #[cfg(windows)]
    {
        return spawn_windows_relaunch_helper(&path).is_ok();
    }
    #[cfg(not(any(unix, windows)))]
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

#[cfg(windows)]
fn spawn_windows_relaunch_helper(path: &Path) -> std::io::Result<std::process::Child> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let cwd = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let powershell = std::env::var("SystemRoot")
        .map(|r| format!(r"{r}\System32\WindowsPowerShell\v1.0\powershell.exe"))
        .unwrap_or_else(|_| "powershell.exe".into());

    Command::new(powershell)
        .arg("-NoProfile")
        .arg("-WindowStyle")
        .arg("Hidden")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-Command")
        .arg(WINDOWS_RELAUNCH_PS1.trim())
        .env("EUCLIDE_RELAUNCH_PID", std::process::id().to_string())
        .env("EUCLIDE_RELAUNCH_BIN", path.as_os_str())
        .env("EUCLIDE_RELAUNCH_CWD", cwd.as_os_str())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
        .spawn()
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

    #[test]
    fn windows_relaunch_helper_waits_then_starts_from_exe_dir() {
        assert!(WINDOWS_RELAUNCH_PS1.contains("Get-Process -Id $appPid"));
        assert!(WINDOWS_RELAUNCH_PS1.contains("Start-Sleep -Milliseconds 500"));
        assert!(
            WINDOWS_RELAUNCH_PS1.contains("Start-Process -FilePath $bin -WorkingDirectory $cwd")
        );
        assert!(WINDOWS_RELAUNCH_PS1.contains("EUCLIDE_RELAUNCH_PID"));
        assert!(WINDOWS_RELAUNCH_PS1.contains("EUCLIDE_RELAUNCH_CWD"));
        // `$PID` is reserved in PowerShell; a naive `$pid` would be this process, not the app.
        assert!(
            !WINDOWS_RELAUNCH_PS1.contains("$PID") && !WINDOWS_RELAUNCH_PS1.contains("$pid"),
            "must not use PowerShell automatic $PID"
        );
    }
}
