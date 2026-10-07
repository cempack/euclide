use super::settings::{get_setting_raw, set_setting_raw};
use crate::db::Db;
use rusqlite::params;
use serde_json::json;
use std::fs;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub use crate::models::*;

type R<T> = Result<T, String>;

// ---------------------------------------------------------------------------
// Data folder / portable storage root selection
// (chosen folder becomes the root that directly contains euclide.db + courses/ + documents/ + ...)
// The pointer (euclide-data.json) lives next to the executable for USB portability.
// Changing requires restart because DB + caches are opened at launch against the root.
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn choose_data_dir(app: AppHandle) -> R<Option<String>> {
    // Non-blocking folder picker (same pattern as import_files / import_python_script)
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let picked = rx.recv().ok().flatten();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let Ok(p) = picked.into_path() else {
        return Ok(None);
    };
    if !crate::paths::dir_is_writable(&p) {
        return Err("Ce dossier n'est pas accessible en écriture.".into());
    }
    crate::paths::write_data_dir_pointer(&p)
        .map_err(|err| format!("Impossible d'enregistrer le dossier choisi : {err}"))?;
    Ok(Some(p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn reset_data_dir() -> R<()> {
    crate::paths::remove_data_dir_pointer()
        .map_err(|err| format!("Impossible de réinitialiser le dossier : {err}"))
}

/// Zip `src` into `../Euclide-Sauvegardes/euclide-YYYYMMDD-HHMM.zip`.
///
/// `db_snapshot` is a consistent copy of the live database (see
/// `backup_data_dir`); it is stored as `euclide.db` in place of the live file,
/// whose latest changes may still sit in the WAL.
fn write_data_dir_backup(
    src: &std::path::Path,
    db_snapshot: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    use zip::write::SimpleFileOptions;

    if !src.is_dir() {
        return Err("Dossier de données introuvable".to_string());
    }
    let parent = src
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| src.to_path_buf());
    let out_dir = parent.join("Euclide-Sauvegardes");
    fs::create_dir_all(&out_dir).map_err(|err| format!("Dossier de sauvegarde : {err}"))?;

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M").to_string();
    let dest = out_dir.join(format!("euclide-{stamp}.zip"));

    let file = fs::File::create(&dest).map_err(|err| format!("Écriture archive : {err}"))?;
    let mut zw = zip::ZipWriter::new(std::io::BufWriter::new(file));
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut add = |name: &str, path: &std::path::Path| -> Result<(), String> {
        // Files are streamed: a large PDF never has to fit in memory.
        let Ok(f) = fs::File::open(path) else {
            return Ok(());
        };
        zw.start_file(name, opts)
            .map_err(|err| format!("Archive : {err}"))?;
        std::io::copy(&mut std::io::BufReader::new(f), &mut zw)
            .map_err(|err| format!("Archive : {err}"))?;
        Ok(())
    };

    add("euclide.db", db_snapshot)?;

    // Iterative walk: no recursion limits, and we can skip our own output
    // folder plus the live database files (replaced by the snapshot above).
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
            if name == "euclide.db" || name.ends_with("-wal") || name.ends_with("-shm") {
                continue;
            }
            add(&name, &path)?;
        }
    }
    zw.finish().map_err(|err| format!("Archive : {err}"))?;
    Ok(dest)
}

/// Zip the whole data folder next to itself, in `Euclide-Sauvegardes/`.
///
/// A USB key that lives in a pocket has no other safety net: the database, the
/// documents, the whiteboards and the Python scripts all sit in one folder, so
/// one archive is a complete backup. Returns the path of the archive.
#[tauri::command]
pub async fn backup_data_dir(state: State<'_, Db>) -> R<String> {
    let src = crate::paths::data_dir();
    // `VACUUM INTO` writes a consistent copy that includes what is still in the
    // WAL. It is quick (the database is small) and only holds the lock briefly.
    let snapshot = std::env::temp_dir().join(format!(
        "euclide-backup-{}.db",
        uuid::Uuid::new_v4().simple()
    ));
    {
        let conn = state.lock();
        conn.execute("VACUUM INTO ?1", [snapshot.to_string_lossy().to_string()])
            .map_err(|err| format!("Instantané de la base : {err}"))?;
    }
    let snap = snapshot.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        write_data_dir_backup(&src, &snap).map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|err| format!("Sauvegarde interrompue : {err}"));
    let _ = fs::remove_file(&snapshot);
    result?
}

