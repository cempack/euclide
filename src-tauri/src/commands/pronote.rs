//! Pronote: login (QR code or password), timetable sync, lesson contents,
//! class list. The work happens in the Python sidecar (pronotepy).
//!
//! Credentials:
//! - QR-code accounts keep Pronote's rotating token, saved after every call;
//! - password accounts never store the password in clear on the key: it is
//!   encrypted for this Windows user (DPAPI) or kept for the session (see
//!   `secrets`). Another PC asks for it again (`pronote_password_required`).
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

const PASSWORD_DPAPI: &str = "pronote_password_dpapi";

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
        let key = account_key(&url, &username);
        crate::secrets::recall(&key)
            .or_else(|| {
                get_setting_raw(conn, PASSWORD_DPAPI).and_then(|c| crate::secrets::unprotect(&c))
            })
            .ok_or_else(|| {
                AppError::coded(
                    "pronote_password_required",
                    "Pronote demande votre mot de passe sur ce PC. Reconnectez-vous dans Réglages.",
                )
            })?
    } else {
        get_setting_raw(conn, "pronote_password").unwrap_or_default()
    };
    let mut creds = json!({
        "mode": mode,
        "url": url,
        "username": username,
        "password": password,
        "uuid": get_setting_raw(conn, "pronote_uuid"),
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

/// Pronote rotates its login token on every session: save the new one (and the
/// PIN device id) for the next call, and strip them from the response so
/// credentials never reach the webview. Password accounts keep no token.
pub(crate) fn take_rotated_credentials(conn: &Connection, res: &mut Value) {
    let password_mode = get_setting_raw(conn, "pronote_mode").as_deref() == Some("password");
    let Some(obj) = res.as_object_mut() else {
        return;
    };
    for key in ["username", "password"] {
        if let Some(v) = obj.remove(key) {
            if let Some(v) = v.as_str() {
                if !(password_mode && key == "password") {
                    set_setting_raw(conn, &format!("pronote_{key}"), v);
                }
            }
        }
    }
    if let Some(cid) = obj.remove("client_identifier") {
        if let Some(cid) = cid.as_str().filter(|c| !c.is_empty()) {
            set_setting_raw(conn, "pronote_client_identifier", cid);
        }
    }
}

/// Databases from before this release kept the password in clear: encrypt it
/// (Windows) or keep it for this session, and delete the clear copy.
pub fn protect_stored_password(conn: &Connection) {
    if get_setting_raw(conn, "pronote_mode").as_deref() != Some("password") {
        return;
    }
    let Some(plain) = get_setting_raw(conn, "pronote_password").filter(|p| !p.is_empty()) else {
        return;
    };
    let url = get_setting_raw(conn, "pronote_url").unwrap_or_default();
    let username = get_setting_raw(conn, "pronote_username").unwrap_or_default();
    crate::secrets::remember(&account_key(&url, &username), &plain);
    if let Some(cipher) = crate::secrets::protect(&plain) {
        set_setting_raw(conn, PASSWORD_DPAPI, &cipher);
    }
    let _ = conn.execute("DELETE FROM settings WHERE key='pronote_password'", []);
}

#[tauri::command]
pub async fn pronote_status(db: State<'_, Db>) -> AppResult<PronoteStatus> {
    db.read(|conn| {
        Ok(PronoteStatus {
            connected: get_setting_raw(conn, "pronote_connected").as_deref() == Some("1"),
            account_name: get_setting_raw(conn, "pronote_account"),
            last_sync: get_setting_raw(conn, "pronote_last_sync"),
        })
    })
    .await
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
        tx.execute("DELETE FROM settings WHERE key=?1", [PASSWORD_DPAPI])?;
        for key in ["url", "username", "password"] {
            if let Some(v) = res.get(key).and_then(|x| x.as_str()) {
                put(&tx, &format!("pronote_{key}"), v)?;
            }
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
    let (device_name, client_id) = db
        .write(move |conn| {
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
            Ok((device_name, client_id))
        })
        .await?;

    let mut payload = json!({ "url": url, "username": username, "password": password });
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
    let stored_url = res
        .get("url")
        .and_then(|x| x.as_str())
        .unwrap_or(&url)
        .to_string();
    crate::secrets::remember(&account_key(&stored_url, &username), &password);
    let cipher = crate::secrets::protect(&password);
    let name = account.clone();
    db.write(move |conn| {
        let tx = conn.transaction()?;
        put(&tx, "pronote_connected", "1")?;
        put(&tx, "pronote_mode", "password")?;
        put(&tx, "pronote_account", &name)?;
        put(&tx, "pronote_url", &stored_url)?;
        put(&tx, "pronote_username", &username)?;
        // Never the password in clear: ciphertext for this Windows user, or nothing.
        tx.execute("DELETE FROM settings WHERE key='pronote_password'", [])?;
        match cipher {
            Some(c) => put(&tx, PASSWORD_DPAPI, &c)?,
            None => {
                tx.execute("DELETE FROM settings WHERE key=?1", [PASSWORD_DPAPI])?;
            }
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
        let tx = conn.transaction()?;
        for key in [
            "pronote_connected",
            "pronote_mode",
            "pronote_account",
            "pronote_url",
            "pronote_username",
            "pronote_password",
            PASSWORD_DPAPI,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        crate::db::migrations_for_tests()
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
    fn rotated_credentials_are_saved_and_stripped() {
        let conn = conn();
        let mut res = json!({ "ok": true, "contents": [], "username": "u2", "password": "token-2", "client_identifier": "cid" });
        take_rotated_credentials(&conn, &mut res);
        assert_eq!(res, json!({ "ok": true, "contents": [] }));
        assert_eq!(
            get_setting_raw(&conn, "pronote_password").as_deref(),
            Some("token-2")
        );
        assert_eq!(
            get_setting_raw(&conn, "pronote_client_identifier").as_deref(),
            Some("cid")
        );
    }

    #[test]
    fn password_accounts_never_keep_the_password_in_clear() {
        let conn = conn();
        for (k, v) in [
            ("pronote_mode", "password"),
            ("pronote_url", "https://x/pronote/professeur.html"),
            ("pronote_username", "prof"),
            ("pronote_password", "s3cret"),
        ] {
            put(&conn, k, v).unwrap();
        }
        protect_stored_password(&conn);
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
        let creds = credentials(&conn, json!({ "subject": "NSI" })).unwrap();
        assert_eq!(creds["password"], "s3cret", "available for this session");
        assert_eq!(creds["subject"], "NSI");
        // A token in a reply is not stored for a password account.
        let mut res = json!({ "ok": true, "password": "not-a-token" });
        take_rotated_credentials(&conn, &mut res);
        assert_eq!(get_setting_raw(&conn, "pronote_password"), None);
    }

    #[test]
    fn missing_password_asks_again() {
        let conn = conn();
        for (k, v) in [
            ("pronote_mode", "password"),
            ("pronote_url", "https://y"),
            ("pronote_username", "nobody"),
        ] {
            put(&conn, k, v).unwrap();
        }
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
