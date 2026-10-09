//! Where Euclide keeps its data, and its backups.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::jobs::backup::{self, BackupStatus};
use std::fs;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

async fn pick_folder(app: &AppHandle) -> Option<std::path::PathBuf> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    rx.await.ok().flatten().and_then(|f| f.into_path().ok())
}

/// Choose another data folder. Applied at the next launch: the database stays
/// open on the current one until then.
#[tauri::command]
pub async fn choose_data_dir(app: AppHandle) -> AppResult<Option<String>> {
    let Some(dir) = pick_folder(&app).await else {
        return Ok(None);
    };
    if !crate::paths::dir_is_writable(&dir) {
        return Err(AppError::user(
            "Ce dossier n'est pas accessible en écriture.",
        ));
    }
    crate::paths::write_data_dir_pointer(&dir).map_err(|err| {
        AppError::user(format!(
            "Impossible d'enregistrer le dossier choisi : {err}"
        ))
    })?;
    Ok(Some(dir.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn reset_data_dir() -> AppResult<()> {
    crate::paths::remove_data_dir_pointer()
        .map_err(|err| AppError::user(format!("Impossible de réinitialiser le dossier : {err}")))
}

/// Zip `src` into `../Euclide-Sauvegardes/euclide-YYYYMMDD-HHMM.zip`.
///
/// `db_snapshot` is a consistent copy of the live database (see
/// `backup_data_dir`); it is stored as `euclide.db` in place of the live file,
/// whose latest changes may still sit in the WAL.
pub(crate) fn write_data_dir_backup(
    src: &std::path::Path,
    db_snapshot: &std::path::Path,
) -> AppResult<std::path::PathBuf> {
    if !src.is_dir() {
        return Err(AppError::user("Dossier de données introuvable"));
    }
    let parent = src
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| src.to_path_buf());
    let out_dir = parent.join("Euclide-Sauvegardes");
    fs::create_dir_all(&out_dir)
        .map_err(|err| AppError::user(format!("Dossier de sauvegarde : {err}")))?;

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M").to_string();
    let dest = out_dir.join(format!("euclide-{stamp}.zip"));
    // Written under another name, then renamed: a key pulled out half-way
    // leaves no archive that looks complete and is not.
    let partial = out_dir.join(format!(".euclide-{stamp}.zip.en-cours"));
    let written = write_zip(src, db_snapshot, &partial).and_then(|()| {
        fs::rename(&partial, &dest).map_err(|err| AppError::user(format!("Archive : {err}")))
    });
    if written.is_err() {
        let _ = fs::remove_file(&partial);
    }
    written.map(|()| dest)
}

fn write_zip(
    src: &std::path::Path,
    db_snapshot: &std::path::Path,
    out: &std::path::Path,
) -> AppResult<()> {
    use zip::write::SimpleFileOptions;

    let file =
        fs::File::create(out).map_err(|err| AppError::user(format!("Écriture archive : {err}")))?;
    let mut zw = zip::ZipWriter::new(std::io::BufWriter::new(file));
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut add = |name: &str, path: &std::path::Path| -> AppResult<()> {
        // Files are streamed: a large PDF never has to fit in memory.
        let Ok(f) = fs::File::open(path) else {
            return Ok(());
        };
        zw.start_file(name, opts)
            .map_err(|err| AppError::user(format!("Archive : {err}")))?;
        std::io::copy(&mut std::io::BufReader::new(f), &mut zw)
            .map_err(|err| AppError::user(format!("Archive : {err}")))?;
        Ok(())
    };

    add("euclide.db", db_snapshot)?;

    // Iterative walk: no recursion limits, and we can skip our own output
    // folder plus the live database files (replaced by the snapshot above),
    // and the Pronote key: an archive opens nothing (`secrets`).
    let mut stack = vec![src.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(rel) = path.strip_prefix(src) else {
                continue;
            };
            let name = rel.to_string_lossy().replace('\\', "/");
            if name.is_empty() || name.starts_with("Euclide-Sauvegardes") {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if name == "euclide.db"
                || name.ends_with("-wal")
                || name.ends_with("-shm")
                || name == crate::secrets::KEY_FILE
            {
                continue;
            }
            add(&name, &path)?;
        }
    }
    let archive_err = |err: &dyn std::fmt::Display| AppError::user(format!("Archive : {err}"));
    zw.finish()
        .map_err(|e| archive_err(&e))?
        .into_inner()
        .map_err(|e| archive_err(&e))?
        .sync_all()
        .map_err(|e| archive_err(&e))?;
    Ok(())
}

/// Zip the whole data folder next to itself, in `Euclide-Sauvegardes/`.
/// Returns the path of the archive.
#[tauri::command]
pub async fn backup_data_dir(db: State<'_, Db>) -> AppResult<String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // VACUUM INTO: a consistent copy that includes what is still in the WAL.
        let snapshot = std::env::temp_dir().join(format!(
            "euclide-backup-{}.db",
            uuid::Uuid::new_v4().simple()
        ));
        db.read_blocking(|conn| {
            conn.execute("VACUUM INTO ?1", [snapshot.to_string_lossy().to_string()])?;
            Ok(())
        })?;
        let result = write_data_dir_backup(&crate::paths::data_dir(), &snapshot);
        let _ = fs::remove_file(&snapshot);
        Ok(result?.to_string_lossy().to_string())
    })
    .await?
}

#[tauri::command]
pub async fn get_backup_status(app: AppHandle) -> AppResult<BackupStatus> {
    Ok(tauri::async_runtime::spawn_blocking(move || backup::status(&app)).await?)
}