// ---------------------------------------------------------------------------
// Pronote
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn pronote_status(state: State<Db>) -> R<PronoteStatus> {
    let conn = state.lock();
    let connected = get_setting_raw(&conn, "pronote_connected").as_deref() == Some("1");
    Ok(PronoteStatus {
        connected,
        account_name: get_setting_raw(&conn, "pronote_account"),
        last_sync: get_setting_raw(&conn, "pronote_last_sync"),
    })
}

#[tauri::command]
pub async fn pronote_qr_login(
    app: AppHandle,
    state: State<'_, Db>,
    qr_json: String,
    pin: String,
) -> R<PronoteStatus> {
    // Stable UUID must never change between logins.
    let uuid = {
        let conn = state.lock();
        match get_setting_raw(&conn, "pronote_uuid") {
            Some(u) => u,
            None => {
                let u = uuid::Uuid::new_v4().to_string();
                set_setting_raw(&conn, "pronote_uuid", &u);
                u
            }
        }
    };

    let qr_value: serde_json::Value =
        serde_json::from_str(&qr_json).unwrap_or(serde_json::Value::String(qr_json.clone()));

    let res = crate::sidecar::call(
        &app,
        "pronote_login",
        &json!({ "qr": qr_value, "pin": pin, "uuid": uuid }),
    )
    .await?;

    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("Connexion QR impossible");
        return Err(err.to_string());
    }

    let account = res
        .get("account_name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    {
        let conn = state.lock();
        set_setting_raw(&conn, "pronote_connected", "1");
        set_setting_raw(&conn, "pronote_mode", "qr");
        set_setting_raw(&conn, "pronote_account", &account);
        for key in ["url", "username", "password"] {
            if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
                set_setting_raw(&conn, &format!("pronote_{key}"), v);
            }
        }
    }

    Ok(PronoteStatus {
        connected: true,
        account_name: Some(account),
        last_sync: None,
    })
}

/// Reuse a saved Pronote device id only when the same account logs in again.
/// A leftover id from another URL/user is what produces the AES un-pad error.
fn reuse_pronote_client_id(
    stored_url: Option<&str>,
    stored_user: Option<&str>,
    url: &str,
    username: &str,
    stored_cid: Option<&str>,
) -> Option<String> {
    let cid = stored_cid.filter(|s| !s.is_empty())?;
    let same_url = stored_url.is_some_and(|s| s == url);
    let same_user = stored_user.is_some_and(|s| s == username);
    if same_url && same_user {
        Some(cid.to_string())
    } else {
        None
    }
}

