//! `eufile://` serves the library to the webview by id:
//! `/file/<id>` (a document) and `/version/<id>` (a saved version).
//!
//! The webview never handles absolute paths, and nothing outside the data
//! folder can be reached. Range requests are answered with partial content,
//! so large PDFs can be read piece by piece.

use crate::db::Db;
use crate::error::{AppError, AppResult};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager};

pub const SCHEME: &str = "eufile";

pub fn handle(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    match serve(app, request) {
        Ok(response) => response,
        Err(e) => {
            let status = match e.code() {
                "not_found" => StatusCode::NOT_FOUND,
                "user" => StatusCode::BAD_REQUEST,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            text(status, &e.message())
        }
    }
}

fn text(status: StatusCode, body: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(body.as_bytes().to_vec())
        .unwrap_or_default()
}

fn resolve(app: &AppHandle, path: &str) -> AppResult<PathBuf> {
    let path = crate::fsx::percent_decode(path)?;
    let mut parts = path.trim_matches('/').split('/');
    let (kind, id) = (
        parts.next(),
        parts.next().and_then(|s| s.parse::<i64>().ok()),
    );
    let (Some(kind), Some(id), None) = (kind, id, parts.next()) else {
        return Err(AppError::user("Adresse de fichier invalide."));
    };
    let table = match kind {
        "file" => "files",
        "version" => "file_versions",
        _ => return Err(AppError::user("Adresse de fichier invalide.")),
    };
    let db = app.state::<Db>();
    let rel: String = db.read_blocking(|conn| {
        Ok(conn.query_row(
            &format!("SELECT rel_path FROM {table} WHERE id=?1"),
            [id],
            |r| r.get(0),
        )?)
    })?;
    crate::fsx::abs_path(&rel)
}

/// `bytes=start-end`, `bytes=start-` or `bytes=-suffix`, clamped to the file.
fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = match (a.trim(), b.trim()) {
        ("", suffix) => {
            let n: u64 = suffix.parse().ok()?;
            (len.saturating_sub(n), len.checked_sub(1)?)
        }
        (s, "") => (s.parse().ok()?, len.checked_sub(1)?),
        (s, e) => (
            s.parse().ok()?,
            e.parse::<u64>().ok()?.min(len.checked_sub(1)?),
        ),
    };
    (start <= end && end < len).then_some((start, end))
}

fn mime(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("euboard" | "json") => "application/json",
        Some("txt" | "md" | "py") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn serve(app: &AppHandle, request: &Request<Vec<u8>>) -> AppResult<Response<Vec<u8>>> {
    let path = resolve(app, request.uri().path())?;
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok());
    respond_file(&path, range)
}

/// The whole file, or the requested byte range of it.
fn respond_file(path: &std::path::Path, range: Option<&str>) -> AppResult<Response<Vec<u8>>> {
    let mut file = std::fs::File::open(path)?;
    let len = file.metadata()?.len();
    let builder = Response::builder()
        .header(header::CONTENT_TYPE, mime(path))
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Accept-Ranges, Content-Range, Content-Length",
        )
        // Documents change in place when saved: always revalidate.
        .header(header::CACHE_CONTROL, "no-cache");

    let response = match range.and_then(|v| parse_range(v, len)) {
        Some((start, end)) => {
            let mut body = vec![0; (end - start + 1) as usize];
            file.seek(SeekFrom::Start(start))?;
            file.read_exact(&mut body)?;
            builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
                .body(body)
        }
        None => {
            let mut body = Vec::with_capacity(len as usize);
            file.read_to_end(&mut body)?;
            builder.status(StatusCode::OK).body(body)
        }
    };
    response.map_err(|e| AppError::Internal(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{parse_range, respond_file};

    #[test]
    fn serves_whole_files_and_ranges() {
        let path = std::env::temp_dir().join(format!("euclide-proto-{}.pdf", std::process::id()));
        std::fs::write(&path, b"0123456789").unwrap();
        let full = respond_file(&path, None).unwrap();
        assert_eq!(full.status(), 200);
        assert_eq!(full.body(), b"0123456789");
        assert_eq!(full.headers()["content-type"], "application/pdf");
        let part = respond_file(&path, Some("bytes=2-4")).unwrap();
        assert_eq!(part.status(), 206);
        assert_eq!(part.body(), b"234");
        assert_eq!(part.headers()["content-range"], "bytes 2-4/10");
        assert_eq!(
            respond_file(&path.with_extension("missing"), None)
                .unwrap_err()
                .code(),
            "not_found"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn ranges_are_clamped_to_the_file() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=500-5000", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("bytes=5-1", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
        assert_eq!(parse_range("bytes=0-0", 0), None);
    }
}
