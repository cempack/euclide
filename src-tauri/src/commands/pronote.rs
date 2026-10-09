//! Pronote: login (QR code or password), timetable sync, lesson contents,
//! class list. The work happens in the Python sidecar (pronotepy).
//!
//! Credentials:
//! - QR-code accounts keep Pronote's rotating token, saved after every call
//!   and sealed with the data folder's key (see `secrets`): it opens the
//!   account until it rotates, as a password would;
//! - password accounts trade the password for such a token at login, or at
//!   their next call after an update, where the establishment allows it (the
//!   sidecar asks for a QR code's data itself): then they are QR-code
//!   accounts like the others and no password is kept;
//! - otherwise the password is sealed with the data folder's key (see
//!   `secrets`), which every PC can read: no PC asks for it again.
//!
//! Calls run one at a time: two concurrent calls would both rotate the
//! token, and the one saved last could already be dead.

use super::settings::{get_setting_raw, put, set_setting_raw};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::PronoteStatus;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

/// Serializes Pronote calls (see module docs).
#[derive(Default)]
pub struct PronoteLane(Mutex<()>);

/// The password, sealed with the data folder's key (`secrets::seal`).
const PASSWORD_SEALED: &str = "pronote_password_sealed";
/// Euclide 0.3's: encrypted for one Windows user on one PC.
const PASSWORD_DPAPI: &str = "pronote_password_dpapi";
/// A QR-code account's token, sealed like the password. Euclide 0.4.1 and
/// older kept it in clear, in `pronote_password`.
const TOKEN_SEALED: &str = "pronote_token_sealed";
/// This session's token, when the data folder's key cannot be written. No
/// `account_key` can be this name: they all hold a \u{1f}.
const TOKEN_SESSION: &str = "pronote-token";

fn account_key(url: &str, username: &str) -> String {
    format!("{url}\u{1f}{username}")
}

/// Credentials for a sidecar call, plus `extra` fields.
fn credentials(conn: &Connection, extra: Value) -> AppResult<Value> {
    let url = get_setting_raw(conn, "pronote_url")
        .ok_or_else(|| AppError::user("Pronote n'est pas connecté."))?;
    let mode = get_setting_raw(conn, "pronote_mode").unwrap_or_else(|| "qr".into());
    let username = get_setting_raw(conn, "pronote_username").unwrap_or_default();
    let password = if mode == "password" {
        stored_password(conn, &url, &username).ok_or_else(|| {
            AppError::coded(
                "pronote_password_required",
                "Pronote demande votre mot de passe. Reconnectez-vous dans Réglages.",
            )
        })?
    } else {
        stored_token(conn).ok_or_else(|| {
            AppError::coded(
                "pronote_password_required",
                "Pronote demande une nouvelle connexion. Reconnectez-vous dans Réglages.",
            )
        })?
    };
    // A password account gets a device id to trade its password for a token
    // with; the reply hands it back to keep when the trade is made.
    let uuid =
        get_setting_raw(conn, "pronote_uuid").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut creds = json!({
        "mode": mode,
        "url": url,
        "username": username,
        "password": password,
        "uuid": uuid,
        "device_name": get_setting_raw(conn, "pronote_device_name"),
        "client_identifier": get_setting_raw(conn, "pronote_client_identifier"),
    });
    if let (Some(obj), Value::Object(more)) = (creds.as_object_mut(), extra) {
        obj.extend(more);
    }
    Ok(creds)
}

/// The sidecar answers `{ ok: false, error }` on failure.
fn ensure_ok(res: &Value, fallback: &str) -> AppResult<()> {
    if res.get("ok").and_then(|x| x.as_bool()) == Some(true) {
        return Ok(());
    }
    let err = res
        .get("error")
        .and_then(|x| x.as_str())
        .unwrap_or(fallback);
    if res.get("needs_pin").and_then(|x| x.as_bool()) == Some(true) {
        let msg = err.strip_prefix("NEEDS_PIN:").unwrap_or(err);
        return Err(AppError::coded("pronote_needs_pin", msg));
    }
    Err(AppError::user(err))
}

