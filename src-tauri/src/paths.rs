use std::fs;
use std::path::PathBuf;

/// Euclide is portable: all data lives in a `Euclide-Data` folder next to the executable
/// so the USB key carries everything. Falls back to the current dir if the
/// executable path cannot be resolved.
pub fn data_dir() -> PathBuf {
    let base = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("Euclide-Data");
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
