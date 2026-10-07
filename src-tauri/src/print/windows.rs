//! WebView2: PrintToPdf writes the PDF.

use std::path::Path;
use std::sync::{Arc, Mutex};

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING};

use super::{Done, MARGINS_MM};

pub const SUPPORTED: bool = true;

const MM_PER_INCH: f64 = 25.4;
/// A4, in inches (WebView2's unit).
const A4: (f64, f64) = (210.0 / MM_PER_INCH, 297.0 / MM_PER_INCH);

type Slot = Arc<Mutex<Option<Done>>>;

fn finish(slot: &Slot, result: Result<(), String>) {
    let tx = slot.lock().ok().and_then(|mut s| s.take());
    if let Some(tx) = tx {
        let _ = tx.send(result);
    }
}

/// WebView2's PrintToPdf (runtime 1.0.1020 and later): no dialog, a PDF
/// at `path`. Runs on the main thread.
pub fn print(webview: tauri::webview::PlatformWebview, path: &Path, done: Done) {
    let slot: Slot = Arc::new(Mutex::new(Some(done)));
    // SAFETY: COM calls on the webview's own thread, with interfaces
    // that WebView2 handed us and that outlive the calls.
    if let Err(e) = unsafe { start(&webview, path, slot.clone()) } {
        finish(&slot, Err(e.message()));
    }
}

unsafe fn start(
    webview: &tauri::webview::PlatformWebview,
    path: &Path,
    slot: Slot,
) -> windows::core::Result<()> {
    let core: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
    let env: ICoreWebView2Environment6 = webview.environment().cast()?;
    let settings = env.CreatePrintSettings()?;
    settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
    settings.SetPageWidth(A4.0)?;
    settings.SetPageHeight(A4.1)?;
    let [top, right, bottom, left] = MARGINS_MM.map(|mm| mm / MM_PER_INCH);
    settings.SetMarginTop(top)?;
    settings.SetMarginRight(right)?;
    settings.SetMarginBottom(bottom)?;
    settings.SetMarginLeft(left)?;
    settings.SetShouldPrintBackgrounds(true)?;
    // The page numbers its pages itself (`@page` margin boxes).
    settings.SetShouldPrintHeaderAndFooter(false)?;
    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
        finish(
            &slot,
            match result {
                Ok(()) if ok => Ok(()),
                Ok(()) => Err("WebView2 n'a pas écrit le fichier".into()),
                Err(e) => Err(e.message()),
            },
        );
        Ok(())
    }));
    core.PrintToPdf(&HSTRING::from(path.as_os_str()), &settings, &handler)
}