/// A password account's password: this session's, else the sealed one, else
/// Euclide 0.3's where this PC can read it.
fn stored_password(conn: &Connection, url: &str, username: &str) -> Option<String> {
    crate::secrets::recall(&account_key(url, username))
        .or_else(|| get_setting_raw(conn, PASSWORD_SEALED).and_then(|c| crate::secrets::open(&c)))
        .or_else(|| {
            get_setting_raw(conn, PASSWORD_DPAPI).and_then(|c| crate::secrets::open_legacy(&c))
        })
}

/// Every copy of the account's password or token, gone.
fn forget_secrets(conn: &Connection) -> rusqlite::Result<()> {
    let url = get_setting_raw(conn, "pronote_url").unwrap_or_default();
    let username = get_setting_raw(conn, "pronote_username").unwrap_or_default();
    crate::secrets::forget(&account_key(&url, &username));
    crate::secrets::forget(TOKEN_SESSION);
    for key in [
        "pronote_password",
        PASSWORD_SEALED,
        PASSWORD_DPAPI,
        TOKEN_SEALED,
    ] {
        conn.execute("DELETE FROM settings WHERE key=?1", [key])?;
    }
    Ok(())
}

/// A QR-code account's token: the sealed one, else this session's, else the
/// one Euclide 0.4.1 kept in clear (sealed at startup where the key can be
/// written). `None` when the key does not open it: a backup restored without
/// the key, which only means connecting again.
fn stored_token(conn: &Connection) -> Option<String> {
    if let Some(sealed) = get_setting_raw(conn, TOKEN_SEALED) {
        return crate::secrets::open(&sealed);
    }
    crate::secrets::recall(TOKEN_SESSION)
        .or_else(|| get_setting_raw(conn, "pronote_password").filter(|t| !t.is_empty()))
}

/// Keep a QR-code account's new token, never in clear.
fn store_token(conn: &Connection, token: &str) -> AppResult<()> {
    keep_token(conn, token, crate::secrets::seal(token))
}

/// `sealed` is `token` sealed with the data folder's key, if it could be
/// written; if not, the token lasts this session only.
fn keep_token(conn: &Connection, token: &str, sealed: Option<String>) -> AppResult<()> {
    conn.execute("DELETE FROM settings WHERE key='pronote_password'", [])?;
    match sealed {
        Some(sealed) => put(conn, TOKEN_SEALED, &sealed),
        None => {
            crate::applog::warn("[pronote] key not writable: token kept for this session only");
            crate::secrets::remember(TOKEN_SESSION, token);
            conn.execute("DELETE FROM settings WHERE key=?1", [TOKEN_SEALED])?;
            Ok(())
        }
    }
}

/// Pronote rotates its login token on every session: save the new one (and the
/// PIN device id) for the next call, and strip them from the response so
/// credentials never reach the webview. Password accounts keep no token,
/// unless the sidecar just traded their password for one: from then on they
/// keep that token only.
pub(crate) fn take_rotated_credentials(conn: &Connection, res: &mut Value) {
    let Some(obj) = res.as_object_mut() else {
        return;
    };
    let token = obj.remove("token").and_then(|t| t.as_bool()) == Some(true);
    let url = obj.remove("url");
    let uuid = obj.remove("uuid");
    let mut password_mode = get_setting_raw(conn, "pronote_mode").as_deref() == Some("password");
    if password_mode && token && forget_secrets(conn).is_ok() {
        set_setting_raw(conn, "pronote_mode", "qr");
        for (key, value) in [("pronote_url", &url), ("pronote_uuid", &uuid)] {
            if let Some(v) = value
                .as_ref()
                .and_then(|v| v.as_str())
                .filter(|v| !v.is_empty())
            {
                set_setting_raw(conn, key, v);
            }
        }
        password_mode = false;
    }
    if let Some(username) = obj.remove("username") {
        if let Some(username) = username.as_str() {
            set_setting_raw(conn, "pronote_username", username);
        }
    }
    // A password account's reply carries its password: already sealed.
    if let Some(token) = obj.remove("password") {
        if let Some(token) = token.as_str().filter(|_| !password_mode) {
            if let Err(e) = store_token(conn, token) {
                crate::applog::warn(format!("[pronote] token: {}", e.message()));
            }
        }
    }
    if let Some(cid) = obj.remove("client_identifier") {
        if let Some(cid) = cid.as_str().filter(|c| !c.is_empty()) {
            set_setting_raw(conn, "pronote_client_identifier", cid);
        }
    }
}

