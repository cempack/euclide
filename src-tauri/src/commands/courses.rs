//! Courses and the classes attached to them (per-class progress and notes).

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{Course, CourseClass};
use rusqlite::{params, Connection, Row};
use tauri::State;

const COURSE_COLS: &str = "id, name, emoji, color, description, matiere, created_at";

fn map_course(r: &Row) -> rusqlite::Result<Course> {
    Ok(Course {
        id: r.get(0)?,
        name: r.get(1)?,
        emoji: r.get(2)?,
        color: r.get(3)?,
        description: r.get(4)?,
        matiere: r.get(5)?,
        created_at: r.get(6)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Course>> {
    let mut stmt =
        conn.prepare_cached(&format!("SELECT {COURSE_COLS} FROM courses ORDER BY name"))?;
    let rows = stmt.query_map([], map_course)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: i64) -> AppResult<Course> {
    Ok(conn.query_row(
        &format!("SELECT {COURSE_COLS} FROM courses WHERE id = ?1"),
        [id],
        map_course,
    )?)
}

pub fn create(
    conn: &Connection,
    name: &str,
    emoji: &str,
    color: &str,
    description: &str,
    matiere: &str,
) -> AppResult<Course> {
    conn.execute(
        "INSERT INTO courses (name, emoji, color, description, matiere) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, emoji, color, description, matiere],
    )?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, course: &Course) -> AppResult<()> {
    conn.execute(
        "UPDATE courses SET name=?1, emoji=?2, color=?3, description=?4, matiere=?5 WHERE id=?6",
        params![
            course.name,
            course.emoji,
            course.color,
            course.description,
            course.matiere,
            course.id
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn list_courses(db: State<'_, Db>) -> AppResult<Vec<Course>> {
    db.read(list).await
}

#[tauri::command]
pub async fn create_course(
    db: State<'_, Db>,
    name: String,
    emoji: String,
    color: String,
    description: String,
    matiere: String,
) -> AppResult<Course> {
    db.write(move |conn| {
        let course = create(conn, &name, &emoji, &color, &description, &matiere)?;
        // The locker folder is created again on the first import if this fails.
        let _ = std::fs::create_dir_all(crate::paths::courses_dir().join(course.id.to_string()));
        Ok(course)
    })
    .await
}

#[tauri::command]
pub async fn update_course(db: State<'_, Db>, course: Course) -> AppResult<()> {
    db.write(move |conn| update(conn, &course)).await
}

#[tauri::command]
pub async fn delete_course(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM courses WHERE id=?1", [id])?;
        // The locker folder may already be gone; the row is what matters.
        let _ = std::fs::remove_dir_all(crate::paths::courses_dir().join(id.to_string()));
        Ok(())
    })
    .await
}

// ---------------------------------------------------------------------------
// Classes attached to a course
// ---------------------------------------------------------------------------

const CLASS_SELECT: &str = "SELECT cc.id, cc.course_id, cc.class_name, cc.last_file_id, \
            f.name, f.kind, cc.last_item_id, si.title, sq.title, \
            cc.progress_updated_at, cc.notes \
     FROM course_classes cc \
     LEFT JOIN files f ON f.id = cc.last_file_id \
     LEFT JOIN sequence_items si ON si.id = cc.last_item_id \
     LEFT JOIN sequences sq ON sq.id = si.sequence_id";

fn map_class(r: &Row) -> rusqlite::Result<CourseClass> {
    Ok(CourseClass {
        id: r.get(0)?,
        course_id: r.get(1)?,
        class_name: r.get(2)?,
        last_file_id: r.get(3)?,
        last_file_name: r.get(4)?,
        last_file_kind: r.get(5)?,
        last_item_id: r.get(6)?,
        last_item_title: r.get(7)?,
        last_sequence_title: r.get(8)?,
        progress_updated_at: r.get(9)?,
        notes: r.get(10)?,
    })
}

pub fn list_classes(conn: &Connection, course_id: i64) -> AppResult<Vec<CourseClass>> {
    let mut stmt = conn.prepare_cached(&format!(
        "{CLASS_SELECT} WHERE cc.course_id = ?1 ORDER BY cc.class_name"
    ))?;
    let rows = stmt.query_map([course_id], map_class)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn attach_class(conn: &Connection, course_id: i64, class_name: &str) -> AppResult<CourseClass> {
    let class_name = class_name.trim();
    if class_name.is_empty() {
        return Err(AppError::user("Nom de classe vide"));
    }
    conn.execute(
        "INSERT OR IGNORE INTO course_classes (course_id, class_name) VALUES (?1, ?2)",
        params![course_id, class_name],
    )?;
    Ok(conn.query_row(
        &format!("{CLASS_SELECT} WHERE cc.course_id = ?1 AND cc.class_name = ?2"),
        params![course_id, class_name],
        map_class,
    )?)
}

#[tauri::command]
pub async fn list_course_classes(db: State<'_, Db>, course_id: i64) -> AppResult<Vec<CourseClass>> {
    db.read(move |conn| list_classes(conn, course_id)).await
}

#[tauri::command]
pub async fn attach_class_to_course(
    db: State<'_, Db>,
    course_id: i64,
    class_name: String,
) -> AppResult<CourseClass> {
    db.write(move |conn| attach_class(conn, course_id, &class_name))
        .await
}

#[tauri::command]
pub async fn detach_course_class(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute("DELETE FROM course_classes WHERE id=?1", [id])?;
        Ok(())
    })
    .await
}

/// The last document a class worked on.
#[tauri::command]
pub async fn set_course_class_progress(
    db: State<'_, Db>,
    course_id: i64,
    class_name: String,
    file_id: Option<i64>,
) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute(
            "UPDATE course_classes \
             SET last_file_id = ?1, progress_updated_at = datetime('now') \
             WHERE course_id = ?2 AND class_name = ?3",
            params![file_id, course_id, class_name],
        )?;
        Ok(())
    })
    .await
}

