//! WebKitGTK: GTK's file printer writes the PDF.

use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;

use webkit2gtk::{glib, PrintOperation, PrintOperationExt};

use super::{Done, MARGINS_MM};

pub const SUPPORTED: bool = true;

/// Prints through GTK's « Print to File » printer: no dialog, a PDF at
/// `path`. Runs on the main thread; `done` hears from WebKit's signals.
pub fn print(webview: tauri::webview::PlatformWebview, path: &Path, done: Done) {
    let done = Rc::new(RefCell::new(Some(done)));
    let finish = {
        let done = done.clone();
        move |result: Result<(), String>| {
            if let Some(tx) = done.borrow_mut().take() {
                let _ = tx.send(result);
            }
        }
    };
    let uri = match glib::filename_to_uri(path, None) {
        Ok(uri) => uri,
        Err(e) => return finish(Err(e.to_string())),
    };

    let settings = gtk::PrintSettings::new();
    // GTK names this printer in the user's language.
    settings.set_printer(&glib::dgettext(Some("gtk30"), "Print to File"));
    settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT.as_str(), Some("pdf"));
    settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI.as_str(), Some(&uri));
    let setup = gtk::PageSetup::new();
    setup.set_paper_size(&gtk::PaperSize::new(Some(gtk::PAPER_NAME_A4.as_str())));
    let [top, right, bottom, left] = MARGINS_MM;
    setup.set_top_margin(top, gtk::Unit::Mm);
    setup.set_right_margin(right, gtk::Unit::Mm);
    setup.set_bottom_margin(bottom, gtk::Unit::Mm);
    setup.set_left_margin(left, gtk::Unit::Mm);

    let op = PrintOperation::new(&webview.inner());
    op.set_print_settings(&settings);
    op.set_page_setup(&setup);
    // WebKit emits « failed » then « finished »: the first one answers.
    let failed = finish.clone();
    op.connect_failed(move |_, err| failed(Err(err.to_string())));
    // The operation lives until it finishes (the closure holds it).
    let hold = RefCell::new(Some(op.clone()));
    op.connect_finished(move |_| {
        finish(Ok(()));
        hold.borrow_mut().take();
    });
    op.print();
}
