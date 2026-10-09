//! Extracts the text of imported PDFs for the search, one at a time, in the
//! background. Imports return as soon as the files are copied; the indexer
//! picks up every file marked `index_state = 'pending'` (also after a restart
//! or a crash) and tells the webview when results change.

use crate::db::Db;
use crate::error::AppResult;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;

/// Webview event: data changed in the background; `scope` says which
/// queries to refresh.
pub const INVALIDATE_EVENT: &str = "eu://invalidate";

#[derive(Clone, Default)]
pub struct Indexer(Arc<Notify>);

impl Indexer {
    /// Wake the indexer: there may be new work.
    pub fn kick(&self) {
        self.0.notify_one();
    }
}

/// Start the indexer loop. It waits to be kicked; call `kick` once after
/// startup to resume work left from a previous session.
pub fn spawn(app: AppHandle) {
    let indexer = app.state::<Indexer>().inner().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            indexer.0.notified().await;
            while let Ok(Some(done)) = index_next(&app).await {
                if done.remaining == 0 {
                    let _ = app.emit(INVALIDATE_EVENT, json!({ "scope": "search" }));
                }
            }
        }
    });
}

struct Progress {
    remaining: i64,
}

/// Text read before page breaks were kept (0.6.0) cannot say on which page
/// a word is: every PDF is read again, once, in the background. A setting
/// remembers it was done.
pub fn reread_for_pages(conn: &mut Connection) -> AppResult<bool> {
    let done: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM settings WHERE key = 'index_pages')",
        [],
        |r| r.get(0),
    )?;
    if done {
        return Ok(false);
    }
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE files SET index_state = 'pending' WHERE kind = 'pdf'",
        [],
    )?;
    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('index_pages', '1')",
        [],
    )?;
    tx.commit()?;
    Ok(true)
}

/// Index one pending PDF. `Ok(None)` when there is nothing left.
async fn index_next(app: &AppHandle) -> AppResult<Option<Progress>> {
    let db = app.state::<Db>().inner().clone();
    let next: Option<(i64, String)> = db
        .read(|conn| {
            Ok(conn
                .query_row(
                    "SELECT id, rel_path FROM files WHERE index_state = 'pending' ORDER BY id LIMIT 1",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?)
        })
        .await?;
    let Some((id, rel)) = next else {
        return Ok(None);
    };

    let path = crate::fsx::abs_path(&rel)?;
    let Ok(reply) = crate::sidecar::call(
        app,
        "extract_pdf",
        &json!({ "path": path.to_string_lossy() }),
    )
    .await
    else {
        // The sidecar is not available right now: leave the file pending for the next kick.
        return Ok(None);
    };
    let text = reply
        .get("text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();
    // A PDF with no text (scan, protected, damaged) is not retried forever.
    let state = if text.trim().is_empty() {
        "failed"
    } else {
        "done"
    };

    let remaining = db
        .write(move |conn| {
            let tx = conn.transaction()?;
            tx.execute(
                "UPDATE doc_fts SET content = ?1 WHERE rowid = ?2",
                params![text, id],
            )?;
            tx.execute(
                "UPDATE files SET index_state = ?1 WHERE id = ?2",
                params![state, id],
            )?;
            tx.commit()?;
            Ok(conn.query_row(
                "SELECT COUNT(*) FROM files WHERE index_state = 'pending'",
                [],
                |r| r.get::<_, i64>(0),
            )?)
        })
        .await?;
    let _ = app.emit("eu://index-progress", json!({ "remaining": remaining }));
    Ok(Some(Progress { remaining }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations_for_tests;

    #[test]
    fn pdfs_are_read_again_once_for_their_pages() {
        let mut conn = migrations_for_tests();
        conn.execute_batch(
            "INSERT INTO files (id, name, rel_path, kind, index_state) VALUES
               (1, 'a.pdf', 'a.pdf', 'pdf', 'done'),
               (2, 'b.pdf', 'b.pdf', 'pdf', 'failed'),
               (3, 'c.png', 'c.png', 'image', 'skip');",
        )
        .unwrap();
        let states = |conn: &Connection| -> Vec<String> {
            let mut stmt = conn
                .prepare("SELECT index_state FROM files ORDER BY id")
                .unwrap();
            let rows = stmt.query_map([], |r| r.get(0)).unwrap();
            rows.map(|r| r.unwrap()).collect()
        };
        assert!(reread_for_pages(&mut conn).unwrap());
        assert_eq!(states(&conn), ["pending", "pending", "skip"]);
        conn.execute(
            "UPDATE files SET index_state = 'done' WHERE kind = 'pdf'",
            [],
        )
        .unwrap();
        assert!(!reread_for_pages(&mut conn).unwrap(), "only once");
        assert_eq!(states(&conn), ["done", "done", "skip"]);
    }
}
