use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static DATA_DIR_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// The data folder once startup has settled it (see `freeze_data_dir`).
static FROZEN_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

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
    let file = appimage_file()?;
    let dir = file.parent()?.to_path_buf();
    if dir.as_os_str().is_empty() || is_appimage_payload_path(&dir) {
        return None;
    }
    Some(dir)
}

/// The `.AppImage` file the user launched, when we can see it.
pub fn appimage_file() -> Option<PathBuf> {
    if let Some(raw) = std::env::var_os("APPIMAGE") {
        if !raw.is_empty() {
            if let Some(path) = resolve_appimage_path(PathBuf::from(raw)) {
                return Some(path);
            }
        }
    }
    if let Some(raw) = std::env::var_os("ARGV0") {
        let path = PathBuf::from(&raw);
        if looks_like_appimage_filename(&path) {
            if let Some(path) = resolve_appimage_path(path) {
                return Some(path);
            }
        }
    }
    if let Some(raw) = std::env::args_os().next() {
        let path = PathBuf::from(&raw);
        if looks_like_appimage_filename(&path) {
            if let Some(path) = resolve_appimage_path(path) {
                return Some(path);
            }
        }
    }
    None
}

/// The `.AppImage` file (or the real exe). Used after an in-place update so
/// the next launch is not `current_exe()` inside an old squashfs mount.
#[cfg_attr(not(test), allow(dead_code))]
pub fn process_launch_path() -> PathBuf {
    if let Some(path) = appimage_file() {
        return path;
    }
    std::env::current_exe().unwrap_or_else(|_| PathBuf::from("euclide"))
}

fn looks_like_appimage_filename(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.ends_with(".AppImage") || n.ends_with(".appimage"))
        .unwrap_or(false)
}

fn resolve_appimage_path(mut path: PathBuf) -> Option<PathBuf> {
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
    if is_appimage_payload_path(&path) {
        return None;
    }
    Some(path)
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

/// Where the pointer says the data is, best first: `dataDir` (relative to
/// the app's folder when both share a volume), the `absolute` form kept
/// beside it, and on Windows each of them on the app's own drive: a key that
/// comes back as F: still finds the folder an older Euclide wrote as E:\….
/// None without a pointer.
fn pointer_candidates() -> Option<Vec<PathBuf>> {
    let content = fs::read_to_string(data_root_config_path()).ok()?;
    let val: serde_json::Value = serde_json::from_str(&content).ok()?;
    let exe = exe_dir();
    let mut out: Vec<PathBuf> = ["dataDir", "absolute"]
        .iter()
        .filter_map(|key| val.get(key)?.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| {
            let p = PathBuf::from(s);
            if p.is_relative() {
                exe.join(p)
            } else {
                p
            }
        })
        .collect();
    #[cfg(windows)]
    {
        let moved: Vec<PathBuf> = out.iter().filter_map(|p| on_drive_of(p, &exe)).collect();
        out.extend(moved);
    }
    out.retain(|p| !is_appimage_payload_path(p));
    (!out.is_empty()).then_some(out)
}

/// If a config exists and is valid, returns the (resolved) data root folder
/// chosen by the user: the first of the pointer's forms that exists.
fn load_configured_data_dir() -> Option<PathBuf> {
    let mut candidates = pointer_candidates()?;
    let found = candidates.iter().position(|p| p.is_dir()).unwrap_or(0);
    Some(candidates.swap_remove(found))
}

/// A pointer whose folder is nowhere: the key came back under another
/// letter, or the folder was moved. Creating it empty would look like lost
/// data, so startup asks instead (`ask_for_missing_data_dir`).
fn missing_configured_data_dir() -> Option<PathBuf> {
    let candidates = pointer_candidates()?;
    if candidates.iter().any(|p| p.is_dir()) {
        return None;
    }
    candidates.into_iter().next()
}

/// `path` on the drive (or share) of `anchor`: `E:\Profs\Euclide-Data` for an
/// app now in `F:\Euclide` gives `F:\Profs\Euclide-Data`.
#[cfg(windows)]
fn on_drive_of(path: &Path, anchor: &Path) -> Option<PathBuf> {
    let mut parts = path.components();
    let Some(std::path::Component::Prefix(_)) = parts.next() else {
        return None;
    };
    let Some(prefix @ std::path::Component::Prefix(_)) = anchor.components().next() else {
        return None;
    };
    let moved: PathBuf = std::iter::once(prefix).chain(parts).collect();
    (moved != path).then_some(moved)
}

fn same_component(a: &std::path::Component, b: &std::path::Component) -> bool {
    if cfg!(windows) {
        // NTFS and FAT ignore case.
        a.as_os_str().eq_ignore_ascii_case(b.as_os_str())
    } else {
        a == b
    }
}

/// `target` seen from `base`, both absolute and on the same root: `..` up
/// to what they share, then down. None across drives.
fn relative_path(base: &Path, target: &Path) -> Option<PathBuf> {
    if !base.is_absolute() || !target.is_absolute() {
        return None;
    }
    let base: Vec<_> = base.components().collect();
    let target: Vec<_> = target.components().collect();
    let shared = base
        .iter()
        .zip(&target)
        .take_while(|(a, b)| same_component(a, b))
        .count();
    // Not even the drive (or the root) in common.
    if shared == 0 || (cfg!(windows) && shared < 2) {
        return None;
    }
    let mut rel = PathBuf::new();
    for _ in shared..base.len() {
        rel.push("..");
    }
    for part in &target[shared..] {
        rel.push(part.as_os_str());
    }
    if rel.as_os_str().is_empty() {
        rel.push(".");
    }
    Some(rel)
}

/// Whether `a` and `b` (existing folders) are on one volume: the same USB
/// key, which may come back under another drive letter or mount point.
fn same_volume(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        matches!((fs::metadata(a), fs::metadata(b)), (Ok(x), Ok(y)) if x.dev() == y.dev())
    }
    #[cfg(not(unix))]
    {
        // Windows: the same drive letter (or share), which relative_path checks.
        let _ = (a, b);
        true
    }
}