/// Passwords from earlier versions, at startup: in clear (before 0.3), or
/// encrypted for one Windows user (0.3), which only that PC could read. Both
/// are sealed with the data folder's key, which every PC can; a 0.3 value
/// this PC cannot read stays for the PC that can.
pub fn protect_stored_password(conn: &Connection) {
    if get_setting_raw(conn, "pronote_mode").as_deref() != Some("password") {
        return;
    }
    let Some(plain) = get_setting_raw(conn, "pronote_password")
        .filter(|p| !p.is_empty())
        .or_else(|| {
            get_setting_raw(conn, PASSWORD_DPAPI).and_then(|c| crate::secrets::open_legacy(&c))
        })
    else {
        return;
    };
    let url = get_setting_raw(conn, "pronote_url").unwrap_or_default();
    let username = get_setting_raw(conn, "pronote_username").unwrap_or_default();
    crate::secrets::remember(&account_key(&url, &username), &plain);
    if let Some(sealed) = crate::secrets::seal(&plain) {
        set_setting_raw(conn, PASSWORD_SEALED, &sealed);
        let _ = conn.execute("DELETE FROM settings WHERE key=?1", [PASSWORD_DPAPI]);
    }
    let _ = conn.execute("DELETE FROM settings WHERE key='pronote_password'", []);
}

/// The token Euclide 0.4.1 and older kept in clear, at startup: sealed like
/// a password. It stays as it is when the key cannot be written.
pub fn protect_stored_token(conn: &Connection) {
    if get_setting_raw(conn, "pronote_mode").as_deref() == Some("password") {
        return;
    }
    let Some(token) = get_setting_raw(conn, "pronote_password").filter(|t| !t.is_empty()) else {
        return;
    };
    if let Some(sealed) = crate::secrets::seal(&token) {
        if put(conn, TOKEN_SEALED, &sealed).is_ok() {
            let _ = conn.execute("DELETE FROM settings WHERE key='pronote_password'", []);
        }
    }
}

#[tauri::command]
pub async fn pronote_status(db: State<'_, Db>) -> AppResult<PronoteStatus> {
    db.read(|conn| Ok(status(conn))).await
}

/// What Settings and the dashboard show; also part of the boot state.
pub(crate) fn status(conn: &Connection) -> PronoteStatus {
    PronoteStatus {
        connected: get_setting_raw(conn, "pronote_connected").as_deref() == Some("1"),
        account_name: get_setting_raw(conn, "pronote_account"),
        last_sync: get_setting_raw(conn, "pronote_last_sync"),
    }
}

#[tauri::command]
pub async fn pronote_qr_login(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
    qr_json: String,
    pin: String,
) -> AppResult<PronoteStatus> {
    let _turn = lane.0.lock().await;
    // The device UUID must never change between logins.
    let uuid = db
        .write(|conn| {
            Ok(match get_setting_raw(conn, "pronote_uuid") {
                Some(u) => u,
                None => {
                    let u = uuid::Uuid::new_v4().to_string();
                    put(conn, "pronote_uuid", &u)?;
                    u
                }
            })
        })
        .await?;
    let qr: Value = serde_json::from_str(&qr_json).unwrap_or(Value::String(qr_json));
    let res = crate::sidecar::call(
        &app,
        "pronote_login",
        &json!({ "qr": qr, "pin": pin, "uuid": uuid }),
    )
    .await?;
    ensure_ok(&res, "Connexion QR impossible")?;
    let account = res
        .get("account_name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let name = account.clone();
    db.write(move |conn| {
        let tx = conn.transaction()?;
        put(&tx, "pronote_connected", "1")?;
        put(&tx, "pronote_mode", "qr")?;
        put(&tx, "pronote_account", &name)?;
        forget_secrets(&tx)?;
        for key in ["url", "username"] {
            if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
                put(&tx, &format!("pronote_{key}"), v)?;
            }
        }
        if let Some(token) = res.get("password").and_then(|x| x.as_str()) {
            store_token(&tx, token)?;
        }
        tx.commit()?;
        Ok(())
    })
    .await?;
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
    (same_url && same_user).then(|| cid.to_string())
}

