//! Automatic backups.
//!
//! On the key itself (`Euclide-Sauvegardes/`, next to the data folder):
//! - a daily snapshot of the database (`auto/AAAA-MM-JJ.db`), keeping the last
//!   7 days and one per week for 4 weeks;
//! - deleted documents, kept 30 days in `corbeille/` (see `trash`).
//!
//! A key can die, so the teacher can also pick a folder outside it (on the PC,
//! or a synced folder): whenever that folder is reachable, it receives a full
//! mirror of the data folder, at most once a day, copying only what changed.
//!
//! Restoring a snapshot cannot happen while the database is open: it is
//! scheduled and applied at the next launch, before the database opens. The
//! snapshot is copied and checked first; only then does the database in use
//! move aside (never deleted), and it comes back if anything fails.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use chrono::{Datelike, Local, NaiveDate};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

const DAILY_KEPT: usize = 7;
const WEEKLY_KEPT: usize = 4;
const TRASH_DAYS: u64 = 30;
/// Settings keys (Rust side only).
pub const EXTERNAL_DIR_KEY: &str = "backup_external_dir";
const LAST_MIRROR_KEY: &str = "backup_last_mirror";

/// Result of the startup integrity check, for the Settings screen.
#[derive(Default)]
pub struct Health(Mutex<Option<String>>);

/// What this launch's restore did, for the Settings screen.
#[derive(Default)]
pub struct LastRestore(pub Mutex<Option<RestoreReport>>);

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct RestoreReport {
    /// The snapshot asked for (`AAAA-MM-JJ.db`).
    pub name: String,
    /// Why it was not restored. The data in use is then untouched.
    pub error: Option<String>,
}

fn auto_dir() -> PathBuf {
    crate::paths::backups_dir().join("auto")
}

pub fn trash_dir() -> PathBuf {
    crate::paths::backups_dir().join("corbeille")
}

/// The file the next launch restores from, if any.
fn restore_marker() -> PathBuf {
    crate::paths::data_dir().join(".restaurer")
}

fn snapshot_name(day: NaiveDate) -> String {
    format!("{}.db", day.format("%Y-%m-%d"))
}

fn snapshot_day(name: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(name.strip_suffix(".db")?, "%Y-%m-%d").ok()
}

/// Today's snapshot, unless it already exists. Returns whether one was made.
pub fn daily_snapshot(db: &Db) -> AppResult<bool> {
    let dir = auto_dir();
    fs::create_dir_all(&dir)?;
    let dest = dir.join(snapshot_name(Local::now().date_naive()));
    if dest.exists() {
        return Ok(false);
    }
    let tmp = dir.join(".en-cours.db");
    let _ = fs::remove_file(&tmp);
    db.read_blocking(|conn| {
        conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy().to_string()])?;
        Ok(())
    })?;
    fs::rename(&tmp, &dest)?;
    prune_snapshots(&dir)?;
    Ok(true)
}

/// Keep the newest `DAILY_KEPT` days, then the newest snapshot of each of the
/// `WEEKLY_KEPT` previous ISO weeks.
fn prune_snapshots(dir: &Path) -> AppResult<()> {
    let mut days: Vec<NaiveDate> = fs::read_dir(dir)?
        .flatten()
        .filter_map(|e| snapshot_day(&e.file_name().to_string_lossy()))
        .collect();
    days.sort_unstable_by(|a, b| b.cmp(a));
    let mut keep: Vec<NaiveDate> = days.iter().take(DAILY_KEPT).copied().collect();
    let mut weeks = vec![];
    for day in days.iter().skip(DAILY_KEPT) {
        let week = (day.iso_week().year(), day.iso_week().week());
        if weeks.len() < WEEKLY_KEPT && !weeks.contains(&week) {
            weeks.push(week);
            keep.push(*day);
        }
    }
    for day in days {
        if !keep.contains(&day) {
            let _ = fs::remove_file(dir.join(snapshot_name(day)));
        }
    }
    Ok(())
}

