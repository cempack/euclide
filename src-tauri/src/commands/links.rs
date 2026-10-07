//! Quick links shown on the dashboard, and opening web addresses.

use crate::db::Db;
use crate::error::AppResult;
use crate::models::QuickLink;
use rusqlite::{params, Connection};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

pub fn list(conn: &Connection) -> AppResult<Vec<QuickLink>> {
    let mut stmt = conn.prepare_cached("SELECT id, label, url, icon FROM links ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok(QuickLink {
            id: r.get(0)?,
            label: r.get(1)?,
            url: r.get(2)?,
            icon: r.get(3)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[tauri::command]
pub async fn list_links(db: State<'_, Db>) -> AppResult<Vec<QuickLink>> {
    db.read(list).await
}

#[tauri::command]
pub async fn create_link(
    db: State<'_, Db>,
    label: String,
    url: String,
    icon: String,
) -> AppResult<QuickLink> {
    db.write(move |conn| {
        conn.execute(
            "INSERT INTO links (label, url, icon) VALUES (?1,?2,?3)",
            params![label, url, icon],
        )?;
        Ok(QuickLink {
            id: conn.last_insert_rowid(),
            label,
            url,
            icon,
        })
    })
    .await
}

#[tauri::command]
pub async fn delete_link(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM links WHERE id=?1", [id])?;
        Ok(())
    })
    .await
}

pub(crate) fn normalize_external_url(raw: &str) -> Result<String, String> {
    let url = raw.trim();
    if url.is_empty() {
        return Err("Adresse vide.".into());
    }
    if url.chars().any(|c| c.is_control()) {
        return Err("Adresse invalide.".into());
    }
    let lower = url.to_ascii_lowercase();
    if lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:")
        || lower.starts_with("tel:")
    {
        return Ok(url.to_string());
    }
    if lower.contains("://") {
        return Err("Protocole non autorisé.".into());
    }
    if let Some((scheme, rest)) = url.split_once(':') {
        if !rest.starts_with("//") && scheme.chars().all(|c| c.is_ascii_alphabetic()) {
            return Err("Protocole non autorisé.".into());
        }
    }
    Ok(format!("https://{url}"))
}

#[cfg(target_os = "linux")]
fn open_url_host_browser(url: &str) -> Result<(), String> {
    use std::process::{Command, Stdio};

    let strip_appimage_env = |cmd: &mut Command| {
        for key in [
            "LD_LIBRARY_PATH",
            "APPDIR",
            "APPIMAGE",
            "PYTHONHOME",
            "PYTHONPATH",
            "GTK_PATH",
            "GTK_DATA_PREFIX",
            "GDK_PIXBUF_MODULE_FILE",
            "GIO_MODULE_DIR",
        ] {
            cmd.env_remove(key);
        }
    };

    let mut last = String::new();
    for (bin, prefix) in [("xdg-open", &[][..]), ("gio", &["open"][..])] {
        let mut cmd = Command::new(bin);
        for arg in prefix {
            cmd.arg(arg);
        }
        cmd.arg(url)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        strip_appimage_env(&mut cmd);
        match cmd.spawn() {
            Ok(_) => return Ok(()),
            Err(e) => last = e.to_string(),
        }
    }
    Err(last)
}

#[tauri::command]
pub async fn open_url(app: AppHandle, url: String) -> AppResult<()> {
    let url = normalize_external_url(&url)?;
    #[cfg(target_os = "linux")]
    {
        if open_url_host_browser(&url).is_ok() {
            return Ok(());
        }
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| crate::error::AppError::user(format!("Impossible d'ouvrir le lien : {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::normalize_external_url;

    #[test]
    fn adds_https_when_scheme_is_missing() {
        assert_eq!(
            normalize_external_url("www.google.com").unwrap(),
            "https://www.google.com"
        );
        assert_eq!(
            normalize_external_url("  google.com  ").unwrap(),
            "https://google.com"
        );
    }

    #[test]
    fn keeps_known_schemes() {
        assert_eq!(
            normalize_external_url("https://eduscol.education.fr").unwrap(),
            "https://eduscol.education.fr"
        );
        assert_eq!(
            normalize_external_url("http://localhost:3000").unwrap(),
            "http://localhost:3000"
        );
        assert_eq!(
            normalize_external_url("mailto:prof@example.fr").unwrap(),
            "mailto:prof@example.fr"
        );
    }

    #[test]
    fn rejects_empty_and_unknown_schemes() {
        assert!(normalize_external_url("").is_err());
        assert!(normalize_external_url("   ").is_err());
        assert!(normalize_external_url("javascript:alert(1)").is_err());
        assert!(normalize_external_url("file:///etc/passwd").is_err());
    }
}
