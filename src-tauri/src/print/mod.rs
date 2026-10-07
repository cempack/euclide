//! Notes exported to PDF without a dialog. The page lays out what to print
//! (its `@media print` styles), then asks for it here: the webview prints
//! itself into a temporary PDF that joins the library. WebView2 (Windows)
//! and WebKitGTK (Linux) can; anywhere else the page opens the print
//! dialog instead (code `print_unsupported`).

use std::time::Duration;

use tauri::{State, WebviewWindow};
use tokio::sync::oneshot;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::FileItem;

/// A long note takes a few seconds on a slow PC; past this, it is stuck.
const TIMEOUT: Duration = Duration::from_secs(90);

/// Page margins in millimetres (top, right, bottom, left), the same as the
/// page's `@page` rule: WebView2 and GTK take theirs from here.
const MARGINS_MM: [f64; 4] = [15.0, 16.0, 18.0, 16.0];

/// Told once the PDF is written, or why it was not.
type Done = oneshot::Sender<Result<(), String>>;

/// `title.pdf`, with what a file name cannot hold replaced.
fn pdf_name(title: &str) -> String {
    let clean: String = title
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let clean = clean.trim().trim_matches('.').trim();
    let stem = if clean.is_empty() { "Note" } else { clean };
    format!("{stem}.pdf")
}

/// Prints the page to `title.pdf` in the library (with the course's files
/// when `course_id` is set).
#[tauri::command]
pub async fn print_to_pdf(
    window: WebviewWindow,
    db: State<'_, Db>,
    title: String,
    course_id: Option<i64>,
) -> AppResult<FileItem> {
    if !platform::SUPPORTED {
        return Err(AppError::coded(
            "print_unsupported",
            "L'export direct en PDF n'est pas possible ici.",
        ));
    }
    let dir = crate::paths::data_dir().join(".cache");
    std::fs::create_dir_all(&dir)?;
    let tmp = dir.join(format!("print-{}.pdf", uuid::Uuid::new_v4()));
    let (tx, rx) = oneshot::channel();
    let target = tmp.clone();
    window
        .with_webview(move |webview| platform::print(webview, &target, tx))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let printed = match tokio::time::timeout(TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("l'impression s'est interrompue".into()),
        Err(_) => Err("l'impression ne se termine pas".into()),
    };
    if let Err(why) = printed {
        let _ = std::fs::remove_file(&tmp);
        crate::applog::warn(format!("print_to_pdf: {why}"));
        return Err(AppError::coded(
            "print_failed",
            format!("L'export en PDF a échoué ({why})."),
        ));
    }
    let name = pdf_name(&title);
    db.write(move |conn| {
        let bytes = std::fs::read(&tmp);
        let _ = std::fs::remove_file(&tmp);
        crate::commands::editing::create_from_bytes(
            conn,
            &crate::paths::documents_dir(),
            &name,
            course_id,
            &bytes?,
        )
    })
    .await
}

#[cfg(target_os = "linux")]
#[path = "linux.rs"]
mod platform;

#[cfg(windows)]
#[path = "windows.rs"]
mod platform;

#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    use std::path::Path;

    use super::Done;

    pub const SUPPORTED: bool = false;

    pub fn print(_webview: tauri::webview::PlatformWebview, _path: &Path, done: Done) {
        let _ = done.send(Err("non disponible".into()));
    }
}

#[cfg(test)]
mod tests {
    use super::pdf_name;

    #[test]
    fn titles_become_file_names() {
        assert_eq!(
            pdf_name("Évaluation — Fonctions"),
            "Évaluation — Fonctions.pdf"
        );
        assert_eq!(pdf_name("DS 2/3 : dérivées?"), "DS 2-3 - dérivées-.pdf");
        assert_eq!(pdf_name("  ..  "), "Note.pdf");
        assert_eq!(pdf_name(""), "Note.pdf");
    }
}
