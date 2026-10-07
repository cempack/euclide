//! Closing the window. The page may hold unsaved work (a note typed less
//! than a second ago, a whiteboard, a Python script), so a click on the
//! close button is held and handed to the page: it saves what it can, asks
//! about the rest, then calls `app_exit`. A page that does not answer
//! within two seconds (crashed, stuck) cannot keep the window open.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

pub const CLOSE_REQUESTED: &str = "eu://close-requested";
const ACK_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct ExitGate {
    approved: AtomicBool,
    requests: AtomicU64,
    acked: AtomicU64,
}

impl ExitGate {
    fn approve_and_exit(&self, app: &AppHandle) {
        self.approved.store(true, Ordering::SeqCst);
        app.exit(0);
    }
}

/// The main window's close button: hold it and ask the page.
pub fn on_close_requested(app: &AppHandle, api: &tauri::CloseRequestApi) {
    let gate = app.state::<ExitGate>();
    if gate.approved.load(Ordering::SeqCst) {
        return;
    }
    api.prevent_close();
    let request = gate.requests.fetch_add(1, Ordering::SeqCst) + 1;
    if app.emit_to("main", CLOSE_REQUESTED, request).is_err() {
        gate.approve_and_exit(app);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ACK_TIMEOUT);
        let gate = app.state::<ExitGate>();
        if gate.acked.load(Ordering::SeqCst) < request {
            crate::applog::warn("[exit] la page n'a pas répondu : fermeture forcée");
            gate.approve_and_exit(&app);
        }
    });
}

/// The page has the close request in hand (it may now ask the teacher).
#[tauri::command]
pub fn close_ack(gate: State<'_, ExitGate>, request: u64) {
    gate.acked.fetch_max(request, Ordering::SeqCst);
}

/// Everything is saved (or abandoned on purpose): quit.
#[tauri::command]
pub fn app_exit(app: AppHandle, gate: State<'_, ExitGate>) {
    gate.approve_and_exit(&app);
}
