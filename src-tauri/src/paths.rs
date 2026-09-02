use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static DATA_DIR_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

#[cfg(test)]
pub(crate) static TEST_ENV_LOCK: Mutex<()> = Mutex::new(());

/// Directory that contains the Euclide the user launched (USB / Downloads / next to the .exe).
///
/// AppImage mounts the payload read-only under `/tmp/.mount_*`. `current_exe()` points
/// inside that mount, so "next to the binary" is not writable. `$APPIMAGE` is the actual
/// `.AppImage` file; data must live next to that file, not inside the squashfs.
pub fn exe_dir() -> PathBuf {
    if let Some(dir) = appimage_file_dir() {
        return dir;
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn appimage_file_dir() -> Option<PathBuf> {
    if let Some(raw) = std::env::var_os("APPIMAGE") {
        if !raw.is_empty() {
            if let Some(dir) = parent_if_not_payload(PathBuf::from(raw)) {
                return Some(dir);
            }
        }
    }
    if let Some(raw) = std::env::var_os("ARGV0") {
        let path = PathBuf::from(&raw);
        if looks_like_appimage_filename(&path) {
            if let Some(dir) = parent_if_not_payload(path) {
                return Some(dir);
            }
        }
    }
    if let Some(raw) = std::env::args_os().next() {
        let path = PathBuf::from(&raw);
        if looks_like_appimage_filename(&path) {
            if let Some(dir) = parent_if_not_payload(path) {
                return Some(dir);
            }
        }
    }
    None
}

fn looks_like_appimage_filename(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.ends_with(".AppImage") || n.ends_with(".appimage"))
        .unwrap_or(false)
}

fn parent_if_not_payload(mut path: PathBuf) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }
    if path.is_relative() {
        if let Some(owd) = std::env::var_os("OWD") {
            path = PathBuf::from(owd).join(&path);
        } else if let Ok(cwd) = std::env::current_dir() {
            path = cwd.join(path);
        }
    }
    let dir = path.parent()?.to_path_buf();
    if dir.as_os_str().is_empty() || is_appimage_payload_path(&dir) {
        return None;
    }
    Some(dir)
}

/// True for the squashfs / AppDir payload (never a place to put `Euclide-Data`).
pub(crate) fn is_appimage_payload_path(path: &Path) -> bool {
    if path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with(".mount_") || s == "squashfs-root"
    }) {
        return true;
    }
    if let Ok(appdir) = std::env::var("APPDIR") {
        if !appdir.is_empty() {
            let appdir = PathBuf::from(&appdir);
            if path.starts_with(&appdir) {
                return true;
            }
        }
    }
    false
}

/// Path to the small portable config file that stores the user-chosen data root.
/// Lives next to the application so the whole setup stays USB-portable.
pub fn data_root_config_path() -> PathBuf {
    exe_dir().join("euclide-data.json")
}

/// If a config exists and is valid, returns the (resolved) data root folder chosen by the user.
/// Supports absolute paths and paths relative to the exe dir (for max USB portability).
fn load_configured_data_dir() -> Option<PathBuf> {
    let cfg_path = data_root_config_path();
    let content = fs::read_to_string(cfg_path).ok()?;
    let val: serde_json::Value = serde_json::from_str(&content).ok()?;
    let s = val.get("dataDir")?.as_str()?;
    let mut p = PathBuf::from(s);
    if p.is_relative() {
        p = exe_dir().join(p);
    }
    if is_appimage_payload_path(&p) {
        return None;
    }
    Some(p)
}

pub fn save_configured_data_dir(dir: &Path) {
    set_data_dir_override(dir.to_path_buf());
    let cfg = serde_json::json!({ "dataDir": dir.to_string_lossy() });
    if let Ok(s) = serde_json::to_string_pretty(&cfg) {
        let _ = fs::write(data_root_config_path(), s);
    }
}

pub fn clear_configured_data_dir() {
    if let Ok(mut guard) = DATA_DIR_OVERRIDE.lock() {
        *guard = None;
    }
    let _ = fs::remove_file(data_root_config_path());
}

fn set_data_dir_override(dir: PathBuf) {
    if let Ok(mut guard) = DATA_DIR_OVERRIDE.lock() {
        *guard = Some(dir);
    }
}

fn data_dir_override() -> Option<PathBuf> {
    DATA_DIR_OVERRIDE.lock().ok().and_then(|g| g.clone())
}

