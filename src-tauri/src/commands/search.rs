//! Global search (command palette): courses, documents and notes.
//!
//! Names and titles are short, so they get typo-tolerant fuzzy matching.
//! Note bodies and PDF text go through the full-text indexes (`note_fts`,
//! `doc_fts`), which ignore accents and match word prefixes.

use crate::db::Db;
use crate::error::AppResult;
use crate::models::SearchResult;
use rusqlite::Connection;
use std::collections::HashSet;
use tauri::State;

const MAX_RESULTS: usize = 20;

pub fn search(conn: &Connection, query: &str) -> AppResult<Vec<SearchResult>> {
    let q = query.trim();
    if q.chars().count() < 2 {
        return Ok(vec![]);
    }
    let needle = normalize(q);
    let mut scored: Vec<(f32, SearchResult)> = vec![];

    let mut stmt = conn.prepare_cached("SELECT id, name, emoji FROM courses")?;
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
        ))
    })? {
        let (id, name, emoji) = row?;
        let s = match_score(&name, &needle);
        if s > 5.0 {
            scored.push((
                s,
                SearchResult {
                    kind: "course".into(),
                    id,
                    title: name,
                    subtitle: emoji,
                    snippet: String::new(),
                    course_id: Some(id),
                    file_kind: String::new(),
                },
            ));
        }
    }

    let mut stmt = conn.prepare_cached("SELECT id, name, kind, course_id FROM files")?;
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Option<i64>>(3)?,
        ))
    })? {
        let (id, name, kind, course_id) = row?;
        let s = match_score(&name, &needle);
        if s > 5.0 {
            scored.push((
                s,
                SearchResult {
                    kind: "file".into(),
                    id,
                    title: name,
                    subtitle: "document".into(),
                    snippet: String::new(),
                    course_id,
                    file_kind: kind,
                },
            ));
        }
    }

    let mut stmt =
        conn.prepare_cached("SELECT id, title, substr(body, 1, 120), course_id FROM notes")?;
    for row in stmt.query_map([], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, Option<i64>>(3)?,
        ))
    })? {
        let (id, title, head, course_id) = row?;
        let s = match_score(&title, &needle);
        if s > 5.0 {
            scored.push((s, note_result(id, title, head, course_id)));
        }
    }

    let fts = fts_query(q);
    if !fts.is_empty() {
        let mut stmt = conn.prepare_cached(
            "SELECT n.id, n.title, snippet(note_fts, 1, '', '', '…', 10), n.course_id \
             FROM note_fts JOIN notes n ON n.id = note_fts.rowid \
             WHERE note_fts MATCH ?1 ORDER BY rank LIMIT 10",
        )?;
        for row in stmt.query_map([&fts], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<i64>>(3)?,
            ))
        })? {
            let (id, title, snip, course_id) = row?;
            scored.push((50.0, note_result(id, title, snip, course_id)));
        }

        let mut stmt = conn.prepare_cached(
            "SELECT f.id, f.name, f.kind, f.course_id, snippet(doc_fts, 1, '', '', '…', 10) \
             FROM doc_fts JOIN files f ON f.id = doc_fts.rowid \
             WHERE doc_fts MATCH ?1 ORDER BY rank LIMIT 10",
        )?;
        for row in stmt.query_map([&fts], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, String>(4)?,
            ))
        })? {
            let (id, name, kind, course_id, snip) = row?;
            // Content hits rank below good name hits.
            let s = match_score(&name, &needle).max(52.0);
            scored.push((
                s,
                SearchResult {
                    kind: "file".into(),
                    id,
                    title: name,
                    subtitle: "contenu".into(),
                    snippet: snip,
                    course_id,
                    file_kind: kind,
                },
            ));
        }
    }

    // Best first; one row per document or note (a content hit keeps its snippet).
    scored.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut seen = HashSet::new();
    let mut results = vec![];
    for (_, r) in scored {
        if !seen.insert((r.kind.clone(), r.id)) {
            continue;
        }
        results.push(r);
        if results.len() >= MAX_RESULTS {
            break;
        }
    }
    Ok(results)
}

fn note_result(id: i64, title: String, snippet: String, course_id: Option<i64>) -> SearchResult {
    SearchResult {
        kind: "note".into(),
        id,
        title: if title.is_empty() {
            "Note".into()
        } else {
            title
        },
        subtitle: "note".into(),
        snippet,
        course_id,
        file_kind: String::new(),
    }
}

