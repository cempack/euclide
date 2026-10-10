//! Anonymous usage statistics, once a day: how long each part of Euclide was
//! open and how many times each kind of action was done (notes saved, files
//! imported, Python scripts run…). Never what it was done on: no title, no
//! name, no file, no course, no student. A random id tells one copy of
//! Euclide from another, with its version and system.
//!
//! Réglages, Données turns it off (`usage_stats` = "0"), and shows what
//! would be sent. Reports start the day the feature arrives: what happened
//! before is not sent, nor what happened while it was off.

use std::collections::BTreeMap;
use std::time::Duration;

use chrono::{Days, Local, NaiveDate, TimeZone, Utc};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::commands::settings::{get_setting_raw, put};
use crate::db::Db;
use crate::error::AppResult;

const ENDPOINT: &str = "https://euclide.elliotmoreau.fr/api/usage";
/// "0" when the teacher turned it off; on otherwise.
pub const SETTING: &str = "usage_stats";
const INSTALL: &str = "stats_install_id";
/// The last whole day the server confirmed: the next report starts after it.
const SENT_THROUGH: &str = "stats_sent_through";
/// At most this many days back, after a long time offline.
const MAX_DAYS: u64 = 30;

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Day {
    pub day: String,
    pub minutes: u32,
    pub areas: BTreeMap<String, u32>,
    pub events: BTreeMap<String, u32>,
}

#[derive(Serialize, Debug)]
pub struct Report {
    pub v: u8,
    pub install: String,
    pub app: &'static str,
    pub os: &'static str,
    pub arch: &'static str,
    pub portable: bool,
    pub days: Vec<Day>,
}

fn system() -> &'static str {
    match std::env::consts::OS {
        os @ ("windows" | "linux" | "macos") => os,
        _ => "other",
    }
}

fn arch() -> &'static str {
    match std::env::consts::ARCH {
        a @ ("x86_64" | "aarch64" | "x86") => a,
        _ => "other",
    }
}

fn portable() -> bool {
    crate::portable_update::is_windows_portable() || std::env::var_os("APPIMAGE").is_some()
}

pub fn enabled(conn: &Connection) -> bool {
    get_setting_raw(conn, SETTING).as_deref() != Some("0")
}

/// A screen's name (a tab kind) or an action's: anything else is not sent.
fn key_ok(key: &str, extra: char, max: usize) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some('a'..='z'))
        && key.len() >= 2
        && key.len() <= max
        && chars.all(|c| c.is_ascii_lowercase() || c == extra)
}

/// Local midnight of `day`, as `usage_events.created_at` writes time (UTC).
fn utc_start(day: NaiveDate) -> String {
    let midnight = day.and_hms_opt(0, 0, 0).expect("midnight exists");
    let local = Local
        .from_local_datetime(&midnight)
        .earliest()
        .unwrap_or_else(|| Local.from_utc_datetime(&midnight));
    local
        .with_timezone(&Utc)
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn ymd(day: NaiveDate) -> String {
    day.format("%Y-%m-%d").to_string()
}

/// The first day the next report covers.
fn first_day(conn: &Connection, today: NaiveDate) -> AppResult<NaiveDate> {
    let oldest = today - Days::new(MAX_DAYS - 1);
    match get_setting_raw(conn, SENT_THROUGH)
        .and_then(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
    {
        Some(sent) => Ok((sent + Days::new(1)).max(oldest)),
        // The first time: from today, not the weeks of history already kept.
        // Written down, so days offline after it still go, later.
        None => {
            put(conn, SENT_THROUGH, &ymd(today - Days::new(1)))?;
            Ok(today)
        }
    }
}

/// Each day from `from` to `today`, with what was done on it.
pub fn days(conn: &Connection, from: NaiveDate, today: NaiveDate) -> AppResult<Vec<Day>> {
    let mut stmt = conn.prepare_cached(
        "SELECT date(created_at, 'localtime') AS d, kind, \
                CASE WHEN kind = 'active_tick' THEN label ELSE '' END AS area, COUNT(*) \
         FROM usage_events WHERE created_at >= ?1 \
         GROUP BY d, kind, area ORDER BY d",
    )?;
    let rows = stmt.query_map([utc_start(from)], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, u32>(3)?,
        ))
    })?;
    let last = ymd(today);
    let mut out: Vec<Day> = Vec::new();
    for row in rows {
        let (day, kind, area, n) = row?;
        if day > last {
            continue;
        }
        if out.last().map(|d| &d.day) != Some(&day) {
            out.push(Day {
                day: day.clone(),
                minutes: 0,
                areas: BTreeMap::new(),
                events: BTreeMap::new(),
            });
        }
        let d = out.last_mut().expect("pushed above");
        if kind == "active_tick" {
            d.minutes += n;
            let area = if key_ok(&area, '-', 24) {
                area
            } else {
                "other".to_string()
            };
            *d.areas.entry(area).or_default() += n;
        } else if key_ok(&kind, '_', 32) {
            *d.events.entry(kind).or_default() += n;
        }
    }
    Ok(out)
}

