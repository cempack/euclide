//! The main window, built in setup instead of from the config so it opens at
//! its final size, in the saved theme (the Windows title bar included) and
//! already painted in the page colour. The boot state the frontend needs for
//! its first render (appearance, open tabs, Pronote status…) is injected
//! before any script runs: startup costs no IPC round trip and shows no flash.

use rusqlite::Connection;
use serde_json::{json, Map, Value};
use tauri::webview::NewWindowResponse;
use tauri::window::Color;
use tauri::{AppHandle, Manager, Theme, Url, WebviewWindow, WebviewWindowBuilder};

use crate::commands::settings::{get_setting_raw, UI_SETTINGS};

/// `--eu-canvas` in src/styles.css, light and dark.
const CANVAS_LIGHT: Color = Color(250, 249, 248, 255);
const CANVAS_DARK: Color = Color(19, 19, 19, 255);

/// Every UI setting (null when never saved), the Pronote status, the version
/// Euclide was just updated from and the restore it just did if any, whether
/// the engine can cross-fade the window (`crossFade`), and a nonce that lets
/// the frontend tell a fresh boot from a reload of the page.
pub fn state(
    conn: &Connection,
    updated_from: Option<&str>,
    restored: Option<&crate::jobs::backup::RestoreReport>,
) -> Value {
    let settings: Map<String, Value> = UI_SETTINGS
        .iter()
        .map(|key| {
            let value = get_setting_raw(conn, key).map_or(Value::Null, Value::String);
            (key.to_string(), value)
        })
        .collect();
    json!({
        "nonce": uuid::Uuid::new_v4().to_string(),
        "settings": settings,
        "pronote": crate::commands::pronote::status(conn),
        "updated": updated_from.map(|from| json!({ "from": from, "to": env!("CARGO_PKG_VERSION") })),
        "restored": restored,
        "crossFade": !crate::linux_env::compositing_off(),
    })
}

/// The window size: 80 % of the screen, within what the layout needs and what
/// still reads well on a large monitor.
fn window_size(app: &tauri::App) -> Option<(f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let width = monitor.size().width as f64 / scale;
    let height = monitor.size().height as f64 / scale;
    Some((
        (width * 0.8).clamp(1000.0, 1280.0),
        (height * 0.8).clamp(680.0, 840.0),
    ))
}

/// Euclide's own pages: the app (`tauri://localhost`, `http://tauri.localhost`
/// on Windows) and, in a dev build, Vite's. Anything else in the window would
/// replace Euclide with a website the teacher has no way back from.
fn is_own_page(url: &Url, dev: Option<&Url>) -> bool {
    match url.scheme() {
        "tauri" | "about" => true,
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || dev.is_some_and(|dev| dev.origin() == url.origin())
        }
        _ => false,
    }
}

/// A link to a website (in a PDF, say) opens in the browser instead.
fn open_outside(app: &AppHandle, url: &Url) {
    let app = app.clone();
    let url = url.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = crate::commands::links::open_external(&app, &url) {
            crate::applog::warn(format!("[liens] lien non ouvert : {}", e.message()));
        }
    });
}

pub fn create_main_window(app: &tauri::App, boot: &Value) -> tauri::Result<WebviewWindow> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .unwrap_or_default();
    let theme = match boot["settings"]["theme"].as_str() {
        Some("light") => Some(Theme::Light),
        Some("dark") => Some(Theme::Dark),
        _ => None,
    };
    let script = format!("window.__EUCLIDE_BOOT__ = {boot};");
    let dev = app
        .config()
        .build
        .dev_url
        .clone()
        .filter(|_| tauri::is_dev());
    let (navigating, popping_up) = (app.handle().clone(), app.handle().clone());
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?
        .initialization_script(script)
        .on_navigation(move |url| {
            let own = is_own_page(url, dev.as_ref());
            if !own {
                open_outside(&navigating, url);
            }
            own
        })
        .on_new_window(move |url, _| {
            open_outside(&popping_up, &url);
            NewWindowResponse::Deny
        })
        .theme(theme)
        .background_color(if theme == Some(Theme::Dark) {
            CANVAS_DARK
        } else {
            CANVAS_LIGHT
        })
        .visible(false);
    if let Some((width, height)) = window_size(app) {
        builder = builder.inner_size(width, height).center();
    }
    let window = builder.build()?;
    // "auto" follows the system, known only once the window exists.
    if theme.is_none() && window.theme().ok() == Some(Theme::Dark) {
        let _ = window.set_background_color(Some(CANVAS_DARK));
    }
    window.show()?;
    Ok(window)
}

/// The window may already exist when a second launch asks for it.
pub fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_euclide_pages_load_in_its_window() {
        let url = |s: &str| Url::parse(s).unwrap();
        let dev = url("http://localhost:1420");
        for own in [
            "tauri://localhost/",
            "http://tauri.localhost/index.html",
            "https://tauri.localhost/",
            "about:blank",
        ] {
            assert!(is_own_page(&url(own), None), "{own}");
        }
        assert!(is_own_page(
            &url("http://localhost:1420/?gallery"),
            Some(&dev)
        ));
        for outside in [
            "https://www.education.gouv.fr/",
            "http://localhost:1420/",
            "http://localhost:3000/",
            "mailto:prof@example.fr",
            "file:///C:/Users/prof/cours.pdf",
            "data:text/html,<p>x</p>",
        ] {
            assert!(!is_own_page(&url(outside), None), "{outside}");
        }
        assert!(!is_own_page(&url("http://localhost:3000/"), Some(&dev)));
    }

    #[test]
    fn boot_state_lists_every_ui_setting() {
        let conn = crate::db::migrations_for_tests();
        crate::commands::settings::put(&conn, "theme", "dark").unwrap();
        crate::commands::settings::put(&conn, "pronote_password", "secret").unwrap();
        let restored = crate::jobs::backup::RestoreReport {
            name: "2026-10-05.db".into(),
            error: None,
        };
        let boot = state(&conn, Some("0.2.0"), Some(&restored));
        let settings = boot["settings"].as_object().unwrap();
        assert_eq!(settings.len(), UI_SETTINGS.len());
        assert_eq!(settings["theme"], "dark");
        assert_eq!(settings["density"], Value::Null);
        // Only UI settings: nothing private reaches the page.
        assert!(!boot.to_string().contains("secret"));
        assert_eq!(boot["pronote"]["connected"], false);
        assert_eq!(boot["nonce"].as_str().unwrap().len(), 36);
        assert_eq!(boot["updated"]["from"], "0.2.0");
        assert_eq!(boot["restored"]["name"], "2026-10-05.db");
        let plain = state(&conn, None, None);
        assert!(plain["updated"].is_null());
        assert!(plain["restored"].is_null());
    }
}
