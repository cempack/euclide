//! The weekly timetable (typed in or synced from Pronote).

use crate::db::Db;
use crate::error::AppResult;
use crate::models::ScheduleEntry;
use chrono::Datelike;
use rusqlite::{params, Connection, Row};
use tauri::State;

const SCHEDULE_COLS: &str =
    "id, day_of_week, start_time, end_time, subject, room, course_id, source";

fn map_schedule(r: &Row) -> rusqlite::Result<ScheduleEntry> {
    Ok(ScheduleEntry {
        id: r.get(0)?,
        day_of_week: r.get(1)?,
        start_time: r.get(2)?,
        end_time: r.get(3)?,
        subject: r.get(4)?,
        room: r.get(5)?,
        course_id: r.get(6)?,
        source: r.get(7)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<ScheduleEntry>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {SCHEDULE_COLS} FROM schedule ORDER BY day_of_week, start_time"
    ))?;
    let rows = stmt.query_map([], map_schedule)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Classes of one weekday (1 = Monday … 7 = Sunday), by start time.
pub fn for_day(conn: &Connection, day_of_week: i64) -> AppResult<Vec<ScheduleEntry>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {SCHEDULE_COLS} FROM schedule WHERE day_of_week=?1 ORDER BY start_time"
    ))?;
    let rows = stmt.query_map([day_of_week], map_schedule)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn save(conn: &Connection, entry: &ScheduleEntry) -> AppResult<ScheduleEntry> {
    let id = if entry.id > 0 {
        conn.execute(
            "UPDATE schedule SET day_of_week=?1, start_time=?2, end_time=?3, subject=?4, room=?5, \
             course_id=?6, source=?7 WHERE id=?8",
            params![
                entry.day_of_week,
                entry.start_time,
                entry.end_time,
                entry.subject,
                entry.room,
                entry.course_id,
                entry.source,
                entry.id
            ],
        )?;
        entry.id
    } else {
        conn.execute(
            "INSERT INTO schedule (day_of_week, start_time, end_time, subject, room, course_id, source) \
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                entry.day_of_week,
                entry.start_time,
                entry.end_time,
                entry.subject,
                entry.room,
                entry.course_id,
                entry.source
            ],
        )?;
        conn.last_insert_rowid()
    };
    Ok(conn.query_row(
        &format!("SELECT {SCHEDULE_COLS} FROM schedule WHERE id=?1"),
        [id],
        map_schedule,
    )?)
}

#[tauri::command]
pub async fn list_schedule(db: State<'_, Db>) -> AppResult<Vec<ScheduleEntry>> {
    db.read(list).await
}

#[tauri::command]
pub async fn get_today_classes(db: State<'_, Db>) -> AppResult<Vec<ScheduleEntry>> {
    let today = chrono::Local::now().weekday().number_from_monday() as i64;
    db.read(move |conn| for_day(conn, today)).await
}

#[tauri::command]
pub async fn save_schedule_entry(
    db: State<'_, Db>,
    entry: ScheduleEntry,
) -> AppResult<ScheduleEntry> {
    db.write(move |conn| save(conn, &entry)).await
}

#[tauri::command]
pub async fn delete_schedule_entry(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM schedule WHERE id=?1", [id])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: i64, day: i64, start: &str, end: &str) -> ScheduleEntry {
        ScheduleEntry {
            id,
            day_of_week: day,
            start_time: start.into(),
            end_time: end.into(),
            subject: "NSI".into(),
            room: "Salle 12".into(),
            course_id: None,
            source: "manual".into(),
        }
    }

    #[test]
    fn save_inserts_then_updates_and_days_are_sorted() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(crate::db::SCHEMA).unwrap();
        let late = save(&conn, &entry(0, 4, "10:00", "11:00")).unwrap();
        let early = save(&conn, &entry(0, 4, "08:00", "09:00")).unwrap();
        save(&conn, &entry(0, 2, "08:00", "09:00")).unwrap();
        let mut moved = entry(late.id, 4, "10:00", "11:55");
        moved.room = "Salle 14".into();
        assert_eq!(save(&conn, &moved).unwrap().end_time, "11:55");
        let thursday = for_day(&conn, 4).unwrap();
        assert_eq!(
            thursday.iter().map(|e| e.id).collect::<Vec<_>>(),
            [early.id, late.id]
        );
        assert_eq!(list(&conn).unwrap().len(), 3);
    }
}
