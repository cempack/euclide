//! File-system helpers shared by the commands: paths inside the data folder,
//! safe names, atomic writes.

use crate::error::{AppError, AppResult};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

/// Document kind shown in the UI, from the file extension.
pub fn kind_from_ext(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "euboard" => "board",
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => "image",
        "doc" | "docx" | "odt" | "txt" | "md" | "rtf" => "doc",
        "xls" | "xlsx" | "ods" | "csv" => "sheet",
        "ppt" | "pptx" | "odp" => "slides",
        _ => "file",
    }
}

/// Path relative to the data folder, stored so the key stays portable.
/// Always written with `/`: a key filled on Windows must open on Linux/macOS.
pub fn rel_path(abs: &Path) -> String {
    let base = crate::paths::data_dir();
    abs.strip_prefix(&base)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| abs.to_string_lossy().to_string())
}

/// Absolute path of a stored relative path. Refuses anything that would
/// leave the data folder (`..`, absolute paths, drive letters).
pub fn abs_path(rel: &str) -> AppResult<PathBuf> {
    let rel = rel.replace('\\', "/");
    let path = Path::new(&rel);
    let inside = path
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir));
    // A drive letter (« C: ») is a normal component on Linux: refuse it explicitly.
    if !inside || rel.is_empty() || rel.contains(':') {
        return Err(AppError::user("Chemin de fichier invalide."));
    }
    Ok(crate::paths::data_dir().join(path))
}

/// A bare file name chosen by the user or the backend: no folders, no `..`,
/// nothing absolute, no drive letter.
pub fn plain_file_name(name: &str) -> AppResult<&str> {
    let ok = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':'])
        && Path::new(name).file_name() == Some(std::ffi::OsStr::new(name));
    if ok {
        Ok(name)
    } else {
        Err(AppError::user(
            "Le nom ne peut pas contenir « / », « \\ » ni « : ».",
        ))
    }
}

/// `dir/name`, or `dir/name (1)`, `dir/name (2)`… when it is taken.
pub fn unique_dest(dir: &Path, name: &str) -> PathBuf {
    let dest = dir.join(name);
    if !dest.exists() {
        return dest;
    }
    let p = Path::new(name);
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| name.to_string());
    let ext = p
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    (1..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|candidate| !candidate.exists())
        .expect("an unused name always exists")
}

/// Write `bytes` to a temporary file next to `path`, flushed to disk. Returns
/// the temporary path; the caller renames it into place.
pub fn write_temp_beside(path: &Path, bytes: &[u8]) -> AppResult<PathBuf> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::user("Chemin de fichier invalide."))?;
    fs::create_dir_all(dir)?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let tmp = dir.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4().simple()));
    let mut f = fs::File::create(&tmp)?;
    let written = f.write_all(bytes).and_then(|_| f.sync_all());
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(tmp)
}

/// Replace `path` with `bytes` without ever leaving a half-written file: if
/// the key is pulled out mid-save, either the old or the new content remains.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = write_temp_beside(path, bytes)?;
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// `%`-decoding (names sent in headers, paths of `eufile://` URLs).
pub fn percent_decode(s: &str) -> AppResult<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let decoded = (bytes[i] == b'%' && i + 2 < bytes.len())
            .then(|| std::str::from_utf8(&bytes[i + 1..i + 3]).ok())
            .flatten()
            .and_then(|hex| u8::from_str_radix(hex, 16).ok());
        match decoded {
            Some(b) => {
                out.push(b);
                i += 3;
            }
            None => {
                out.push(bytes[i]);
                i += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|_| AppError::user("Nom de fichier invalide."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_names_only() {
        for ok in [
            "cours.pdf",
            "Théorème de Pythagore.pdf",
            "a..b.txt",
            ".hidden",
        ] {
            assert!(plain_file_name(ok).is_ok(), "{ok} should be accepted");
        }
        for bad in [
            "",
            ".",
            "..",
            "../x.pdf",
            "a/b.pdf",
            "a\\b.pdf",
            "/etc/passwd",
            "C:\\x.dll",
            "C:x",
        ] {
            assert!(plain_file_name(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn stored_paths_cannot_escape_the_data_folder() {
        assert!(abs_path("documents/cours.pdf").is_ok());
        assert!(abs_path(r"courses\1\cours.pdf").is_ok());
        for bad in [
            "",
            "../secret",
            "documents/../../x",
            "/etc/passwd",
            r"C:\Windows\x",
        ] {
            assert!(abs_path(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn unique_dest_and_atomic_write() {
        let dir = std::env::temp_dir().join(format!("euclide-fsx-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let first = unique_dest(&dir, "cours.pdf");
        atomic_write(&first, b"one").unwrap();
        let second = unique_dest(&dir, "cours.pdf");
        assert_eq!(second.file_name().unwrap(), "cours (1).pdf");
        atomic_write(&first, b"two").unwrap();
        assert_eq!(fs::read(&first).unwrap(), b"two");
        // No temporary file is left behind.
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&dir);
    }
}