#[tauri::command]
pub async fn pronote_password_login(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
    url: String,
    username: String,
    password: String,
    pin: Option<String>,
) -> AppResult<PronoteStatus> {
    let _turn = lane.0.lock().await;
    // The device name only matters together with a PIN (new-device
    // registration). A leftover client id from another account makes Pronote
    // derive the wrong AES key.
    let (u, n) = (url.clone(), username.clone());
    let (device_name, client_id, uuid) = db
        .write(move |conn| {
            // The device id a token would be bound to: it never changes.
            let uuid = match get_setting_raw(conn, "pronote_uuid") {
                Some(u) => u,
                None => {
                    let u = uuid::Uuid::new_v4().to_string();
                    put(conn, "pronote_uuid", &u)?;
                    u
                }
            };
            let device_name = match get_setting_raw(conn, "pronote_device_name") {
                Some(d) => d,
                None => {
                    let d = format!("Euclide-{}", &uuid::Uuid::new_v4().to_string()[..8]);
                    put(conn, "pronote_device_name", &d)?;
                    d
                }
            };
            let client_id = reuse_pronote_client_id(
                get_setting_raw(conn, "pronote_url").as_deref(),
                get_setting_raw(conn, "pronote_username").as_deref(),
                &u,
                &n,
                get_setting_raw(conn, "pronote_client_identifier").as_deref(),
            );
            Ok((device_name, client_id, uuid))
        })
        .await?;

    let mut payload =
        json!({ "url": url, "username": username, "password": password, "uuid": uuid });
    if let Some(p) = pin.as_ref().filter(|s| !s.is_empty()) {
        payload["pin"] = Value::String(p.clone());
        payload["device_name"] = Value::String(device_name);
    }
    if let Some(cid) = &client_id {
        payload["client_identifier"] = Value::String(cid.clone());
    }
    let res = crate::sidecar::call(&app, "pronote_password_login", &payload).await?;
    ensure_ok(&res, "Connexion échouée")?;

    let account = res
        .get("account_name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    // The establishment handed out a token: keep it, as for a QR code, and
    // no password at all.
    if res.get("mode").and_then(|m| m.as_str()) == Some("qr") {
        let name = account.clone();
        let mut res = res;
        db.write(move |conn| {
            let tx = conn.transaction()?;
            forget_secrets(&tx)?;
            put(&tx, "pronote_connected", "1")?;
            put(&tx, "pronote_mode", "qr")?;
            put(&tx, "pronote_account", &name)?;
            take_rotated_credentials(&tx, &mut res);
            tx.commit()?;
            Ok(())
        })
        .await?;
        return Ok(PronoteStatus {
            connected: true,
            account_name: Some(account),
            last_sync: None,
        });
    }

    let stored_url = res
        .get("url")
        .and_then(|x| x.as_str())
        .unwrap_or(&url)
        .to_string();
    crate::secrets::remember(&account_key(&stored_url, &username), &password);
    let sealed = crate::secrets::seal(&password);
    let name = account.clone();
    db.write(move |conn| {
        let tx = conn.transaction()?;
        put(&tx, "pronote_connected", "1")?;
        put(&tx, "pronote_mode", "password")?;
        put(&tx, "pronote_account", &name)?;
        put(&tx, "pronote_url", &stored_url)?;
        put(&tx, "pronote_username", &username)?;
        // Never the password in clear: sealed with the data folder's key.
        // A token from a QR code connection before goes too.
        crate::secrets::forget(TOKEN_SESSION);
        for key in [
            "pronote_password",
            PASSWORD_SEALED,
            PASSWORD_DPAPI,
            TOKEN_SEALED,
        ] {
            tx.execute("DELETE FROM settings WHERE key=?1", [key])?;
        }
        if let Some(sealed) = &sealed {
            put(&tx, PASSWORD_SEALED, sealed)?;
        }
        if let Some(cid) = res
            .get("client_identifier")
            .and_then(|x| x.as_str())
            .filter(|c| !c.is_empty())
        {
            put(&tx, "pronote_client_identifier", cid)?;
        }
        tx.commit()?;
        Ok(())
    })
    .await?;
    Ok(PronoteStatus {
        connected: true,
        account_name: Some(account),
        last_sync: None,
    })
}

#[tauri::command]
pub async fn pronote_sync(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
) -> AppResult<i64> {
    let _turn = lane.0.lock().await;
    let creds = db.read(|conn| credentials(conn, json!({}))).await?;
    let mut res = crate::sidecar::call(&app, "pronote_sync", &creds).await?;
    ensure_ok(&res, "Synchronisation échouée")?;
    db.write(move |conn| {
        take_rotated_credentials(conn, &mut res);
        if let Some(name) = res.get("account_name").and_then(|x| x.as_str()).filter(|n| !n.is_empty()) {
            put(conn, "pronote_account", name)?;
        }
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM schedule WHERE source='pronote'", [])?;
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
                    "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, source) \
                     VALUES (?1,?2,?3,?4,?5,'pronote')",
                    params![day, start, end, subject, room],
                )?;
                count += 1;
            }
        }
        put(&tx, "pronote_last_sync", &chrono::Local::now().format("%d/%m %H:%M").to_string())?;
        tx.commit()?;
        Ok(count)
    })
    .await
}