#[tauri::command]
pub async fn pronote_password_login(
    app: AppHandle,
    state: State<'_, Db>,
    url: String,
    username: String,
    password: String,
    pin: Option<String>,
) -> R<PronoteStatus> {
    // Device name is only meaningful together with a PIN (new-device
    // registration). A leftover client_identifier from another account
    // makes Pronote derive the wrong AES key.
    let (device_name, client_id) = {
        let conn = state.lock();
        let device_name = match get_setting_raw(&conn, "pronote_device_name") {
            Some(d) => d,
            None => {
                let d = format!("Euclide-{}", &uuid::Uuid::new_v4().to_string()[..8]);
                set_setting_raw(&conn, "pronote_device_name", &d);
                d
            }
        };
        let client_id = reuse_pronote_client_id(
            get_setting_raw(&conn, "pronote_url").as_deref(),
            get_setting_raw(&conn, "pronote_username").as_deref(),
            &url,
            &username,
            get_setting_raw(&conn, "pronote_client_identifier").as_deref(),
        );
        (device_name, client_id)
    };

    let mut payload = json!({
        "url": url,
        "username": username,
        "password": password,
    });
    if let Some(p) = pin.as_ref().filter(|s| !s.is_empty()) {
        payload["pin"] = serde_json::Value::String(p.clone());
        payload["device_name"] = serde_json::Value::String(device_name);
    }
    if let Some(cid) = &client_id {
        payload["client_identifier"] = serde_json::Value::String(cid.clone());
    }

    let res = crate::sidecar::call(&app, "pronote_password_login", &payload).await?;

    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("Connexion echouee");
        // Surface needs_pin flag in the error message so the frontend can detect it
        if res.get("needs_pin").and_then(|x| x.as_bool()) == Some(true) {
            return Err(format!("NEEDS_PIN:{}", err));
        }
        return Err(err.to_string());
    }

    let account = res
        .get("account_name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    {
        let conn = state.lock();
        set_setting_raw(&conn, "pronote_connected", "1");
        set_setting_raw(&conn, "pronote_mode", "password");
        set_setting_raw(&conn, "pronote_account", &account);
        let stored_url = res
            .get("url")
            .and_then(|x| x.as_str())
            .unwrap_or(url.as_str());
        set_setting_raw(&conn, "pronote_url", stored_url);
        set_setting_raw(&conn, "pronote_username", &username);
        set_setting_raw(&conn, "pronote_password", &password);
        // Persist client_identifier for future logins (skips PIN next time)
        if let Some(cid) = res.get("client_identifier").and_then(|x| x.as_str()) {
            if !cid.is_empty() {
                set_setting_raw(&conn, "pronote_client_identifier", cid);
            }
        }
    }

    Ok(PronoteStatus {
        connected: true,
        account_name: Some(account),
        last_sync: None,
    })
}

#[tauri::command]
pub async fn pronote_sync(app: AppHandle, state: State<'_, Db>) -> R<i64> {
    let creds = {
        let conn = state.lock();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "device_name": get_setting_raw(&conn, "pronote_device_name"),
            "client_identifier": get_setting_raw(&conn, "pronote_client_identifier"),
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::call(&app, "pronote_sync", &creds).await?;
    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("synchronisation echouee");
        return Err(err.to_string());
    }

    let conn = state.lock();
    // The password token rotates on every login: persist the new one or future
    // logins will fail.
    for key in ["username", "password"] {
        if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
            set_setting_raw(&conn, &format!("pronote_{key}"), v);
        }
    }
    if let Some(name) = res.get("account_name").and_then(|x| x.as_str()) {
        if !name.is_empty() {
            set_setting_raw(&conn, "pronote_account", name);
        }
    }
    // Persist client_identifier if returned (PIN device registration)
    if let Some(cid) = res.get("client_identifier").and_then(|x| x.as_str()) {
        if !cid.is_empty() {
            set_setting_raw(&conn, "pronote_client_identifier", cid);
        }
    }

    let tx = conn.unchecked_transaction().map_err(e)?;
    tx.execute("DELETE FROM schedule WHERE source='pronote'", [])
        .map_err(e)?;
    let mut count = 0i64;
    if let Some(lessons) = res.get("lessons").and_then(|x| x.as_array()) {
        for l in lessons {
            let day = l.get("day_of_week").and_then(|x| x.as_i64()).unwrap_or(0);
            if !(1..=7).contains(&day) {
                continue;
            }
            let start = l.get("start_time").and_then(|x| x.as_str()).unwrap_or("");
            let end = l.get("end_time").and_then(|x| x.as_str()).unwrap_or("");
            let subject = l.get("subject").and_then(|x| x.as_str()).unwrap_or("Cours");
            let room = l.get("room").and_then(|x| x.as_str()).unwrap_or("");
            let group = l.get("group").and_then(|x| x.as_str()).unwrap_or("");
            let subject = if group.is_empty() {
                subject.to_string()
            } else {
                format!("{subject} · {group}")
            };
            tx.execute(
                "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, source) VALUES (?1,?2,?3,?4,?5,'pronote')",
                params![day, start, end, subject, room],
            ).map_err(e)?;
            count += 1;
        }
    }
    set_setting_raw(
        &tx,
        "pronote_last_sync",
        &chrono::Local::now().format("%d/%m %H:%M").to_string(),
    );
    tx.commit().map_err(e)?;
    Ok(count)
}