/// Copy the data folder into `dest/Euclide-Miroir/`: new or changed files
/// only, the database as a consistent snapshot, never the Pronote key
/// (`secrets`). Nothing else is ever deleted from the mirror. Returns the
/// number of files copied.
pub fn mirror(db: &Db, dest: &Path) -> AppResult<usize> {
    if !dest.is_dir() {
        return Err(AppError::user(
            "Le dossier de sauvegarde n'est pas accessible.",
        ));
    }
    let src = crate::paths::data_dir();
    let out = dest.join("Euclide-Miroir");
    fs::create_dir_all(&out)?;
    // Euclide 0.4.1 and older copied it there.
    let key = Path::new(crate::secrets::KEY_FILE);
    let _ = fs::remove_file(out.join(key));
    let mut copied = 0;
    let mut stack = vec![src.clone()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)?.flatten() {
            let path = entry.path();
            let Ok(rel) = path.strip_prefix(&src) else {
                continue;
            };
            let name = rel.to_string_lossy();
            if name.starts_with('.')
                || name.starts_with("euclide.db")
                || name.starts_with("logs")
                || rel == key
            {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            let target = out.join(rel);
            if meta.is_dir() {
                fs::create_dir_all(&target)?;
                stack.push(path);
                continue;
            }
            let fresh = fs::metadata(&target)
                .ok()
                .filter(|t| t.len() == meta.len())
                .and_then(|t| Some(t.modified().ok()? >= meta.modified().ok()?))
                .unwrap_or(false);
            if !fresh {
                let tmp = target.with_extension("copie-en-cours");
                fs::copy(&path, &tmp)?;
                fs::rename(&tmp, &target)?;
                copied += 1;
            }
        }
    }
    let tmp = out.join(".euclide.db.en-cours");
    let _ = fs::remove_file(&tmp);
    db.read_blocking(|conn| {
        conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy().to_string()])?;
        Ok(())
    })?;
    fs::rename(&tmp, out.join("euclide.db"))?;
    Ok(copied)
}

/// Move a deleted document into the trash instead of erasing it.
pub fn trash(path: &Path) {
    let day = Local::now().format("%Y-%m-%d").to_string();
    let dir = trash_dir().join(day);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let moved = fs::create_dir_all(&dir)
        .and_then(|_| fs::rename(path, crate::fsx::unique_dest(&dir, &name)));
    if moved.is_err() {
        let _ = fs::remove_file(path);
    }
}

/// Empty the trash of documents deleted more than `TRASH_DAYS` days ago.
fn purge_trash() {
    let Ok(days) = fs::read_dir(trash_dir()) else {
        return;
    };
    let limit = SystemTime::now() - Duration::from_secs(TRASH_DAYS * 86_400);
    for day in days.flatten() {
        let old = day
            .metadata()
            .and_then(|m| m.modified())
            .map(|t| t < limit)
            .unwrap_or(false);
        if old {
            let _ = fs::remove_dir_all(day.path());
        }
    }
}

#[derive(Serialize)]
pub struct Snapshot {
    pub name: String,
    pub day: String,
    pub size: u64,
}

