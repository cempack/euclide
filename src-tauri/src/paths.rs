use std::fs;
use std::path::PathBuf;

/// Returns the directory containing the Euclide executable (or current dir as fallback).
/// Used both for the default data location and for the portable config file.
pub fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Path to the small portable config file that stores the user-chosen data root.
/// Lives next to the executable so the whole setup (exe + sidecar + config pointer) stays USB-portable.
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

/// Euclide is portable: all data lives under a single root folder (euclide.db + courses/ + documents/ + ...).
/// Default (no config): a folder named `Euclide-Data` next to the executable (classic USB-key behavior).
/// User can override via Settings → choose any folder; the pointer is stored in euclide-data.json next to the exe.
/// All sub-directories are ensured on every call (safe, cheap).
pub fn data_dir() -> PathBuf {
    let configured = load_configured_data_dir();
    let dir = configured.unwrap_or_else(|| exe_dir().join("Euclide-Data"));
    let _ = fs::create_dir_all(dir.join("courses"));
    let _ = fs::create_dir_all(dir.join("documents"));
    let _ = fs::create_dir_all(dir.join("whiteboards"));
    let _ = fs::create_dir_all(dir.join("python"));
    dir
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