#[tauri::command]
pub async fn pronote_logout(db: State<'_, Db>) -> AppResult<()> {
    db.write(|conn| {
        let url = get_setting_raw(conn, "pronote_url").unwrap_or_default();
        let username = get_setting_raw(conn, "pronote_username").unwrap_or_default();
        crate::secrets::forget(&account_key(&url, &username));
        crate::secrets::forget(TOKEN_SESSION);
        let tx = conn.transaction()?;
        for key in [
            "pronote_connected",
            "pronote_mode",
            "pronote_account",
            "pronote_url",
            "pronote_username",
            "pronote_password",
            PASSWORD_SEALED,
            PASSWORD_DPAPI,
            TOKEN_SEALED,
            "pronote_last_sync",
            "pronote_client_identifier",
            "pronote_device_name",
        ] {
            tx.execute("DELETE FROM settings WHERE key=?1", [key])?;
        }
        tx.execute("DELETE FROM schedule WHERE source='pronote'", [])?;
        tx.commit()?;
        Ok(())
    })
    .await
}

/// Lesson contents (cahier de textes), optionally for one subject / class,
/// from `from_date` (YYYY-MM-DD).
#[tauri::command]
pub async fn pronote_contents(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
    subject: Option<String>,
    class_name: Option<String>,
    from_date: Option<String>,
) -> AppResult<Value> {
    let _turn = lane.0.lock().await;
    let extra = json!({ "subject": subject, "class": class_name, "from_date": from_date });
    let creds = db.read(move |conn| credentials(conn, extra)).await?;
    let mut res = crate::sidecar::call(&app, "pronote_contents", &creds).await?;
    ensure_ok(&res, "Récupération des contenus impossible")?;
    db.write(move |conn| {
        take_rotated_credentials(conn, &mut res);
        Ok(res)
    })
    .await
}

/// Classes and groups of the teacher's account (for class pickers).
#[tauri::command]
pub async fn pronote_classes(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
) -> AppResult<Value> {
    let _turn = lane.0.lock().await;
    let creds = db.read(|conn| credentials(conn, json!({}))).await?;
    let mut res = crate::sidecar::call(&app, "pronote_classes", &creds).await?;
    ensure_ok(&res, "Récupération des classes impossible")?;
    db.write(move |conn| {
        take_rotated_credentials(conn, &mut res);
        Ok(res)
    })
    .await
}