fn install_id(conn: &Connection) -> AppResult<String> {
    if let Some(id) = get_setting_raw(conn, INSTALL).filter(|id| uuid::Uuid::parse_str(id).is_ok())
    {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    put(conn, INSTALL, &id)?;
    Ok(id)
}

/// The report as it would go now, or None when there is nothing to send.
pub fn report(conn: &Connection, today: NaiveDate) -> AppResult<Option<Report>> {
    let days = days(conn, first_day(conn, today)?, today)?;
    if days.is_empty() {
        return Ok(None);
    }
    Ok(Some(Report {
        v: 1,
        install: install_id(conn)?,
        app: env!("CARGO_PKG_VERSION"),
        os: system(),
        arch: arch(),
        portable: portable(),
        days,
    }))
}

/// After the server took it: every day before today is done.
fn mark_sent(conn: &Connection, today: NaiveDate) -> AppResult<()> {
    put(conn, SENT_THROUGH, &ymd(today - Days::new(1)))
}

/// Turned off: what happens now is never sent, even once it is back on.
fn skip_until_tomorrow(conn: &Connection, today: NaiveDate) -> AppResult<()> {
    put(conn, SENT_THROUGH, &ymd(today))
}

/// Where reports go. A debug build may send them elsewhere (EUCLIDE_STATS_URL),
/// to a site running on this machine, say.
fn endpoint() -> String {
    #[cfg(debug_assertions)]
    if let Ok(url) = std::env::var("EUCLIDE_STATS_URL") {
        return url;
    }
    ENDPOINT.to_string()
}

/// Seconds after startup before the first report; a debug build may say
/// fewer (EUCLIDE_STATS_DELAY).
fn first_delay() -> u64 {
    #[cfg(debug_assertions)]
    if let Some(s) = std::env::var("EUCLIDE_STATS_DELAY")
        .ok()
        .and_then(|s| s.parse().ok())
    {
        return s;
    }
    120
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Well after startup: the first minutes belong to the lesson.
        tokio::time::sleep(Duration::from_secs(first_delay())).await;
        loop {
            run_once(&app).await;
            tokio::time::sleep(Duration::from_secs(6 * 3600)).await;
        }
    });
}

async fn run_once(app: &AppHandle) {
    let db = app.state::<Db>().inner().clone();
    let today = Local::now().date_naive();
    let prepared = db
        .write(move |conn| {
            if !enabled(conn) {
                skip_until_tomorrow(conn, today)?;
                return Ok(None);
            }
            report(conn, today)
        })
        .await;
    let report = match prepared {
        Ok(Some(report)) => report,
        Ok(None) => return,
        Err(e) => {
            crate::applog::warn(format!("[stats] {}", e.message()));
            return;
        }
    };
    let Ok(body) = serde_json::to_vec(&report) else {
        return;
    };
    // Linux and macOS: rustls, with the provider the updater installs too.
    #[cfg(not(windows))]
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let Ok(client) = reqwest::Client::builder()
        .user_agent(concat!("Euclide/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(20))
        .build()
    else {
        return;
    };
    match client
        .post(endpoint())
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            let _ = db.write(move |conn| mark_sent(conn, today)).await;
        }
        // Refused: a report the server does not understand, worth a line.
        Ok(res) if res.status().is_client_error() => {
            crate::applog::warn(format!("[stats] refused: {}", res.status()));
        }
        // No network (a school's, often), or the server away: next time.
        _ => {}
    }
}

