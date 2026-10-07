//! Reminders, optionally tied to a course and repeating daily, weekly or monthly.

use crate::db::Db;
use crate::error::AppResult;
use crate::models::Reminder;
use chrono::{DateTime, Days, Local, Months, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use tauri::State;

const REMINDER_COLS: &str =
    "id, title, due_at, done, created_at, course_id, COALESCE(repeat_rule, 'none')";

fn map_reminder(r: &Row) -> rusqlite::Result<Reminder> {
    Ok(Reminder {
        id: r.get(0)?,
        title: r.get(1)?,
        due_at: r.get(2)?,
        done: r.get::<_, i64>(3)? != 0,
        created_at: r.get(4)?,
        course_id: r.get(5)?,
        repeat_rule: r.get(6)?,
    })
}

fn normalize_repeat(rule: Option<&str>) -> &'static str {
    match rule {
        Some("daily") => "daily",
        Some("weekly") => "weekly",
        Some("monthly") => "monthly",
        _ => "none",
    }
}

/// Next occurrence of a recurring reminder, from its own due date, computed on
/// the calendar of `tz` so « chaque mardi à 8 h » stays at 8 h across daylight
/// saving changes. Monthly keeps the day, clamped to the end of short months.
fn next_occurrence_in<Tz: TimeZone>(due_at: &str, rule: &str, tz: &Tz) -> Option<String> {
    let due: DateTime<Utc> = due_at.parse().ok()?;
    let local = due.with_timezone(tz).naive_local();
    let next = match rule {
        "daily" => local.checked_add_days(Days::new(1))?,
        "weekly" => local.checked_add_days(Days::new(7))?,
        "monthly" => local.checked_add_months(Months::new(1))?,
        _ => return None,
    };
    // A wall-clock time skipped by the spring change does not exist: use the hour after.
    let at = tz.from_local_datetime(&next).earliest().or_else(|| {
        tz.from_local_datetime(&(next + chrono::Duration::hours(1)))
            .earliest()
    })?;
    Some(at.with_timezone(&Utc).to_rfc3339())
}

fn next_occurrence(due_at: &str, rule: &str) -> Option<String> {
    next_occurrence_in(due_at, rule, &Local)
}

pub fn list(conn: &Connection) -> AppResult<Vec<Reminder>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {REMINDER_COLS} FROM reminders ORDER BY done, COALESCE(due_at, created_at)"
    ))?;
    let rows = stmt.query_map([], map_reminder)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn get(conn: &Connection, id: i64) -> AppResult<Reminder> {
    Ok(conn.query_row(
        &format!("SELECT {REMINDER_COLS} FROM reminders WHERE id=?1"),
        [id],
        map_reminder,
    )?)
}

pub fn create(
    conn: &Connection,
    title: &str,
    due_at: Option<&str>,
    course_id: Option<i64>,
    repeat_rule: Option<&str>,
) -> AppResult<Reminder> {
    conn.execute(
        "INSERT INTO reminders (title, due_at, course_id, repeat_rule) VALUES (?1, ?2, ?3, ?4)",
        params![title, due_at, course_id, normalize_repeat(repeat_rule)],
    )?;
    get(conn, conn.last_insert_rowid())
}