/// A class's students from Pronote, which become its list for the name
/// picker (`commands::students`). An empty or failed answer keeps the list
/// the class had.
#[tauri::command]
pub async fn pronote_students(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
    class_name: String,
) -> AppResult<Vec<String>> {
    let _turn = lane.0.lock().await;
    let extra = json!({ "class": class_name });
    let creds = db.read(move |conn| credentials(conn, extra)).await?;
    let mut res = crate::sidecar::call(&app, "pronote_students", &creds).await?;
    // The token turned even when the class is missing: keep the new one.
    let res = db
        .write(move |conn| {
            take_rotated_credentials(conn, &mut res);
            Ok(res)
        })
        .await?;
    ensure_ok(&res, "Liste des élèves indisponible")?;
    let names = student_names(&res);
    if names.is_empty() {
        return Err(AppError::user(
            "Pronote ne donne aucun élève pour cette classe.",
        ));
    }
    db.write(move |conn| crate::commands::students::replace(conn, &class_name, &names))
        .await
}

/// Every class of the teacher's account with its students, in one Pronote
/// session: each becomes its class's list for the name picker, as
/// `pronote_students` does for one. A class Pronote refuses, or gives no one
/// for, keeps the list it had; the refused ones come back in `failed`.
#[tauri::command]
pub async fn pronote_students_all(
    app: AppHandle,
    db: State<'_, Db>,
    lane: State<'_, PronoteLane>,
) -> AppResult<Value> {
    let _turn = lane.0.lock().await;
    let creds = db.read(|conn| credentials(conn, json!({}))).await?;
    let mut res = crate::sidecar::call(&app, "pronote_all_students", &creds).await?;
    let res = db
        .write(move |conn| {
            take_rotated_credentials(conn, &mut res);
            Ok(res)
        })
        .await?;
    ensure_ok(&res, "Listes des élèves indisponibles")?;
    let lists = class_lists(&res);
    let failed = res.get("failed").cloned().unwrap_or_else(|| json!([]));
    let loaded = db
        .write(move |conn| {
            let mut loaded = Vec::new();
            for (class_name, names) in &lists {
                let saved = crate::commands::students::replace(conn, class_name, names)?;
                loaded.push(json!({ "class": class_name, "count": saved.len() }));
            }
            Ok(loaded)
        })
        .await?;
    Ok(json!({ "loaded": loaded, "failed": failed }))
}