/// What « Voir ce qui est envoyé » shows: the next report, as JSON.
#[tauri::command]
pub async fn stats_preview(db: tauri::State<'_, Db>) -> AppResult<serde_json::Value> {
    let today = Local::now().date_naive();
    db.write(move |conn| {
        let report = report(conn, today)?;
        Ok(serde_json::json!({
            "enabled": enabled(conn),
            "endpoint": endpoint(),
            "report": report,
        }))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn
    }

    fn event(conn: &Connection, kind: &str, label: &str, at: NaiveDate, hour: u32) {
        let local = at.and_hms_opt(hour, 0, 0).unwrap();
        let utc = Local
            .from_local_datetime(&local)
            .earliest()
            .unwrap()
            .with_timezone(&Utc)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        conn.execute(
            "INSERT INTO usage_events (kind, label, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![kind, label, utc],
        )
        .unwrap();
    }

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn counts_per_day_and_never_a_label_but_a_screen() {
        let conn = mem();
        let today = day("2026-10-10");
        let yesterday = day("2026-10-09");
        for _ in 0..3 {
            event(&conn, "active_tick", "pdf", yesterday, 10);
        }
        event(&conn, "active_tick", "board", yesterday, 11);
        // A label that is a name or a title is never sent: it is « other ».
        event(
            &conn,
            "active_tick",
            "Chapitre 3 — Fonctions",
            yesterday,
            11,
        );
        event(&conn, "file_import", "Évaluation DUPONT.pdf", yesterday, 12);
        event(&conn, "file_import", "copie.pdf", yesterday, 12);
        event(&conn, "demo_run", "tortue.py", today, 9);
        event(&conn, "active_tick", "python", today, 9);

        let got = days(&conn, yesterday, today).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].day, "2026-10-09");
        assert_eq!(got[0].minutes, 5);
        assert_eq!(
            got[0].areas,
            BTreeMap::from([("board".into(), 1), ("other".into(), 1), ("pdf".into(), 3)])
        );
        assert_eq!(got[0].events, BTreeMap::from([("file_import".into(), 2)]));
        assert_eq!(got[1].events, BTreeMap::from([("demo_run".into(), 1)]));

        let json = serde_json::to_string(&got).unwrap();
        assert!(!json.contains("DUPONT") && !json.contains("Chapitre") && !json.contains("tortue"));
    }

    #[test]
    fn starts_the_day_it_arrives_and_resumes_after_what_was_sent() {
        let conn = mem();
        let today = day("2026-10-10");
        event(&conn, "active_tick", "pdf", day("2026-10-01"), 10);
        // Never sent: the history before today stays home.
        assert!(report(&conn, today).unwrap().is_none());
        event(&conn, "active_tick", "note", today, 10);
        let first = report(&conn, today).unwrap().unwrap();
        assert_eq!(first.days.len(), 1);
        assert_eq!(first.days[0].day, "2026-10-10");
        // The same copy keeps its id.
        assert_eq!(
            report(&conn, today).unwrap().unwrap().install,
            first.install
        );

        // Not sent (no network): two days later, both days go.
        let later = day("2026-10-12");
        event(&conn, "active_tick", "pdf", day("2026-10-11"), 9);
        let offline = report(&conn, later).unwrap().unwrap();
        assert_eq!(
            offline
                .days
                .iter()
                .map(|d| d.day.as_str())
                .collect::<Vec<_>>(),
            ["2026-10-10", "2026-10-11"]
        );
        conn.execute(
            "DELETE FROM usage_events WHERE created_at >= ?1",
            [utc_start(day("2026-10-11"))],
        )
        .unwrap();

        // Sent today; tomorrow's report starts today, with today's whole total.
        mark_sent(&conn, today).unwrap();
        let tomorrow = day("2026-10-11");
        event(&conn, "active_tick", "board", tomorrow, 9);
        let next = report(&conn, tomorrow).unwrap().unwrap();
        assert_eq!(
            next.days.iter().map(|d| d.day.as_str()).collect::<Vec<_>>(),
            ["2026-10-10", "2026-10-11"]
        );
    }

    #[test]
    fn what_happens_while_it_is_off_is_never_sent() {
        let conn = mem();
        let today = day("2026-10-10");
        put(&conn, SETTING, "0").unwrap();
        assert!(!enabled(&conn));
        event(&conn, "active_tick", "pdf", today, 10);
        skip_until_tomorrow(&conn, today).unwrap();
        // Back on the same day: today stays home.
        put(&conn, SETTING, "1").unwrap();
        assert!(report(&conn, today).unwrap().is_none());
    }

    #[test]
    fn screen_and_action_names_have_one_shape() {
        assert!(key_ok("pdf", '-', 24));
        assert!(key_ok("class-content", '-', 24));
        assert!(key_ok("note_write", '_', 32));
        assert!(!key_ok("Notes", '-', 24));
        assert!(!key_ok("a", '-', 24));
        assert!(!key_ok("élève", '-', 24));
        assert!(!key_ok("note write", '_', 32));
    }
}