/// Ticking a reminder done.
///
/// For a recurring reminder with a due date, this rolls the due date forward
/// instead of ending the series: the row stays open and reappears at its next
/// occurrence. That is what makes « chaque mardi » useful.
pub fn toggle(conn: &Connection, id: i64, done: bool) -> AppResult<()> {
    if done {
        let row: Option<(Option<String>, String)> = conn
            .query_row(
                "SELECT due_at, COALESCE(repeat_rule, 'none') FROM reminders WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((Some(due), rule)) = row {
            if let Some(next) = next_occurrence(&due, &rule) {
                conn.execute(
                    "UPDATE reminders SET due_at=?1, done=0 WHERE id=?2",
                    params![next, id],
                )?;
                return Ok(());
            }
        }
    }
    conn.execute(
        "UPDATE reminders SET done=?1 WHERE id=?2",
        params![done as i64, id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn list_reminders(db: State<'_, Db>) -> AppResult<Vec<Reminder>> {
    db.read(list).await
}

#[tauri::command]
pub async fn create_reminder(
    db: State<'_, Db>,
    title: String,
    due_at: Option<String>,
    course_id: Option<i64>,
    repeat_rule: Option<String>,
) -> AppResult<Reminder> {
    db.write(move |conn| {
        create(
            conn,
            &title,
            due_at.as_deref(),
            course_id,
            repeat_rule.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn update_reminder(
    db: State<'_, Db>,
    id: i64,
    title: String,
    due_at: Option<String>,
    course_id: Option<i64>,
    repeat_rule: Option<String>,
) -> AppResult<Reminder> {
    db.write(move |conn| {
        conn.execute(
            "UPDATE reminders SET title=?1, due_at=?2, course_id=?3, repeat_rule=?4 WHERE id=?5",
            params![
                title,
                due_at,
                course_id,
                normalize_repeat(repeat_rule.as_deref()),
                id
            ],
        )?;
        get(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn toggle_reminder(db: State<'_, Db>, id: i64, done: bool) -> AppResult<()> {
    db.write(move |conn| toggle(conn, id, done)).await
}

#[tauri::command]
pub async fn delete_reminder(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM reminders WHERE id=?1", [id])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        conn
    }

    fn utc() -> FixedOffset {
        FixedOffset::east_opt(0).unwrap()
    }

    #[test]
    fn next_occurrence_keeps_time_of_day() {
        let next = |due, rule| next_occurrence_in(due, rule, &utc());
        assert_eq!(
            next("2026-03-10T08:15:00+00:00", "daily").unwrap(),
            "2026-03-11T08:15:00+00:00"
        );
        assert_eq!(
            next("2026-03-10T08:15:00+00:00", "weekly").unwrap(),
            "2026-03-17T08:15:00+00:00"
        );
        assert_eq!(
            next("2026-01-31T21:59:59+00:00", "monthly").unwrap(),
            "2026-02-28T21:59:59+00:00"
        );
        assert_eq!(next("2026-03-10T08:15:00+00:00", "none"), None);
        assert_eq!(normalize_repeat(Some("weekly")), "weekly");
        assert_eq!(normalize_repeat(Some("yearly")), "none");
    }

    #[test]
    fn weekly_reminder_keeps_its_wall_clock_hour_across_daylight_saving() {
        // Tuesday 8:30 in Paris (CET, UTC+1), the week before the spring change.
        let paris = chrono_tz::Europe::Paris;
        let next = next_occurrence_in("2026-03-24T07:30:00Z", "weekly", &paris).unwrap();
        // Still 8:30 in Paris, now CEST (UTC+2).
        assert_eq!(next, "2026-03-31T06:30:00+00:00");
        // Autumn: 8:30 CEST stays 8:30 CET.
        let next = next_occurrence_in("2026-10-20T06:30:00Z", "weekly", &paris).unwrap();
        assert_eq!(next, "2026-10-27T07:30:00+00:00");
    }

    #[test]
    fn completing_a_recurring_reminder_rolls_forward_and_a_one_shot_one_ends() {
        let conn = mem();
        let weekly = create(
            &conn,
            "Photocopies",
            Some("2026-03-10T08:15:00+00:00"),
            None,
            Some("weekly"),
        )
        .unwrap();
        let once = create(&conn, "DS", Some("2026-03-10T08:15:00+00:00"), None, None).unwrap();
        toggle(&conn, weekly.id, true).unwrap();
        toggle(&conn, once.id, true).unwrap();
        let weekly = get(&conn, weekly.id).unwrap();
        assert!(!weekly.done);
        assert!(weekly.due_at.unwrap().as_str() > "2026-03-16");
        assert!(get(&conn, once.id).unwrap().done);
        toggle(&conn, once.id, false).unwrap();
        assert!(!get(&conn, once.id).unwrap().done);
    }
}