#[tauri::command]
pub fn pronote_logout(state: State<Db>) -> R<()> {
    let conn = state.lock();
    for key in [
        "pronote_connected",
        "pronote_mode",
        "pronote_account",
        "pronote_url",
        "pronote_username",
        "pronote_password",
        "pronote_last_sync",
        "pronote_client_identifier",
        "pronote_device_name",
    ] {
        let _ = conn.execute("DELETE FROM settings WHERE key=?1", [key]);
    }
    conn.execute("DELETE FROM schedule WHERE source='pronote'", [])
        .map_err(e)?;
    Ok(())
}

/// Fetches "le contenu des cours" (lesson contents from cahier de textes) via the sidecar.
/// See the Python sidecar (pronote_contents + _lesson_contents) for full details.
/// - subject: optional subject filter (partial match)
/// - class_name: optional class / group name (will try to scope the query on multi-class accounts)
/// - from_date: optional start date (YYYY-MM-DD or DD/MM/YYYY) for the "depuis" filter
/// Always returns fresh credentials (for token rotation) + a `matieres` summary for sidebars.
#[tauri::command]
pub async fn pronote_contents(
    app: AppHandle,
    state: State<'_, Db>,
    subject: Option<String>,
    class_name: Option<String>,
    from_date: Option<String>,
) -> R<serde_json::Value> {
    let creds = {
        let conn = state.lock();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "device_name": get_setting_raw(&conn, "pronote_device_name"),
            "client_identifier": get_setting_raw(&conn, "pronote_client_identifier"),
            "subject": subject,
            "class": class_name,
            "from_date": from_date,
            // also accept the camelCase key that the TS side may send for deserialization
            "fromDate": from_date,
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::call(&app, "pronote_contents", &creds).await?;
    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("recuperation des contenus echouee");
        return Err(err.to_string());
    }

    let mut res = res;
    let conn = state.lock();
    take_rotated_credentials(&conn, &mut res);
    Ok(res)
}

/// Returns the list of classes/groups available for the connected prof account
/// (from Pronote listeClasses). Used to populate class dropdowns instead of free text.
#[tauri::command]
pub async fn pronote_classes(app: AppHandle, state: State<'_, Db>) -> R<serde_json::Value> {
    let creds = {
        let conn = state.lock();
        json!({
            "mode": get_setting_raw(&conn, "pronote_mode").unwrap_or_else(|| "qr".into()),
            "url": get_setting_raw(&conn, "pronote_url"),
            "username": get_setting_raw(&conn, "pronote_username"),
            "password": get_setting_raw(&conn, "pronote_password"),
            "uuid": get_setting_raw(&conn, "pronote_uuid"),
            "device_name": get_setting_raw(&conn, "pronote_device_name"),
            "client_identifier": get_setting_raw(&conn, "pronote_client_identifier"),
        })
    };
    if creds.get("url").map(|v| v.is_null()).unwrap_or(true) {
        return Err("Pronote n'est pas connecte.".into());
    }

    let res = crate::sidecar::call(&app, "pronote_classes", &creds).await?;
    if res.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        let err = res
            .get("error")
            .and_then(|x| x.as_str())
            .unwrap_or("recuperation des classes echouee");
        return Err(err.to_string());
    }

    let mut res = res;
    let conn = state.lock();
    take_rotated_credentials(&conn, &mut res);
    Ok(res)
}