/// Startup picker: the database is not open yet, so this process switches to
/// the chosen folder right away and the pointer remembers it for next time.
pub fn save_configured_data_dir(dir: &Path) {
    set_data_dir_override(dir.to_path_buf());
    let _ = write_data_dir_pointer(dir);
}

/// Settings: only write the pointer. The running process keeps its folder
/// (the database is open there); the new one is used after a restart.
///
/// On the app's volume, `dataDir` is relative to the app's folder, so the
/// key finds its data under any drive letter; older versions read it too.
/// `absolute` stays beside it for an app moved away from its data.
pub fn write_data_dir_pointer(dir: &Path) -> std::io::Result<()> {
    let exe = exe_dir();
    let absolute = dir.to_string_lossy().to_string();
    let cfg = match relative_path(&exe, dir).filter(|_| same_volume(&exe, dir)) {
        Some(rel) => serde_json::json!({ "dataDir": rel.to_string_lossy(), "absolute": absolute }),
        None => serde_json::json!({ "dataDir": absolute }),
    };
    let s = serde_json::to_string_pretty(&cfg).map_err(std::io::Error::other)?;
    fs::write(data_root_config_path(), s)
}

/// Settings: go back to the default folder at the next launch.
pub fn remove_data_dir_pointer() -> std::io::Result<()> {
    match fs::remove_file(data_root_config_path()) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
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
    if let Some(dir) = FROZEN_DATA_DIR.get() {
        return dir.clone();
    }
    let dir = intended_data_dir();
    ensure_subdirs(&dir);
    dir
}

/// Settle the data folder for the rest of the process, once startup has
/// checked it is writable. Every later `data_dir()` is a plain clone instead
/// of re-reading euclide-data.json and creating four folders on each call.
pub fn freeze_data_dir() -> PathBuf {
    FROZEN_DATA_DIR
        .get_or_init(|| {
            let dir = intended_data_dir();
            ensure_subdirs(&dir);
            dir
        })
        .clone()
}