pub fn list_snapshots() -> Vec<Snapshot> {
    let mut out: Vec<Snapshot> = fs::read_dir(auto_dir())
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let day = snapshot_day(&name)?;
                    Some(Snapshot {
                        day: day.format("%Y-%m-%d").to_string(),
                        size: e.metadata().map(|m| m.len()).unwrap_or(0),
                        name,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| b.day.cmp(&a.day));
    out
}

/// Ask the next launch to restore `name` (a daily snapshot).
pub fn schedule_restore(name: &str) -> AppResult<()> {
    let name = crate::fsx::plain_file_name(name)?;
    if snapshot_day(name).is_none() || !auto_dir().join(name).is_file() {
        return Err(AppError::not_found("Sauvegarde introuvable."));
    }
    fs::write(restore_marker(), name)?;
    Ok(())
}

/// Forget a scheduled restore (nothing scheduled is fine).
pub fn cancel_restore() -> AppResult<()> {
    match fs::remove_file(restore_marker()) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Called at startup, before the database opens: put a scheduled snapshot in
/// place. None when no restore was asked for.
pub fn apply_pending_restore() -> Option<RestoreReport> {
    let marker = restore_marker();
    let name = fs::read_to_string(&marker).ok()?.trim().to_string();
    // Taken once: a restore that cannot be done is not tried at every launch
    // (each try would set the database in use aside again).
    let error = match fs::remove_file(&marker) {
        Ok(()) => restore(&name).err().map(|e| e.message()),
        Err(e) => Some(format!("Demande de restauration illisible : {e}")),
    };
    Some(RestoreReport { name, error })
}

fn restore(name: &str) -> AppResult<()> {
    let snapshot = auto_dir().join(crate::fsx::plain_file_name(name)?);
    if !snapshot.is_file() {
        return Err(AppError::not_found("Cette copie n'existe plus."));
    }
    let db_path = crate::paths::db_path();
    let copy = db_path.with_file_name(".euclide.db.restauration");
    let _ = fs::remove_file(&copy);
    let result = copy_whole(&snapshot, &copy)
        .and_then(|_| check_database(&copy))
        .and_then(|_| {
            let stamp = Local::now().format("%Y%m%d-%H%M%S");
            let aside = crate::paths::backups_dir().join(format!("avant-restauration-{stamp}"));
            fs::create_dir_all(&aside)?;
            swap_in(&db_path, &copy, &aside)
        });
    if result.is_err() {
        let _ = fs::remove_file(&copy);
    }
    result
}

/// `from` copied to `to` and on the disk: the key can be pulled out next.
fn copy_whole(from: &Path, to: &Path) -> AppResult<()> {
    fs::copy(from, to)?;
    fs::OpenOptions::new().write(true).open(to)?.sync_all()?;
    Ok(())
}

/// A database fit to replace the one in use: Euclide's, readable to the last
/// page, and not from a newer Euclide.
fn check_database(path: &Path) -> AppResult<()> {
    use rusqlite::{Connection, OpenFlags};
    let unreadable = |e: rusqlite::Error| AppError::user(format!("Copie illisible ({e})."));
    let conn =
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(unreadable)?;
    let health: String = conn
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .map_err(unreadable)?;
    if health != "ok" {
        return Err(AppError::user(format!("Copie endommagée ({health}).")));
    }
    let euclide: bool = conn
        .query_row(
            "SELECT count(*) = 2 FROM sqlite_master WHERE type = 'table' AND name IN ('courses', 'notes')",
            [],
            |r| r.get(0),
        )
        .map_err(unreadable)?;
    if !euclide {
        return Err(AppError::user("Ce fichier n'est pas une copie d'Euclide."));
    }
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(unreadable)?;
    if version > crate::db::DATA_FORMAT {
        return Err(AppError::user(
            "Copie faite par une version plus récente d'Euclide.",
        ));
    }
    Ok(())
}

/// `db_path` and its WAL files move into `aside`, then `copy` takes their
/// place. Whatever moved comes back if a step fails.
fn swap_in(db_path: &Path, copy: &Path, aside: &Path) -> AppResult<()> {
    let mut moved: Vec<(PathBuf, PathBuf)> = vec![];
    let mut step = || -> AppResult<()> {
        for suffix in ["", "-wal", "-shm"] {
            let mut current = db_path.as_os_str().to_owned();
            current.push(suffix);
            let current = PathBuf::from(current);
            if current.exists() {
                let to = aside.join(format!("euclide.db{suffix}"));
                fs::rename(&current, &to)?;
                moved.push((current, to));
            }
        }
        fs::rename(copy, db_path)?;
        Ok(())
    };
    let result = step();
    if result.is_err() {
        for (home, away) in moved.iter().rev() {
            let _ = fs::rename(away, home);
        }
    }
    result
}

/// Background work after startup: integrity check, today's snapshot, mirror,
/// trash. Then once every few hours, in case Euclide stays open for days.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            let app2 = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || run_once(&app2)).await;
            tokio::time::sleep(Duration::from_secs(6 * 3600)).await;
        }
    });
}

