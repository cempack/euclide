use std::fs;
use std::path::{Path, PathBuf};

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
    let raw = std::env::var_os("APPIMAGE")?;
    if raw.is_empty() {
        return None;
    }
    PathBuf::from(raw).parent().map(|p| p.to_path_buf())
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
    Some(p)
}

pub fn save_configured_data_dir(dir: &Path) {
    let cfg = serde_json::json!({ "dataDir": dir.to_string_lossy() });
    if let Ok(s) = serde_json::to_string_pretty(&cfg) {
        let _ = fs::write(data_root_config_path(), s);
    }
}

fn intended_data_dir() -> PathBuf {
    load_configured_data_dir().unwrap_or_else(|| exe_dir().join("Euclide-Data"))
}

pub fn dir_is_writable(dir: &Path) -> bool {
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
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn appimage_uses_the_file_directory_not_the_mount() {
        let _g = ENV_LOCK.lock().unwrap();
        let tmp = std::env::temp_dir().join(format!(
            "euclide-appimage-dir-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&tmp).unwrap();
        let image = tmp.join("Euclide.AppImage");
        std::env::set_var("APPIMAGE", &image);
        assert_eq!(exe_dir(), tmp);
        assert_eq!(data_root_config_path(), tmp.join("euclide-data.json"));
        std::env::remove_var("APPIMAGE");
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn dir_is_writable_rejects_a_regular_file() {
        let tmp = std::env::temp_dir().join(format!(
            "euclide-not-a-dir-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&tmp, b"nope").unwrap();
        assert!(!dir_is_writable(&tmp));
        let _ = fs::remove_file(&tmp);
    }

    #[test]
    fn dir_is_writable_accepts_a_normal_folder() {
        let tmp = std::env::temp_dir().join(format!(
            "euclide-writable-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(dir_is_writable(&tmp));
        let _ = fs::remove_dir_all(&tmp);
    }
}
