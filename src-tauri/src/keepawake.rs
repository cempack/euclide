use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;

/// Keeps the screen on and the PC awake while a lesson needs it.
///
/// The `keepawake` crate uses `SetThreadExecutionState` on Windows, which
/// belongs to the calling thread: the request ends when that thread exits, and
/// only that thread can lift it. So one dedicated thread owns the guard for the
/// whole run, and `set` just sends it on/off. It also keeps the Linux D-Bus
/// call and the macOS assertion off the UI thread.
pub struct KeepAwake {
    on: AtomicBool,
    tx: Mutex<Sender<bool>>,
}

impl Default for KeepAwake {
    fn default() -> Self {
        let (tx, rx) = channel::<bool>();
        let spawned = std::thread::Builder::new()
            .name("keep-awake".into())
            .spawn(move || {
                let mut guard: Option<keepawake::KeepAwake> = None;
                for on in rx {
                    if !on {
                        guard = None;
                    } else if guard.is_none() {
                        match keepawake::Builder::default()
                            .display(true)
                            .idle(true)
                            .reason("Euclide - cours en cours (écran et système éveillés)")
                            .app_name("Euclide")
                            .app_reverse_domain("fr.elliotmoreau.euclide")
                            .create()
                        {
                            Ok(g) => guard = Some(g),
                            Err(e) => eprintln!("[keepawake] failed to enable: {e}"),
                        }
                    }
                }
            });
        if let Err(e) = spawned {
            eprintln!("[keepawake] thread not started: {e}");
        }
        KeepAwake {
            on: AtomicBool::new(false),
            tx: Mutex::new(tx),
        }
    }
}

/// Turn keep-awake on or off. Returns immediately; the guard thread applies it.
pub fn set(ka: &KeepAwake, on: bool) {
    ka.on.store(on, Ordering::Relaxed);
    let tx = ka.tx.lock().unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(on);
}

/// What the teacher asked for (used by the command and the UI).
pub fn is_on(ka: &KeepAwake) -> bool {
    ka.on.load(Ordering::Relaxed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keepawake_toggle_works_everywhere() {
        let ka = KeepAwake::default();
        assert!(!is_on(&ka));
        set(&ka, true);
        assert!(is_on(&ka));
        set(&ka, false);
        assert!(!is_on(&ka));
        // Toggling twice must be safe: the guard is dropped and recreated on its thread.
        set(&ka, true);
        set(&ka, true);
        assert!(is_on(&ka));
        set(&ka, false);
        assert!(!is_on(&ka));
    }
}