fn run_once(app: &AppHandle) {
    let db = app.state::<Db>().inner().clone();
    let check = db.read_blocking(|conn| {
        Ok(conn.query_row("PRAGMA quick_check", [], |r| r.get::<_, String>(0))?)
    });
    let health = match check {
        Ok(s) if s == "ok" => "ok".to_string(),
        Ok(s) => s,
        Err(e) => e.message(),
    };
    if health != "ok" {
        crate::applog::warn(format!("[backup] integrity check failed: {health}"));
        let _ = app.emit(
            "eu://integrity",
            serde_json::json!({ "ok": false, "detail": health }),
        );
    }
    *app.state::<Health>()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some(health.clone());
    // Never snapshot a damaged database over the good ones.
    if health == "ok" {
        if let Err(e) = daily_snapshot(&db) {
            crate::applog::warn(format!("[backup] snapshot: {}", e.message()));
        }
    }
    purge_trash();

    let (external, last) = {
        let conn = db.lock();
        (
            crate::commands::get_setting_raw(&conn, EXTERNAL_DIR_KEY),
            crate::commands::get_setting_raw(&conn, LAST_MIRROR_KEY),
        )
    };
    let today = Local::now().format("%Y-%m-%d").to_string();
    if let Some(dir) = external.filter(|d| !d.is_empty()) {
        let due = last.map(|l| !l.starts_with(&today)).unwrap_or(true);
        if due && health == "ok" && Path::new(&dir).is_dir() {
            match mirror(&db, Path::new(&dir)) {
                Ok(_) => {
                    let stamp = Local::now().format("%Y-%m-%d %H:%M").to_string();
                    crate::commands::set_setting_raw(&db.lock(), LAST_MIRROR_KEY, &stamp);
                }
                Err(e) => crate::applog::warn(format!("[backup] mirror: {}", e.message())),
            }
        }
    }
}

/// What Settings shows about backups.
#[derive(Serialize)]
pub struct BackupStatus {
    pub snapshots: Vec<Snapshot>,
    pub folder: String,
    pub external_dir: Option<String>,
    pub external_reachable: bool,
    pub last_mirror: Option<String>,
    pub integrity: Option<String>,
    pub restore_pending: bool,
    pub last_restore: Option<RestoreReport>,
}

