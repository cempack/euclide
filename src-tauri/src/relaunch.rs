//! After an update: the new version starts, then this one quits. The new
//! process is told which one it replaces (`--after-update <pid>`) and waits
//! for it to be gone before anything else: the single-instance check would
//! hand the launch over to the old process otherwise, and the Python module
//! an update staged is swapped only once no Python of the old one runs.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

const AFTER_UPDATE: &str = "--after-update";
/// Quitting writes the database back on the key: a few seconds at worst.
const PREDECESSOR_WAIT: Duration = Duration::from_secs(15);

/// The process a launch replaces, from `--after-update <pid>`.
fn predecessor(args: impl IntoIterator<Item = OsString>) -> Option<u32> {
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg == AFTER_UPDATE {
            return args.next()?.to_str()?.parse().ok();
        }
    }
    None
}

/// First thing in `run()`: a launch by an update waits (15 s at most) for
/// the version it replaces to have quit. Returns how long, for perf.log
/// (written once the data folder is settled).
pub fn wait_for_predecessor() -> Option<Duration> {
    let pid = predecessor(std::env::args_os()).filter(|&pid| pid != std::process::id())?;
    let started = Instant::now();
    wait_for_exit(pid, PREDECESSOR_WAIT);
    Some(started.elapsed())
}

#[cfg(windows)]
fn wait_for_exit(pid: u32, timeout: Duration) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
    };
    // SAFETY: plain Win32 calls on a handle this function opens and closes.
    unsafe {
        let process = OpenProcess(PROCESS_SYNCHRONIZE, 0, pid);
        if process.is_null() {
            return; // already gone
        }
        let ms = u32::try_from(timeout.as_millis()).unwrap_or(u32::MAX);
        WaitForSingleObject(process, ms);
        CloseHandle(process);
    }
}

#[cfg(not(windows))]
fn wait_for_exit(pid: u32, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while alive(pid) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Exited and not yet reaped by its parent (a zombie) counts as gone.
#[cfg(target_os = "linux")]
fn alive(pid: u32) -> bool {
    std::fs::read_to_string(format!("/proc/{pid}/stat"))
        .map(|stat| match stat.rsplit_once(')') {
            Some((_, rest)) => !rest.trim_start().starts_with('Z'),
            None => true,
        })
        .unwrap_or(false)
}

#[cfg(all(unix, not(target_os = "linux")))]
fn alive(pid: u32) -> bool {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return false;
    };
    // SAFETY: signal 0 only asks whether the process exists.
    unsafe { libc::kill(pid, 0) == 0 }
}

/// What to start: the USB copy's euclide.exe (replaced in place by the
/// update), the AppImage file, or this binary (macOS).
fn launch_target() -> PathBuf {
    #[cfg(windows)]
    if crate::portable_update::is_windows_portable() {
        return crate::paths::exe_dir().join("euclide.exe");
    }
    crate::paths::process_launch_path()
}

fn spawn_replacement(target: &Path) -> std::io::Result<()> {
    let mut command = std::process::Command::new(target);
    command
        .arg(AFTER_UPDATE)
        .arg(std::process::id().to_string())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    if let Some(dir) = target.parent() {
        command.current_dir(dir);
    }
    // The AppImage runtime sets these for the image it mounts: the new
    // image is another one.
    for var in ["APPIMAGE", "APPDIR", "ARGV0", "OWD"] {
        command.env_remove(var);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command.spawn().map(drop)
}

/// Once the update is in place and the page has saved everything: Python
/// stops, the new version starts, and this one quits. An error leaves this
/// version running; the update applies at the next opening.
#[tauri::command]
pub async fn relaunch_after_update(app: AppHandle) -> Result<(), String> {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let target = launch_target();
    if !target.is_file() {
        STARTED.store(false, Ordering::SeqCst);
        return Err(format!("{} introuvable.", target.display()));
    }
    let handle = app.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        if let Some(runner) = handle.try_state::<crate::runner::Runner>() {
            runner.shutdown(Duration::from_millis(500));
        }
        if let Some(sc) = handle.try_state::<crate::sidecar::Sidecar>() {
            sc.shutdown(Duration::from_secs(1));
        }
    })
    .await;
    if let Err(e) = spawn_replacement(&target) {
        STARTED.store(false, Ordering::SeqCst);
        crate::applog::warn(format!("[update] relaunch of {}: {e}", target.display()));
        return Err(format!("Impossible de relancer Euclide : {e}"));
    }
    crate::exit::quit(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    #[test]
    fn a_launch_by_an_update_names_the_process_it_replaces() {
        assert_eq!(
            predecessor(args(&["euclide.exe", "--after-update", "4242"])),
            Some(4242)
        );
        assert_eq!(predecessor(args(&["euclide.exe"])), None);
        assert_eq!(predecessor(args(&["euclide.exe", "--after-update"])), None);
        assert_eq!(
            predecessor(args(&["euclide.exe", "--after-update", "x"])),
            None
        );
    }

    #[test]
    fn waiting_ends_when_the_old_version_has_quit() {
        let mut child = std::process::Command::new(if cfg!(windows) { "cmd" } else { "sh" })
            .args(if cfg!(windows) {
                ["/C", "ping -n 2 127.0.0.1 >NUL"]
            } else {
                ["-c", "sleep 0.3"]
            })
            .spawn()
            .unwrap();
        let pid = child.id();
        // Reaped as soon as it exits, as the old version's parent would.
        let reaper = std::thread::spawn(move || child.wait());
        let started = Instant::now();
        wait_for_exit(pid, Duration::from_secs(10));
        assert!(started.elapsed() < Duration::from_secs(5));
        reaper.join().unwrap().unwrap();
        // Gone already: no wait at all.
        let started = Instant::now();
        wait_for_exit(pid, Duration::from_secs(10));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[cfg(windows)]
    #[test]
    fn the_usb_copy_is_relaunched_by_a_plain_path() {
        // Tauri's own restart canonicalizes to \\?\C:\…, which exe_dir()
        // and the Python module's paths do not expect.
        let target = crate::paths::exe_dir().join("euclide.exe");
        assert!(!target.to_string_lossy().starts_with(r"\\?\"));
    }
}
