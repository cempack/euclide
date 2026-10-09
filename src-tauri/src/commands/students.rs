//! A class's students, for drawing a name and making groups (the classroom
//! screen). Names only, as Pronote gives them or as the teacher pastes them,
//! kept in the database on the key and nowhere else; « Effacer » removes them.

use crate::db::Db;
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

/// A class that has a list, and how many names it holds.
#[derive(Serialize, Debug, PartialEq)]
pub struct StudentList {
    pub class_name: String,
    pub count: i64,
}

/// The class's names, in the list's order.
pub fn list(conn: &Connection, class_name: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare_cached(
        "SELECT name FROM class_students WHERE class_name=?1 ORDER BY position, id",
    )?;
    let names = stmt.query_map([class_name.trim()], |r| r.get(0))?;
    Ok(names.collect::<Result<_, _>>()?)
}

/// The class's list becomes `names`: in that order, spaces tidied, without
/// blanks, a name given twice kept once.
pub fn replace(
    conn: &mut Connection,
    class_name: &str,
    names: &[String],
) -> AppResult<Vec<String>> {
    let class_name = class_name.trim();
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM class_students WHERE class_name=?1",
        [class_name],
    )?;
    {
        let mut insert = tx.prepare(
            "INSERT INTO class_students (class_name, name, position) VALUES (?1, ?2, ?3)",
        )?;
        let mut seen = std::collections::HashSet::new();
        for name in names {
            let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
            if name.is_empty() || !seen.insert(name.to_lowercase()) {
                continue;
            }
            insert.execute(params![class_name, name, seen.len() as i64])?;
        }
    }
    let names = list(&tx, class_name)?;
    tx.commit()?;
    Ok(names)
}

pub fn lists(conn: &Connection) -> AppResult<Vec<StudentList>> {
    let mut stmt = conn.prepare_cached(
        "SELECT class_name, COUNT(*) FROM class_students GROUP BY class_name ORDER BY class_name",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(StudentList {
            class_name: r.get(0)?,
            count: r.get(1)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[tauri::command]
pub async fn students_for_class(db: State<'_, Db>, class_name: String) -> AppResult<Vec<String>> {
    db.read(move |conn| list(conn, &class_name)).await
}

/// The classes that have a list: for the picker's class menu and Réglages.
#[tauri::command]
pub async fn student_lists(db: State<'_, Db>) -> AppResult<Vec<StudentList>> {
    db.read(lists).await
}

/// A pasted list, one name per line already split by the page.
#[tauri::command]
pub async fn set_students(
    db: State<'_, Db>,
    class_name: String,
    names: Vec<String>,
) -> AppResult<Vec<String>> {
    db.write(move |conn| replace(conn, &class_name, &names))
        .await
}

#[tauri::command]
pub async fn clear_students(db: State<'_, Db>, class_name: String) -> AppResult<()> {
    db.write(move |conn| {
        conn.execute(
            "DELETE FROM class_students WHERE class_name=?1",
            [class_name.trim()],
        )?;
        Ok(())
    })
    .await
}

/// Every list at once (Réglages, Données).
#[tauri::command]
pub async fn clear_all_students(db: State<'_, Db>) -> AppResult<()> {
    db.write(|conn| {
        conn.execute("DELETE FROM class_students", [])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_list_is_replaced_whole_in_its_order() {
        let mut conn = crate::db::migrations_for_tests();
        let kept = replace(
            &mut conn,
            " 2NDE7 ",
            &names(&["Léa  Dupont", "Hugo Martin", "", "léa dupont", "  Zoé "]),
        )
        .unwrap();
        assert_eq!(kept, ["Léa Dupont", "Hugo Martin", "Zoé"]);
        replace(&mut conn, "1G3", &names(&["Noah"])).unwrap();
        assert_eq!(
            replace(&mut conn, "2NDE7", &names(&["Zoé", "Inès"])).unwrap(),
            ["Zoé", "Inès"]
        );
        assert_eq!(list(&conn, "2NDE7").unwrap(), ["Zoé", "Inès"]);
        assert_eq!(
            lists(&conn).unwrap(),
            [
                StudentList {
                    class_name: "1G3".into(),
                    count: 1
                },
                StudentList {
                    class_name: "2NDE7".into(),
                    count: 2
                }
            ]
        );
        assert!(list(&conn, "TG2").unwrap().is_empty());
    }
}