pub(crate) fn intended_data_dir() -> PathBuf {
    if let Some(dir) = data_dir_override() {
        return dir;
    }
    load_configured_data_dir().unwrap_or_else(|| exe_dir().join("Euclide-Data"))
}

pub fn dir_is_writable(dir: &Path) -> bool {
    if is_appimage_payload_path(dir) {
        return false;
    }
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".euclide-write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

fn ensure_subdirs(dir: &Path) {
    let _ = fs::create_dir_all(dir.join("courses"));
    let _ = fs::create_dir_all(dir.join("documents"));
    let _ = fs::create_dir_all(dir.join("whiteboards"));
    let _ = fs::create_dir_all(dir.join("python"));
}

/// Euclide is portable: all data lives under a single root folder (euclide.db + courses/ + documents/ + ...).
/// Default (no config): a folder named `Euclide-Data` next to the application (classic USB-key behavior).
/// User can override via Settings → choose any folder; the pointer is stored in euclide-data.json next to the app.
pub fn data_dir() -> PathBuf {
    let dir = intended_data_dir();
    ensure_subdirs(&dir);
    dir
}

/// Make sure Euclide-Data can actually be written. If the folder next to the app is
/// read-only (typical AppImage squashfs if `$APPIMAGE` is missing, or a locked USB),
/// ask the user for permission via a native dialog instead of silently relocating.
///
/// Returns `false` if the user refuses; the caller should exit without panicking.
pub fn ensure_writable_data_dir() -> bool {
    let dir = intended_data_dir();
    if dir_is_writable(&dir) {
        ensure_subdirs(&dir);
        return true;
    }
    ask_permission_for_data_dir(&dir)
}

fn ask_permission_for_data_dir(failed: &Path) -> bool {
    let msg = format!(
        "Euclide n'a pas l'autorisation d'écrire à côté de l'application :\n{}\n\nChoisissez un dossier pour y créer Euclide-Data.",
        failed.display()
    );
    let proceed = rfd::MessageDialog::new()
        .set_title("Euclide")
        .set_level(rfd::MessageLevel::Warning)
        .set_description(&msg)
        .set_buttons(rfd::MessageButtons::OkCancelCustom(
            "Choisir un dossier".into(),
            "Quitter".into(),
        ))
        .show();
    if !dialog_ok(proceed) {
        return false;
    }
    loop {
        let Some(picked) = rfd::FileDialog::new()
            .set_title("Dossier pour Euclide-Data")
            .pick_folder()
        else {
            return false;
        };
        let dir = if picked.file_name().and_then(|n| n.to_str()) == Some("Euclide-Data") {
            picked
        } else {
            picked.join("Euclide-Data")
        };
        if dir_is_writable(&dir) {
            save_configured_data_dir(&dir);
            ensure_subdirs(&dir);
            return true;
        }
        let again = rfd::MessageDialog::new()
            .set_title("Euclide")
            .set_level(rfd::MessageLevel::Warning)
            .set_description("Ce dossier n'est pas accessible en écriture. En choisir un autre ?")
            .set_buttons(rfd::MessageButtons::OkCancelCustom(
                "Choisir un dossier".into(),
                "Quitter".into(),
            ))
            .show();
        if !dialog_ok(again) {
            return false;
        }
    }
}

fn dialog_ok(res: rfd::MessageDialogResult) -> bool {
    match res {
        rfd::MessageDialogResult::Cancel | rfd::MessageDialogResult::No => false,
        rfd::MessageDialogResult::Custom(label) if label == "Quitter" => false,
        _ => true,
    }
}

pub fn db_path() -> PathBuf {
    data_dir().join("euclide.db")
}

pub fn courses_dir() -> PathBuf {
    data_dir().join("courses")
}

pub fn documents_dir() -> PathBuf {
    data_dir().join("documents")
}

pub fn whiteboards_dir() -> PathBuf {
    data_dir().join("whiteboards")
}

pub fn python_dir() -> PathBuf {
    data_dir().join("python")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn restore(key: &str, prev: Option<OsString>) {
        match prev {
            Some(v) => std::env::set_var(key, v),
            None => std::env::remove_var(key),
        }
    }

    fn unique(prefix: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "{prefix}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn clear_override() {
        if let Ok(mut g) = DATA_DIR_OVERRIDE.lock() {
            *g = None;
        }
    }

    #[test]
    fn appimage_uses_the_file_directory_not_the_mount() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_argv = std::env::var_os("ARGV0");
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("ARGV0");
        std::env::remove_var("APPDIR");

        let tmp = unique("euclide-appimage-dir");
        fs::create_dir_all(&tmp).unwrap();
        let image = tmp.join("Euclide.AppImage");
        std::env::set_var("APPIMAGE", &image);
        assert_eq!(exe_dir(), tmp);
        assert_eq!(data_root_config_path(), tmp.join("euclide-data.json"));
        assert!(!is_appimage_payload_path(&tmp.join("Euclide-Data")));

        restore("APPIMAGE", prev_app);
        restore("ARGV0", prev_argv);
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&tmp);
        clear_override();
    }

    #[test]
    fn argv0_appimage_is_used_when_appimage_env_is_missing() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_argv = std::env::var_os("ARGV0");
        let prev_owd = std::env::var_os("OWD");
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPIMAGE");
        std::env::remove_var("APPDIR");
        std::env::remove_var("OWD");

        let tmp = unique("euclide-argv0-appimage");
        fs::create_dir_all(&tmp).unwrap();
        std::env::set_var("ARGV0", tmp.join("Euclide.AppImage"));
        assert_eq!(exe_dir(), tmp);

        restore("APPIMAGE", prev_app);
        restore("ARGV0", prev_argv);
        restore("OWD", prev_owd);
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&tmp);
        clear_override();
    }

    #[test]
    fn payload_paths_are_never_writable() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPDIR");

        let mount = PathBuf::from("/tmp/.mount_EuclideTEST/usr/bin/Euclide-Data");
        assert!(is_appimage_payload_path(&mount));
        assert!(!dir_is_writable(&mount));

        let extracted = PathBuf::from("/tmp/squashfs-root/usr/bin/Euclide-Data");
        assert!(is_appimage_payload_path(&extracted));
        assert!(!dir_is_writable(&extracted));

        restore("APPDIR", prev_appdir);
    }

    #[test]
    fn appdir_payload_is_rejected_even_if_the_folder_is_writable() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_appdir = std::env::var_os("APPDIR");
        let tmp = unique("euclide-appdir-payload");
        fs::create_dir_all(&tmp).unwrap();
        std::env::set_var("APPDIR", &tmp);
        let data = tmp.join("usr/bin/Euclide-Data");
        assert!(is_appimage_payload_path(&data));
        assert!(
            !dir_is_writable(&data),
            "must not create Euclide-Data inside APPDIR even when it is writable"
        );
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&tmp);
        clear_override();
    }

    #[test]
    fn override_survives_a_failed_config_write() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPIMAGE");
        std::env::remove_var("APPDIR");

        let picked = unique("euclide-picked-data");
        fs::create_dir_all(&picked).unwrap();
        // Simulate: pointer cannot be saved next to the app, but this process
        // must still open euclide.db in the folder the user just chose.
        set_data_dir_override(picked.clone());
        assert_eq!(intended_data_dir(), picked);

        restore("APPIMAGE", prev_app);
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&picked);
        clear_override();
    }

    #[test]
    fn configured_payload_path_is_ignored() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPDIR");

        let tmp = unique("euclide-cfg-payload");
        fs::create_dir_all(&tmp).unwrap();
        let image = tmp.join("Euclide.AppImage");
        std::env::set_var("APPIMAGE", &image);
        let cfg = tmp.join("euclide-data.json");
        fs::write(
            &cfg,
            r#"{"dataDir":"/tmp/.mount_EuclideTEST/usr/bin/Euclide-Data"}"#,
        )
        .unwrap();
        assert_eq!(intended_data_dir(), tmp.join("Euclide-Data"));

        restore("APPIMAGE", prev_app);
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&tmp);
        clear_override();
    }

    #[test]
    fn dir_is_writable_rejects_a_regular_file() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPDIR");
        let tmp = unique("euclide-not-a-dir");
        fs::write(&tmp, b"nope").unwrap();
        assert!(!dir_is_writable(&tmp));
        let _ = fs::remove_file(&tmp);
        restore("APPDIR", prev_appdir);
    }

    #[test]
    fn dir_is_writable_accepts_a_normal_folder() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPDIR");
        let tmp = unique("euclide-writable");
        assert!(dir_is_writable(&tmp));
        let _ = fs::remove_dir_all(&tmp);
        restore("APPDIR", prev_appdir);
    }
}