/// Where a class has got to in the course progression (a step of a sequence).
/// Independent from `last_file_id`: one answers "which document", the other
/// "which point of the chapter".
#[tauri::command]
pub async fn set_course_class_item(
    db: State<'_, Db>,
    course_id: i64,
    class_name: String,
    item_id: Option<i64>,
) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute(
            "UPDATE course_classes \
             SET last_item_id = ?1, progress_updated_at = datetime('now') \
             WHERE course_id = ?2 AND class_name = ?3",
            params![item_id, course_id, class_name],
        )?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn update_course_class_notes(
    db: State<'_, Db>,
    course_id: i64,
    class_name: String,
    notes: String,
) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute(
            "UPDATE course_classes SET notes = ?1 WHERE course_id = ?2 AND class_name = ?3",
            params![notes, course_id, class_name],
        )?;
        Ok(())
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

    #[test]
    fn courses_round_trip_sorted_by_name() {
        let conn = mem();
        create(&conn, "NSI", "code", "#1f6f65", "", "NSI").unwrap();
        let mut maths = create(
            &conn,
            "Maths",
            "calc",
            "#2c62a8",
            "Seconde",
            "Mathématiques",
        )
        .unwrap();
        maths.description = "Seconde générale".into();
        update(&conn, &maths).unwrap();
        let all = list(&conn).unwrap();
        assert_eq!(
            all.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            ["Maths", "NSI"]
        );
        assert_eq!(
            get(&conn, maths.id).unwrap().description,
            "Seconde générale"
        );
        assert_eq!(get(&conn, 999).unwrap_err().code(), "not_found");
    }

    #[test]
    fn each_class_has_its_own_progress_with_step_and_document() {
        let conn = crate::db::migrations_for_tests();
        let c = create(&conn, "NSI", "code", "#1f6f65", "", "NSI").unwrap();
        conn.execute_batch(&format!(
            "INSERT INTO sequences (id, course_id, title) VALUES (1, {id}, 'Listes');
             INSERT INTO files (id, course_id, name, rel_path, kind) VALUES (1, {id}, 'cours.pdf', 'courses/1/cours.pdf', 'pdf');
             INSERT INTO sequence_items (id, sequence_id, title, file_id, position) VALUES (1, 1, 'Intro', 1, 0), (2, 1, 'TP', NULL, 1);",
            id = c.id
        ))
        .unwrap();
        attach_class(&conn, c.id, "2NDE4").unwrap();
        attach_class(&conn, c.id, "2NDE7").unwrap();
        conn.execute(
            "UPDATE course_classes SET last_item_id = 1, last_file_id = 1 WHERE class_name = '2NDE4'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE course_classes SET last_item_id = 2 WHERE class_name = '2NDE7'",
            [],
        )
        .unwrap();
        let classes = list_classes(&conn, c.id).unwrap();
        let a = &classes[0];
        assert_eq!(
            (
                a.last_item_title.as_deref(),
                a.last_sequence_title.as_deref(),
                a.last_file_name.as_deref()
            ),
            (Some("Intro"), Some("Listes"), Some("cours.pdf"))
        );
        assert_eq!(classes[1].last_item_title.as_deref(), Some("TP"));
        // Deleting the step clears the pointer instead of leaving it dangling.
        conn.execute("DELETE FROM sequence_items WHERE id = 2", [])
            .unwrap();
        assert_eq!(list_classes(&conn, c.id).unwrap()[1].last_item_id, None);
    }

    #[test]
    fn attaching_a_class_twice_keeps_one_row() {
        let conn = mem();
        let c = create(&conn, "Maths", "calc", "#2c62a8", "", "Mathématiques").unwrap();
        let a = attach_class(&conn, c.id, " 2NDE4 ").unwrap();
        let b = attach_class(&conn, c.id, "2NDE4").unwrap();
        assert_eq!(a.id, b.id);
        assert_eq!(a.class_name, "2NDE4");
        assert_eq!(list_classes(&conn, c.id).unwrap().len(), 1);
        assert_eq!(attach_class(&conn, c.id, "  ").unwrap_err().code(), "user");
    }
}