#[tauri::command]
pub async fn global_search(db: State<'_, Db>, query: String) -> AppResult<Vec<SearchResult>> {
    db.read(move |conn| search(conn, &query)).await
}

// --- fuzzy matching for names (typo tolerant, partial) ---

fn normalize(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .flat_map(|c| -> Vec<char> {
            match c {
                'é' | 'è' | 'ê' | 'ë' => vec!['e'],
                'à' | 'â' | 'ä' => vec!['a'],
                'î' | 'ï' => vec!['i'],
                'ô' | 'ö' => vec!['o'],
                'ù' | 'û' | 'ü' => vec!['u'],
                'ç' => vec!['c'],
                'œ' => vec!['o', 'e'],
                'æ' => vec!['a', 'e'],
                c if c.is_alphanumeric() || c.is_whitespace() => vec![c],
                _ => vec![],
            }
        })
        .collect()
}

fn levenshtein(a: &[char], b: &[char]) -> usize {
    if a.is_empty() {
        return b.len();
    }
    if b.is_empty() {
        return a.len();
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0usize; b.len() + 1];
    for i in 1..=a.len() {
        curr[0] = i;
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            curr[j] = prev[j].min(curr[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

/// How well a name matches an already-normalized query, 0 (no) to 100 (exact).
fn match_score(text: &str, q: &str) -> f32 {
    let t = normalize(text);
    if q.is_empty() {
        return 0.0;
    }
    if t == q {
        return 100.0;
    }
    if t.starts_with(q) {
        return 95.0;
    }
    if t.contains(q) {
        return 80.0;
    }
    let tc: Vec<char> = t.chars().collect();
    let qc: Vec<char> = q.chars().collect();
    // Edit distance only makes sense between strings of similar length.
    if tc.len() <= qc.len() + 2 {
        let d = levenshtein(&tc, &qc);
        if d <= 1 {
            return 85.0;
        }
        if d <= 2 && qc.len() >= 4 {
            return 72.0;
        }
    }
    // Subsequence: "docu" in "document-foo.pdf".
    let mut qi = 0usize;
    for c in &tc {
        if qi < qc.len() && *c == qc[qi] {
            qi += 1;
        }
    }
    if qi == qc.len() {
        return 62.0;
    }
    // Most of a longer query in order: probably a typo, not noise.
    if qc.len() >= 5 && qi >= qc.len() * 2 / 3 {
        return 45.0;
    }
    0.0
}

/// Every word must appear; the last one may be unfinished (typing).
fn fts_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(|t| t.replace('"', " ").trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    let n = tokens.len();
    tokens
        .iter()
        .enumerate()
        .map(|(i, t)| {
            if i == n - 1 {
                format!("\"{t}\"*")
            } else {
                format!("\"{t}\"")
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations_for_tests;

    #[test]
    fn finds_names_with_typos_and_content_without_accents() {
        let conn = migrations_for_tests();
        conn.execute_batch(
            "INSERT INTO courses (id, name) VALUES (1, 'Mathématiques');
             INSERT INTO files (id, course_id, name, rel_path, kind) VALUES (7, 1, 'Chapitre 3.pdf', 'x.pdf', 'pdf');
             UPDATE doc_fts SET content = 'La fonction carrée est paire' WHERE rowid = 7;
             INSERT INTO notes (id, title, body) VALUES (3, 'Idées', 'Penser au théorème de Thalès');",
        )
        .unwrap();
        let kinds = |q: &str| -> Vec<(String, i64)> {
            search(&conn, q)
                .unwrap()
                .into_iter()
                .map(|r| (r.kind, r.id))
                .collect()
        };
        assert_eq!(kinds("mathematiques")[0], ("course".into(), 1));
        assert_eq!(
            kinds("mathematqiues")[0],
            ("course".into(), 1),
            "typo tolerated"
        );
        assert_eq!(kinds("carree"), [("file".into(), 7)]);
        assert_eq!(
            kinds("thal"),
            [("note".into(), 3)],
            "prefix of a word in a note body"
        );
        assert!(kinds("x").is_empty());
        let hit = &search(&conn, "carree").unwrap()[0];
        assert!(hit.snippet.contains("carrée"));
    }
}