pub fn status(app: &AppHandle) -> BackupStatus {
    let db = app.state::<Db>();
    let (external_dir, last_mirror) = {
        let conn = db.lock();
        (
            crate::commands::get_setting_raw(&conn, EXTERNAL_DIR_KEY).filter(|d| !d.is_empty()),
            crate::commands::get_setting_raw(&conn, LAST_MIRROR_KEY),
        )
    };
    BackupStatus {
        snapshots: list_snapshots(),
        folder: crate::paths::backups_dir().to_string_lossy().to_string(),
        external_reachable: external_dir
            .as_deref()
            .map(|d| Path::new(d).is_dir())
            .unwrap_or(false),
        external_dir,
        last_mirror,
        integrity: app
            .state::<Health>()
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone(),
        restore_pending: restore_marker().exists(),
        last_restore: app
            .state::<LastRestore>()
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_keep_a_week_of_days_and_a_month_of_weeks() {
        let dir = std::env::temp_dir().join(format!("euclide-prune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let start = NaiveDate::from_ymd_opt(2026, 10, 7).unwrap();
        for i in 0..60 {
            fs::write(
                dir.join(snapshot_name(start - chrono::Duration::days(i))),
                b"x",
            )
            .unwrap();
        }
        fs::write(dir.join("notes.txt"), b"not a snapshot").unwrap();
        prune_snapshots(&dir).unwrap();
        let mut kept: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".db"))
            .collect();
        kept.sort();
        assert_eq!(kept.len(), DAILY_KEPT + WEEKLY_KEPT);
        assert_eq!(kept.last().unwrap(), "2026-10-07.db");
        assert!(dir.join("notes.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// A data folder with a database holding one note, and a snapshot of it
    /// named after `day` holding `snapshot_note` instead.
    fn data_with_snapshot(day: &str, snapshot_note: &str) -> crate::paths::TempDataDir {
        let env = crate::paths::temp_data_dir(&format!("restore-{day}"));
        let note = |path: &Path, title: &str| {
            let db = Db::open(path).unwrap();
            db.lock()
                .execute("INSERT INTO notes (title, body) VALUES (?1, '')", [title])
                .unwrap();
        };
        fs::create_dir_all(auto_dir()).unwrap();
        note(&auto_dir().join(format!("{day}.db")), snapshot_note);
        note(&crate::paths::db_path(), "aujourd'hui");
        env
    }

    fn notes_in(path: &Path) -> Vec<String> {
        let conn = rusqlite::Connection::open(path).unwrap();
        let mut stmt = conn.prepare("SELECT title FROM notes ORDER BY id").unwrap();
        stmt.query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    fn asides() -> Vec<PathBuf> {
        fs::read_dir(crate::paths::backups_dir())
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("avant-restauration-")
            })
            .collect()
    }

    #[test]
    fn a_restore_puts_the_snapshot_in_place_and_sets_the_database_aside() {
        let _env = data_with_snapshot("2026-10-05", "lundi");
        schedule_restore("2026-10-05.db").unwrap();
        let report = apply_pending_restore().unwrap();
        assert_eq!(report.error, None);
        assert_eq!(notes_in(&crate::paths::db_path()), ["lundi"]);
        let aside = asides();
        assert_eq!(aside.len(), 1);
        assert_eq!(notes_in(&aside[0].join("euclide.db")), ["aujourd'hui"]);
        // Asked once, done once.
        assert_eq!(apply_pending_restore(), None);
    }

    #[test]
    fn a_missing_or_damaged_snapshot_leaves_the_data_in_use() {
        let _env = data_with_snapshot("2026-10-06", "mardi");
        fs::write(restore_marker(), "2026-10-04.db").unwrap();
        let missing = apply_pending_restore().unwrap();
        assert!(missing.error.unwrap().contains("n'existe plus"));

        // Garbage, then a file of another program: refused before anything moves.
        let snapshot = auto_dir().join("2026-10-06.db");
        for bytes in [&b"pas une base"[..], &[]] {
            fs::write(&snapshot, bytes).unwrap();
            schedule_restore("2026-10-06.db").unwrap();
            let refused = apply_pending_restore().unwrap();
            assert!(refused.error.is_some(), "{bytes:?} was restored");
        }
        assert_eq!(notes_in(&crate::paths::db_path()), ["aujourd'hui"]);
        assert!(asides().is_empty());
        assert!(!crate::paths::db_path()
            .with_file_name(".euclide.db.restauration")
            .exists());
        // And it is not tried again at the next launch.
        assert_eq!(apply_pending_restore(), None);
    }

    #[test]
    fn a_failed_swap_puts_the_database_back() {
        let _env = data_with_snapshot("2026-10-07", "mercredi");
        let db_path = crate::paths::db_path();
        let copy = db_path.with_file_name(".euclide.db.restauration");
        fs::write(&copy, b"copie").unwrap();
        // Moving aside works; the copy cannot follow: it is gone.
        let aside = crate::paths::backups_dir().join("avant-restauration-test");
        fs::create_dir_all(&aside).unwrap();
        fs::remove_file(&copy).unwrap();
        assert!(swap_in(&db_path, &copy, &aside).is_err());
        assert_eq!(notes_in(&db_path), ["aujourd'hui"]);
        assert!(!aside.join("euclide.db").exists());
    }

    #[test]
    fn the_mirror_leaves_the_pronote_key_out() {
        let _env = crate::paths::temp_data_dir("mirror-key");
        let data = crate::paths::data_dir();
        let key = crate::secrets::KEY_FILE;
        fs::write(data.join(key), [7u8; 32]).unwrap();
        fs::create_dir_all(data.join("documents")).unwrap();
        fs::write(data.join("documents/cours.pdf"), b"%PDF").unwrap();
        let db = Db::open(&crate::paths::db_path()).unwrap();
        // A folder outside the key, where Euclide 0.4.1 had copied it.
        let dest = data.parent().unwrap().join("Sauvegarde");
        let out = dest.join("Euclide-Miroir");
        fs::create_dir_all(&out).unwrap();
        fs::write(out.join(key), [7u8; 32]).unwrap();

        mirror(&db, &dest).unwrap();
        assert_eq!(fs::read(out.join("documents/cours.pdf")).unwrap(), b"%PDF");
        assert!(out.join("euclide.db").exists());
        assert!(!out.join(key).exists());
        assert!(data.join(key).exists(), "the data folder keeps its key");
    }

    #[test]
    fn snapshot_names_are_dates() {
        assert_eq!(
            snapshot_day("2026-10-07.db"),
            NaiveDate::from_ymd_opt(2026, 10, 7)
        );
        assert_eq!(snapshot_day("../2026-10-07.db"), None);
        assert_eq!(snapshot_day("euclide.db"), None);
    }
}