fn student_names(res: &Value) -> Vec<String> {
    res.get("names")
        .and_then(|n| n.as_array())
        .map(|names| {
            names
                .iter()
                .filter_map(|n| n.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// The sidecar's `classes`: each class's name and its students, the ones
/// with a name and at least one student.
fn class_lists(res: &Value) -> Vec<(String, Vec<String>)> {
    res.get("classes")
        .and_then(|c| c.as_array())
        .map(|classes| {
            classes
                .iter()
                .filter_map(|c| {
                    let name = c.get("class")?.as_str()?.trim();
                    let names = student_names(c);
                    (!name.is_empty() && !names.is_empty()).then(|| (name.to_string(), names))
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        crate::db::migrations_for_tests()
    }

    #[test]
    fn every_class_with_a_name_and_students_is_kept() {
        let res = json!({
            "classes": [
                { "class": " 2NDE7 ", "names": ["Léa DUPONT", "Hugo MARTIN"] },
                { "class": "1G3", "names": [] },
                { "class": "", "names": ["Zoé BERNARD"] },
                { "names": ["Sans classe"] }
            ]
        });
        assert_eq!(
            class_lists(&res),
            vec![(
                "2NDE7".to_string(),
                vec!["Léa DUPONT".to_string(), "Hugo MARTIN".to_string()]
            )]
        );
        assert!(class_lists(&json!({})).is_empty());
    }

    #[test]
    fn client_id_reused_only_for_same_account() {
        let url = "https://x/pronote/professeur.html";
        assert_eq!(
            reuse_pronote_client_id(Some(url), Some("prof"), url, "prof", Some("cid")).as_deref(),
            Some("cid")
        );
        assert_eq!(
            reuse_pronote_client_id(Some(url), Some("other"), url, "prof", Some("cid")),
            None
        );
        assert_eq!(
            reuse_pronote_client_id(Some(url), Some("prof"), url, "prof", Some("")),
            None
        );
    }

    #[test]
    fn rotated_credentials_are_saved_sealed_and_stripped() {
        with_key_dir();
        let conn = conn();
        let mut res = json!({ "ok": true, "contents": [], "username": "u2", "password": "token-2", "client_identifier": "cid" });
        take_rotated_credentials(&conn, &mut res);
        assert_eq!(res, json!({ "ok": true, "contents": [] }));
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
        let sealed = get_setting_raw(&conn, TOKEN_SEALED).expect("sealed");
        assert!(!sealed.contains("token-2"));
        assert_eq!(stored_token(&conn).as_deref(), Some("token-2"));
        assert_eq!(
            get_setting_raw(&conn, "pronote_username").as_deref(),
            Some("u2")
        );
        assert_eq!(
            get_setting_raw(&conn, "pronote_client_identifier").as_deref(),
            Some("cid")
        );
    }

    /// The tests that touch this session's token, one at a time.
    fn session_token_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn qr_account(conn: &Connection) {
        for (k, v) in [
            ("pronote_connected", "1"),
            ("pronote_mode", "qr"),
            ("pronote_url", "https://q/pronote/mobile.professeur.html"),
            ("pronote_username", "login-q"),
        ] {
            put(conn, k, v).unwrap();
        }
    }

    #[test]
    fn a_clear_token_is_sealed_at_startup() {
        with_key_dir();
        let qr = conn();
        qr_account(&qr);
        put(&qr, "pronote_password", "token-0").unwrap();
        protect_stored_token(&qr);
        assert_eq!(get_setting_raw(&qr, "pronote_password"), None);
        assert!(!get_setting_raw(&qr, TOKEN_SEALED)
            .expect("sealed")
            .contains("token-0"));
        let creds = credentials(&qr, json!({})).unwrap();
        assert_eq!(
            (creds["mode"].as_str(), creds["password"].as_str()),
            (Some("qr"), Some("token-0"))
        );

        // A password account's password is protect_stored_password's.
        let pw = conn();
        password_account(&pw, "https://p", "prof");
        put(&pw, "pronote_password", "s3cret").unwrap();
        protect_stored_token(&pw);
        assert_eq!(get_setting_raw(&pw, TOKEN_SEALED), None);
    }

    #[test]
    fn a_token_the_key_cannot_open_asks_to_connect_again() {
        with_key_dir();
        let conn = conn();
        qr_account(&conn);
        // Sealed with the key of a data folder restored without it.
        let other = format!(
            "v1:{}",
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, [9u8; 40])
        );
        put(&conn, TOKEN_SEALED, &other).unwrap();
        let err = credentials(&conn, json!({})).unwrap_err();
        assert_eq!(err.code(), "pronote_password_required");
        assert!(err.message().contains("Reconnectez-vous"));
    }

    #[test]
    fn without_a_writable_key_the_token_lasts_the_session() {
        let _one = session_token_lock();
        let conn = conn();
        qr_account(&conn);
        put(&conn, "pronote_password", "token-old").unwrap();
        keep_token(&conn, "token-s", None).unwrap();
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
        assert_eq!(get_setting_raw(&conn, TOKEN_SEALED), None);
        assert_eq!(stored_token(&conn).as_deref(), Some("token-s"));
        forget_secrets(&conn).unwrap();
        assert_eq!(stored_token(&conn), None);
    }

    /// The data folder's key, in a folder of the tests' own.
    fn with_key_dir() {
        static DIR: std::sync::OnceLock<()> = std::sync::OnceLock::new();
        DIR.get_or_init(|| crate::secrets::use_key_dir(&crate::secrets::test_dir("pronote-key")));
    }

    fn password_account(conn: &Connection, url: &str, username: &str) {
        for (k, v) in [
            ("pronote_mode", "password"),
            ("pronote_url", url),
            ("pronote_username", username),
        ] {
            put(conn, k, v).unwrap();
        }
    }

    #[test]
    fn earlier_passwords_are_sealed_for_every_pc() {
        with_key_dir();
        let conn = conn();
        password_account(&conn, "https://x/pronote/professeur.html", "prof");
        put(&conn, "pronote_password", "s3cret").unwrap();
        protect_stored_password(&conn);
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
        let sealed = get_setting_raw(&conn, PASSWORD_SEALED).expect("sealed");
        assert!(!sealed.contains("s3cret"));
        // Another PC, or the next launch: nothing in memory, the key on disk.
        crate::secrets::forget(&account_key("https://x/pronote/professeur.html", "prof"));
        let creds = credentials(&conn, json!({ "subject": "NSI" })).unwrap();
        assert_eq!(creds["password"], "s3cret");
        assert_eq!(creds["subject"], "NSI");
        assert!(
            creds["uuid"].as_str().is_some_and(|u| !u.is_empty()),
            "a device id to trade with"
        );
        // A reply that is no token leaves the password account as it is.
        let mut res =
            json!({ "ok": true, "username": "prof", "password": "s3cret", "token": false });
        take_rotated_credentials(&conn, &mut res);
        assert_eq!(res, json!({ "ok": true }));
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
        assert_eq!(get_setting_raw(&conn, PASSWORD_SEALED), Some(sealed));
    }

    #[test]
    fn a_traded_password_leaves_only_the_token() {
        let _one = session_token_lock();
        with_key_dir();
        let conn = conn();
        password_account(&conn, "https://t/pronote/professeur.html", "maths");
        put(&conn, PASSWORD_SEALED, &crate::secrets::seal("pw").unwrap()).unwrap();
        put(&conn, PASSWORD_DPAPI, "AAAA").unwrap();
        let mut res = json!({
            "ok": true,
            "lessons": [],
            "token": true,
            "username": "login-1",
            "password": "token-1",
            "url": "https://t/pronote/mobile.professeur.html?fd=1&login=true",
            "uuid": "device-1",
            "client_identifier": "cid",
        });
        take_rotated_credentials(&conn, &mut res);
        assert_eq!(res, json!({ "ok": true, "lessons": [] }));
        assert_eq!(
            get_setting_raw(&conn, "pronote_mode").as_deref(),
            Some("qr")
        );
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
        assert_eq!(stored_token(&conn).as_deref(), Some("token-1"));
        assert_eq!(
            get_setting_raw(&conn, "pronote_username").as_deref(),
            Some("login-1")
        );
        assert_eq!(
            get_setting_raw(&conn, "pronote_uuid").as_deref(),
            Some("device-1")
        );
        assert_eq!(
            get_setting_raw(&conn, "pronote_url").as_deref(),
            Some("https://t/pronote/mobile.professeur.html?fd=1&login=true")
        );
        assert_eq!(get_setting_raw(&conn, PASSWORD_SEALED), None);
        assert_eq!(get_setting_raw(&conn, PASSWORD_DPAPI), None);
        let creds = credentials(&conn, json!({})).unwrap();
        assert_eq!(
            (creds["mode"].as_str(), creds["password"].as_str()),
            (Some("qr"), Some("token-1"))
        );
    }

    #[test]
    fn missing_password_asks_again() {
        with_key_dir();
        let conn = conn();
        password_account(&conn, "https://y", "nobody");
        // Euclide 0.3's value from another PC: unreadable here.
        put(&conn, PASSWORD_DPAPI, "AAAA").unwrap();
        protect_stored_password(&conn);
        assert_eq!(
            get_setting_raw(&conn, PASSWORD_DPAPI).as_deref(),
            Some("AAAA"),
            "kept for its PC"
        );
        assert_eq!(
            credentials(&conn, json!({})).unwrap_err().code(),
            "pronote_password_required"
        );
        assert!(ensure_ok(
            &json!({ "ok": false, "needs_pin": true, "error": "NEEDS_PIN:Code PIN" }),
            "x"
        )
        .is_err_and(|e| e.code() == "pronote_needs_pin" && e.message() == "Code PIN"));
    }
}
