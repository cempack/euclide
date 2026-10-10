//! Usage events and the « Bilan » (time spent, documents opened…).

use crate::db::Db;
use crate::error::AppResult;
use crate::models::{RecapData, TopCourse, TopItem};
use chrono::{Duration, Local, NaiveTime, TimeZone, Utc};
use rusqlite::{params, Connection};
use tauri::State;

/// Events older than this are dropped by `prune` (the recap shows a month at most).
const KEEP_DAYS: i64 = 30;

/// Start of the period in UTC, in the `datetime('now')` format the tables use.
/// Comparing the raw column to a bound keeps the `created_at` index usable.
fn period_start(period: &str, now: chrono::DateTime<Local>) -> String {
    let days_back = match period {
        "week" => 6,
        "month" => 29,
        _ => 0,
    };
    let day = now.date_naive() - Duration::days(days_back);
    let midnight = day.and_time(NaiveTime::MIN);
    let start = Local
        .from_local_datetime(&midnight)
        .earliest()
        .unwrap_or(now)
        .with_timezone(&Utc);
    start.format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn recap(conn: &Connection, period: &str, since: &str) -> AppResult<RecapData> {
    let (files_opened, demos_run, reminders_done, active_minutes): (i64, i64, i64, i64) = conn
        .query_row(
            "SELECT \
           COALESCE(SUM(kind IN ('file_open', 'file_import')), 0), \
           COALESCE(SUM(kind = 'demo_run'), 0), \
           COALESCE(SUM(kind = 'reminder_done'), 0), \
           COALESCE(SUM(kind = 'active_tick'), 0) \
         FROM usage_events WHERE created_at >= ?1",
            [since],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;
    // Notes actually edited in the period (autosave would inflate usage_events).
    let notes_written: i64 = conn.query_row(
        "SELECT COUNT(*) FROM notes WHERE updated_at >= ?1",
        [since],
        |r| r.get(0),
    )?;

    // Minutes spent on each course: its active ticks (one a minute), as
    // `active_minutes` counts them, not every event that names it.
    let top_courses = {
        let mut stmt = conn.prepare_cached(
            "SELECT c.name, c.emoji, COUNT(*) AS cnt FROM usage_events u \
             JOIN courses c ON u.course_id = c.id \
             WHERE u.kind = 'active_tick' AND u.created_at >= ?1 \
             GROUP BY c.id ORDER BY cnt DESC LIMIT 5",
        )?;
        let rows = stmt.query_map([since], |r| {
            Ok(TopCourse {
                name: r.get(0)?,
                emoji: r.get(1)?,
                count: r.get(2)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    let top = |kinds: &str, limit: &str| -> AppResult<Vec<TopItem>> {
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT label, COUNT(*) AS cnt FROM usage_events \
             WHERE kind IN ({kinds}) AND created_at >= ?1 \
             GROUP BY label ORDER BY cnt DESC {limit}"
        ))?;
        let rows = stmt.query_map([since], |r| {
            Ok(TopItem {
                name: r.get(0)?,
                count: r.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    };

    Ok(RecapData {
        period_label: Some(period.to_string()),
        files_opened,
        notes_written,
        demos_run,
        reminders_done,
        active_minutes,
        top_courses,
        top_documents: top("'file_open', 'file_import'", "LIMIT 5")?,
        top_tools: top("'demo_run', 'whiteboard_save'", "")?,
        time_by_area: top("'active_tick'", "")?,
    })
}

/// Drop events past the retention window. Run once at startup, not on every read.
pub fn prune(conn: &Connection) -> AppResult<usize> {
    Ok(conn.execute(
        "DELETE FROM usage_events WHERE created_at < datetime('now', ?1)",
        [format!("-{KEEP_DAYS} days")],
    )?)
}

#[tauri::command]
pub async fn log_event(
    db: State<'_, Db>,
    kind: String,
    label: String,
    course_id: Option<i64>,
) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute(
            "INSERT INTO usage_events (kind, label, course_id) VALUES (?1,?2,?3)",
            params![kind, label, course_id],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn get_recap(db: State<'_, Db>, period: String) -> AppResult<RecapData> {
    let since = period_start(&period, Local::now());
    db.read(move |conn| recap(conn, &period, &since)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn
    }

    #[test]
    fn recap_counts_only_the_period() {
        let conn = mem();
        conn.execute_batch(
            "INSERT INTO usage_events (kind, label, created_at) VALUES \
               ('file_open', 'cours.pdf', '2026-10-06 09:00:00'), \
               ('file_open', 'cours.pdf', '2026-10-06 10:00:00'), \
               ('demo_run', 'Python', '2026-10-06 10:05:00'), \
               ('active_tick', 'Documents', '2026-10-06 10:06:00'), \
               ('file_open', 'old.pdf', '2026-09-01 10:00:00'); \
             INSERT INTO notes (title, body, updated_at) VALUES ('n', '', '2026-10-06 08:00:00');",
        )
        .unwrap();
        let r = recap(&conn, "today", "2026-10-06 00:00:00").unwrap();
        assert_eq!(
            (
                r.files_opened,
                r.demos_run,
                r.active_minutes,
                r.notes_written
            ),
            (2, 1, 1, 1)
        );
        assert_eq!(r.top_documents[0].name, "cours.pdf");
        assert_eq!(r.top_documents[0].count, 2);
        assert_eq!(r.time_by_area.len(), 1);
    }

    #[test]
    fn a_course_counts_its_active_minutes_only() {
        let conn = mem();
        conn.execute_batch(
            "INSERT INTO courses (id, name) VALUES (1, 'Mathématiques'), (2, 'NSI'); \
             INSERT INTO usage_events (kind, label, course_id, created_at) VALUES \
               ('active_tick', 'Notes', 1, '2026-10-06 10:00:00'), \
               ('active_tick', 'Notes', 1, '2026-10-06 10:01:00'), \
               ('file_open', 'cours.pdf', 2, '2026-10-06 10:02:00'), \
               ('file_open', 'td.pdf', 2, '2026-10-06 10:03:00'), \
               ('file_open', 'tp.pdf', 2, '2026-10-06 10:04:00'), \
               ('active_tick', 'Python', 2, '2026-10-06 10:05:00');",
        )
        .unwrap();
        let r = recap(&conn, "today", "2026-10-06 00:00:00").unwrap();
        let minutes: Vec<(&str, i64)> = r
            .top_courses
            .iter()
            .map(|c| (c.name.as_str(), c.count))
            .collect();
        // Three files opened in NSI are not three minutes.
        assert_eq!(minutes, vec![("Mathématiques", 2), ("NSI", 1)]);
    }

    #[test]
    fn period_start_is_local_midnight_in_utc() {
        let now = Local.with_ymd_and_hms(2026, 10, 6, 15, 30, 0).unwrap();
        let today = period_start("today", now);
        let expected = Local
            .with_ymd_and_hms(2026, 10, 6, 0, 0, 0)
            .unwrap()
            .with_timezone(&Utc)
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        assert_eq!(today, expected);
        assert!(period_start("week", now) < today);
    }

    #[test]
    fn prune_keeps_recent_events() {
        let conn = mem();
        conn.execute_batch(
            "INSERT INTO usage_events (kind, label, created_at) VALUES \
               ('file_open', 'old', datetime('now', '-40 days')), \
               ('file_open', 'new', datetime('now', '-1 days'));",
        )
        .unwrap();
        assert_eq!(prune(&conn).unwrap(), 1);
    }
}