/// Make sure Euclide-Data can actually be written. If the folder next to the app is
/// read-only (typical AppImage squashfs if `$APPIMAGE` is missing, or a locked USB),
/// ask the user for permission via a native dialog instead of silently relocating.
///
/// Returns `false` if the user refuses; the caller should exit without panicking.
pub fn ensure_writable_data_dir() -> bool {
    if data_dir_override().is_none() {
        if let Some(missing) = missing_configured_data_dir() {
            if !ask_for_missing_data_dir(&missing) {
                return false;
            }
        }
    }
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

const FIND_FOLDER: &str = "Choisir le dossier…";
const USE_DEFAULT: &str = "Utiliser Euclide-Data";

/// The folder the teacher chose for the data is not there. Never created
/// empty (that would look like lost data): the teacher shows where it is,
/// goes back to Euclide-Data beside the app, or quits.
fn ask_for_missing_data_dir(missing: &Path) -> bool {
    let msg = format!(
        "Le dossier des données d'Euclide est introuvable :\n{}\n\nLa clé a peut-être changé de lettre, ou le dossier a été déplacé. Indiquez où il se trouve, ou utilisez le dossier Euclide-Data à côté d'Euclide.",
        missing.display()
    );
    let choice = rfd::MessageDialog::new()
        .set_title("Euclide")
        .set_level(rfd::MessageLevel::Warning)
        .set_description(&msg)
        .set_buttons(rfd::MessageButtons::YesNoCancelCustom(
            FIND_FOLDER.into(),
            USE_DEFAULT.into(),
            "Quitter".into(),
        ))
        .show();
    let find = match choice {
        rfd::MessageDialogResult::Custom(label) if label == FIND_FOLDER => true,
        rfd::MessageDialogResult::Yes => true,
        rfd::MessageDialogResult::Custom(label) if label == USE_DEFAULT => false,
        rfd::MessageDialogResult::No => false,
        _ => return false,
    };
    if !find {
        return remove_data_dir_pointer().is_ok();
    }
    let Some(picked) = rfd::FileDialog::new()
        .set_title("Dossier des données d'Euclide")
        .pick_folder()
    else {
        return false;
    };
    if !dir_is_writable(&picked) {
        return false;
    }
    save_configured_data_dir(&picked);
    true
}

fn dialog_ok(res: rfd::MessageDialogResult) -> bool {
    match res {
        rfd::MessageDialogResult::Cancel | rfd::MessageDialogResult::No => false,
        rfd::MessageDialogResult::Custom(label) if label == "Quitter" => false,
        _ => true,
    }
}

/// `Euclide-Sauvegardes/`, next to the data folder (on the key, but outside
/// what a backup archives).
pub fn backups_dir() -> PathBuf {
    let data = data_dir();
    data.parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| data.clone())
        .join("Euclide-Sauvegardes")
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

/// Tests that touch files run against a fresh data folder of their own.
/// Holds the environment lock until dropped.
#[cfg(test)]
pub(crate) fn temp_data_dir(name: &str) -> TempDataDir {
    let guard = TEST_ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    // The data folder one level down: its Euclide-Sauvegardes beside it is
    // this test's own too.
    let root = std::env::temp_dir().join(format!("euclide-test-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let dir = root.join("Euclide-Data");
    fs::create_dir_all(&dir).unwrap();
    set_data_dir_override(dir.clone());
    ensure_subdirs(&dir);
    TempDataDir {
        dir: root,
        _guard: guard,
    }
}

#[cfg(test)]
pub(crate) struct TempDataDir {
    dir: PathBuf,
    _guard: std::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl Drop for TempDataDir {
    fn drop(&mut self) {
        if let Ok(mut g) = DATA_DIR_OVERRIDE.lock() {
            *g = None;
        }
        let _ = fs::remove_dir_all(&self.dir);
    }
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
        assert_eq!(process_launch_path(), image);
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

    /// The app as if it ran from `dir` (an AppImage there), for the pointer.
    fn app_in(dir: &Path) {
        std::env::set_var("APPIMAGE", dir.join("Euclide.AppImage"));
    }

    #[test]
    fn a_chosen_folder_is_found_wherever_the_key_is_mounted() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPDIR");

        let key = unique("euclide-key-e");
        let data = key.join("Profs").join("Euclide-Data");
        fs::create_dir_all(&data).unwrap();
        app_in(&key);
        write_data_dir_pointer(&data).unwrap();
        let cfg: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(data_root_config_path()).unwrap()).unwrap();
        assert_eq!(
            Path::new(cfg["dataDir"].as_str().unwrap()),
            Path::new("Profs").join("Euclide-Data")
        );
        assert_eq!(Path::new(cfg["absolute"].as_str().unwrap()), data);
        assert_eq!(intended_data_dir(), data);

        // The same key, mounted elsewhere (another drive letter on Windows).
        let moved = unique("euclide-key-f");
        fs::rename(&key, &moved).unwrap();
        app_in(&moved);
        assert_eq!(
            intended_data_dir(),
            moved.join("Profs").join("Euclide-Data")
        );
        assert_eq!(missing_configured_data_dir(), None);

        restore("APPIMAGE", prev_app);
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&moved);
        clear_override();
    }

    #[test]
    fn a_missing_folder_is_reported_not_created() {
        let _g = TEST_ENV_LOCK.lock().unwrap();
        clear_override();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_appdir = std::env::var_os("APPDIR");
        std::env::remove_var("APPDIR");

        let app = unique("euclide-app");
        fs::create_dir_all(&app).unwrap();
        app_in(&app);
        let gone = unique("euclide-gone").join("Euclide-Data");
        fs::write(
            data_root_config_path(),
            serde_json::json!({ "dataDir": gone.to_string_lossy() }).to_string(),
        )
        .unwrap();
        assert_eq!(missing_configured_data_dir(), Some(gone.clone()));
        assert_eq!(intended_data_dir(), gone);
        assert!(!gone.exists());
        // No pointer at all: the default folder, nothing missing.
        remove_data_dir_pointer().unwrap();
        assert_eq!(missing_configured_data_dir(), None);
        assert_eq!(intended_data_dir(), app.join("Euclide-Data"));

        restore("APPIMAGE", prev_app);
        restore("APPDIR", prev_appdir);
        let _ = fs::remove_dir_all(&app);
        clear_override();
    }

    #[cfg(unix)]
    #[test]
    fn relative_paths_go_up_to_what_they_share() {
        let rel = |a: &str, b: &str| relative_path(Path::new(a), Path::new(b));
        assert_eq!(
            rel("/media/key/app", "/media/key/Euclide-Data"),
            Some("../Euclide-Data".into())
        );
        assert_eq!(
            rel("/media/key", "/media/key/Euclide-Data"),
            Some("Euclide-Data".into())
        );
        assert_eq!(rel("/media/key", "/media/key"), Some(".".into()));
        assert_eq!(rel("media/key", "/media/key"), None);
    }

    #[cfg(windows)]
    #[test]
    fn relative_paths_stay_on_one_drive() {
        let rel = |a: &str, b: &str| relative_path(Path::new(a), Path::new(b));
        assert_eq!(
            rel(r"E:\Euclide", r"E:\Profs\Euclide-Data"),
            Some(r"..\Profs\Euclide-Data".into())
        );
        assert_eq!(
            rel(r"E:\Euclide", r"e:\euclide\Euclide-Data"),
            Some("Euclide-Data".into())
        );
        assert_eq!(rel(r"E:\Euclide", r"F:\Euclide-Data"), None);
        assert_eq!(
            on_drive_of(
                Path::new(r"E:\Profs\Euclide-Data"),
                Path::new(r"F:\Euclide")
            ),
            Some(PathBuf::from(r"F:\Profs\Euclide-Data"))
        );
        assert_eq!(
            on_drive_of(Path::new(r"F:\Data"), Path::new(r"F:\Euclide")),
            None
        );
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