/// Pronote rotates its login token on every session: save the new one (and the
/// PIN device id) for the next call, and strip them from the response so
/// credentials never reach the webview.
fn take_rotated_credentials(conn: &rusqlite::Connection, res: &mut serde_json::Value) {
    let Some(obj) = res.as_object_mut() else {
        return;
    };
    for key in ["username", "password"] {
        if let Some(v) = obj.remove(key) {
            if let Some(v) = v.as_str() {
                set_setting_raw(conn, &format!("pronote_{key}"), v);
            }
        }
    }
    if let Some(cid) = obj.remove("client_identifier") {
        if let Some(cid) = cid.as_str().filter(|c| !c.is_empty()) {
            set_setting_raw(conn, "pronote_client_identifier", cid);
        }
    }
}

// ---------------------------------------------------------------------------

fn e<T: std::fmt::Display>(err: T) -> String {
    err.to_string()
}

#[cfg(test)]
mod classroom_flow_tests {
    use super::write_data_dir_backup;
    use rusqlite::{params, Connection};
    use std::fs;
    use std::io::Read;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn
    }

    fn seed_course(conn: &Connection) -> i64 {
        conn.execute(
            "INSERT INTO courses (name, emoji, color) VALUES ('NSI', '💻', '#5B7BE8')",
            [],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn sequences_create_rename_reorder_and_delete() {
        let conn = mem();
        let course_id = seed_course(&conn);
        for title in ["A", "B", "C"] {
            let next_pos: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(position) + 1, 0) FROM sequences WHERE course_id = ?1",
                    [course_id],
                    |r| r.get(0),
                )
                .unwrap();
            conn.execute(
                "INSERT INTO sequences (course_id, title, position) VALUES (?1, ?2, ?3)",
                params![course_id, title, next_pos],
            )
            .unwrap();
        }
        conn.execute(
            "UPDATE sequences SET title = ?1 WHERE id = ?2",
            params!["B-renamed", 2],
        )
        .unwrap();

        let ids: Vec<i64> = conn
            .prepare("SELECT id FROM sequences WHERE course_id = ?1 ORDER BY position, id")
            .unwrap()
            .query_map([course_id], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        let from = ids.iter().position(|x| *x == 1).unwrap();
        let mut order = ids.clone();
        let moved = order.remove(from);
        order.insert(from + 1, moved);
        for (pos, seq_id) in order.iter().enumerate() {
            conn.execute(
                "UPDATE sequences SET position = ?1 WHERE id = ?2",
                params![pos as i64, seq_id],
            )
            .unwrap();
        }

        let titles: Vec<String> = conn
            .prepare("SELECT title FROM sequences WHERE course_id = ?1 ORDER BY position, id")
            .unwrap()
            .query_map([course_id], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(titles, vec!["B-renamed", "A", "C"]);

        conn.execute("DELETE FROM sequences WHERE id = ?1", [3])
            .unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM sequences", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining, 2);
    }

    #[test]
    fn sequence_item_link_and_per_class_progress() {
        let conn = mem();
        let course_id = seed_course(&conn);
        conn.execute(
            "INSERT INTO sequences (course_id, title, position) VALUES (?1, 'Listes', 0)",
            [course_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO files (course_id, name, rel_path, kind) VALUES (?1, 'cours.pdf', 'courses/1/cours.pdf', 'pdf')",
            [course_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sequence_items (sequence_id, title, file_id, position) VALUES (1, 'Intro', 1, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sequence_items (sequence_id, title, file_id, position) VALUES (1, 'TP', NULL, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO course_classes (course_id, class_name) VALUES (?1, '2NDE4')",
            [course_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO course_classes (course_id, class_name) VALUES (?1, '2NDE7')",
            [course_id],
        )
        .unwrap();

        conn.execute(
            "UPDATE course_classes SET last_item_id = ?1, progress_updated_at = datetime('now') \
             WHERE course_id = ?2 AND class_name = ?3",
            params![1, course_id, "2NDE4"],
        )
        .unwrap();
        conn.execute(
            "UPDATE course_classes SET last_item_id = ?1, progress_updated_at = datetime('now') \
             WHERE course_id = ?2 AND class_name = ?3",
            params![2, course_id, "2NDE7"],
        )
        .unwrap();

        let a: i64 = conn
            .query_row(
                "SELECT last_item_id FROM course_classes WHERE class_name='2NDE4'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let b: i64 = conn
            .query_row(
                "SELECT last_item_id FROM course_classes WHERE class_name='2NDE7'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(a, 1);
        assert_eq!(b, 2);
        assert_ne!(a, b);

        let file_name: String = conn
            .query_row(
                "SELECT f.name FROM sequence_items si JOIN files f ON f.id = si.file_id WHERE si.id=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(file_name, "cours.pdf");
    }

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

        let mut db = archive.by_name("euclide.db").unwrap();
        let mut buf = String::new();
        db.read_to_string(&mut buf).unwrap();
        assert_eq!(buf, "db-bytes");

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn week_grid_add_edit_delete_and_settings_persist() {
        let conn = mem();
        let course_id = seed_course(&conn);
        conn.execute(
            "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, course_id, source) \
             VALUES (4, '08:00', '09:00', 'NSI', 'Salle 12', ?1, 'manual')",
            [course_id],
        )
        .unwrap();
        conn.execute(
            "UPDATE schedule SET end_time='09:55', room='Salle 14' WHERE id=1",
            [],
        )
        .unwrap();
        let (end, room): (String, String) = conn
            .query_row("SELECT end_time, room FROM schedule WHERE id=1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(end, "09:55");
        assert_eq!(room, "Salle 14");
        conn.execute("DELETE FROM schedule WHERE id=1", []).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM schedule", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);

        crate::commands::set_setting_raw(&conn, "theme", "dark");
        crate::commands::set_setting_raw(&conn, "density", "compact");
        let theme = crate::commands::get_setting_raw(&conn, "theme").unwrap();
        let density = crate::commands::get_setting_raw(&conn, "density").unwrap();
        assert_eq!(theme, "dark");
        assert_eq!(density, "compact");
    }
}

#[cfg(test)]
mod pronote_login_tests {
    use super::reuse_pronote_client_id;

    #[test]
    fn client_id_reused_only_for_same_account() {
        let cid = Some("ABC123");
        assert_eq!(
            reuse_pronote_client_id(
                Some("https://demo/pronote/professeur.html"),
                Some("demo"),
                "https://demo/pronote/professeur.html",
                "demo",
                cid,
            )
            .as_deref(),
            Some("ABC123")
        );
        assert_eq!(
            reuse_pronote_client_id(
                Some("https://old.example/pronote/professeur.html"),
                Some("demo"),
                "https://new.example/pronote/professeur.html",
                "demo",
                cid,
            ),
            None
        );
        assert_eq!(
            reuse_pronote_client_id(None, None, "https://x/pronote/professeur.html", "a", cid),
            None
        );
    }
}

#[cfg(test)]
mod hardening_tests {
    use super::take_rotated_credentials;
    use rusqlite::Connection;
    use serde_json::json;

    #[test]
    fn rotated_credentials_are_saved_and_stripped() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);")
            .unwrap();
        let mut res = json!({
            "ok": true,
            "contents": [],
            "username": "u2",
            "password": "token-2",
            "client_identifier": "cid",
        });
        take_rotated_credentials(&conn, &mut res);
        assert_eq!(res, json!({ "ok": true, "contents": [] }));
        let get = |k: &str| -> String {
            conn.query_row("SELECT value FROM settings WHERE key=?1", [k], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(get("pronote_username"), "u2");
        assert_eq!(get("pronote_password"), "token-2");
        assert_eq!(get("pronote_client_identifier"), "cid");
    }
}