/// Today's snapshot (if not made yet) and the mirror, right now.
#[tauri::command]
pub async fn backup_now(app: AppHandle, db: State<'_, Db>) -> AppResult<BackupStatus> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || -> AppResult<BackupStatus> {
        backup::daily_snapshot(&db)?;
        let external = crate::commands::get_setting_raw(&db.lock(), backup::EXTERNAL_DIR_KEY);
        if let Some(dir) = external.filter(|d| !d.is_empty()) {
            backup::mirror(&db, std::path::Path::new(&dir))?;
        }
        Ok(backup::status(&app))
    })
    .await?
}

/// Choose a folder outside the key that receives a mirror whenever reachable.
#[tauri::command]
pub async fn choose_backup_folder(app: AppHandle, db: State<'_, Db>) -> AppResult<Option<String>> {
    let Some(dir) = pick_folder(&app).await else {
        return Ok(None);
    };
    if dir.starts_with(crate::paths::data_dir()) {
        return Err(AppError::user(
            "Choisissez un dossier en dehors des données d'Euclide.",
        ));
    }
    if !crate::paths::dir_is_writable(&dir) {
        return Err(AppError::user(
            "Ce dossier n'est pas accessible en écriture.",
        ));
    }
    let path = dir.to_string_lossy().to_string();
    let stored = path.clone();
    db.write(move |conn| crate::commands::settings::put(conn, backup::EXTERNAL_DIR_KEY, &stored))
        .await?;
    Ok(Some(path))
}

#[tauri::command]
pub async fn clear_backup_folder(db: State<'_, Db>) -> AppResult<()> {
    db.write(|conn| crate::commands::settings::put(conn, backup::EXTERNAL_DIR_KEY, ""))
        .await
}

/// Restore a daily snapshot at the next launch.
#[tauri::command]
pub async fn restore_snapshot(name: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || backup::schedule_restore(&name)).await?
}

/// Keep the current data after all: the scheduled restore will not happen.
#[tauri::command]
pub async fn cancel_restore() -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(backup::cancel_restore).await?
}

/// Opens one of Euclide's folders in the file manager: the data, the
/// backups or the logs. The webview names the folder, never a path.
#[tauri::command]
pub async fn open_folder(app: AppHandle, which: String) -> AppResult<()> {
    let dir = match which.as_str() {
        "data" => crate::paths::data_dir(),
        "backups" => crate::paths::backups_dir(),
        "logs" => crate::paths::data_dir().join("logs"),
        _ => return Err(AppError::user("Dossier inconnu.")),
    };
    let target = dir.clone();
    tauri::async_runtime::spawn_blocking(move || fs::create_dir_all(target)).await??;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| AppError::user(format!("Impossible d'ouvrir le dossier : {e}")))
}

#[cfg(test)]
mod tests {
    use super::write_data_dir_backup;
    use std::fs;
    use std::io::Read;

    #[test]
    fn backup_zip_uses_db_snapshot_and_skips_live_db_files() {
        let tmp = std::env::temp_dir().join(format!("euclide-backup-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        let src = tmp.join("Euclide-Data");
        fs::create_dir_all(src.join("documents")).unwrap();
        fs::write(src.join("euclide.db"), b"live-db-bytes").unwrap();
        fs::write(src.join("euclide.db-wal"), b"wal").unwrap();
        fs::write(src.join("euclide.db-shm"), b"shm").unwrap();
        fs::write(src.join("documents/note.txt"), b"hello").unwrap();
        fs::write(src.join(crate::secrets::KEY_FILE), [7u8; 32]).unwrap();
        fs::create_dir_all(src.join("Euclide-Sauvegardes")).unwrap();
        fs::write(src.join("Euclide-Sauvegardes/old.zip"), b"old").unwrap();
        let snapshot = tmp.join("snapshot.db");
        fs::write(&snapshot, b"db-bytes").unwrap();

        let dest = write_data_dir_backup(&src, &snapshot).unwrap();
        assert!(dest.exists());
        // Compare path components, not a string: Windows uses another separator.
        assert_eq!(
            dest.parent().and_then(|p| p.file_name()).unwrap(),
            "Euclide-Sauvegardes"
        );
        assert!(dest
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("euclide-"));

        let mut archive = zip::ZipArchive::new(fs::File::open(&dest).unwrap()).unwrap();
        let mut names = Vec::new();
        for i in 0..archive.len() {
            names.push(archive.by_index(i).unwrap().name().to_string());
        }
        names.sort();
        assert_eq!(names.iter().filter(|n| *n == "euclide.db").count(), 1);
        assert!(names.iter().any(|n| n == "documents/note.txt"));
        assert!(!names
            .iter()
            .any(|n| n.ends_with("-wal") || n.ends_with("-shm")));
        assert!(!names.iter().any(|n| n.contains("Euclide-Sauvegardes")));
        assert!(!names.iter().any(|n| n == crate::secrets::KEY_FILE));

        let mut db = archive.by_name("euclide.db").unwrap();
        let mut buf = String::new();
        db.read_to_string(&mut buf).unwrap();
        assert_eq!(buf, "db-bytes");
        // Only the finished archive is left.
        let left: Vec<_> = fs::read_dir(dest.parent().unwrap())
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(
            left,
            [dest.file_name().unwrap().to_string_lossy().to_string()]
        );

        let _ = fs::remove_dir_all(&tmp);
    }
}
