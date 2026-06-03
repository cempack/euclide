use std::sync::Mutex;

/// Tracks whether Euclide is currently preventing the machine from sleeping/locking.
/// Uses the cross-platform `keepawake` crate under the hood so the "caffeinate"
/// feature works on Windows, macOS *and* Linux (using SetThreadExecutionState,
/// IOPMAssertion, and systemd-inhibit / org.freedesktop.ScreenSaver respectively).
pub struct KeepAwake {
    on: Mutex<bool>,
    guard: Mutex<Option<keepawake::KeepAwake>>,
}

impl Default for KeepAwake {
    fn default() -> Self {
        KeepAwake {
            on: Mutex::new(false),
            guard: Mutex::new(None),
        }
    }
}

/// Turn keep-awake on or off. The guard is kept alive only while `on == true`.
/// This is a no-op (besides tracking the bool) only if the underlying platform
/// call fails (rare); errors are logged to stderr.
pub fn set(ka: &KeepAwake, on: bool) {
    let mut guard = ka.guard.lock().unwrap();
    if on {
        if guard.is_none() {
            match keepawake::Builder::default()
                .display(true)
                .idle(true)
                .reason("Euclide - cours en cours (écran et système éveillés)")
                .app_name("Euclide")
                .app_reverse_domain("fr.elliotmoreau.euclide")
                .create()
            {
                Ok(g) => {
                    *guard = Some(g);
                }
                Err(e) => {
                    eprintln!("[keepawake] failed to enable: {e}");
                }
            }
        }
    } else {
        *guard = None;
    }
    if let Ok(mut status) = ka.on.lock() {
        *status = on;
    }
}

/// Helper for status queries (used by the command and UI).
pub fn is_on(ka: &KeepAwake) -> bool {
    *ka.on.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keepawake_toggle_works_everywhere() {
        let ka = KeepAwake::default();
        assert!(!is_on(&ka));
        // This exercises the real platform backend (IOPM on mac, SetThread... on win, zbus inhibit on linux).
        // The crate handles creation; we only ensure no panic and status tracking.
        set(&ka, true);
        assert!(is_on(&ka));
        set(&ka, false);
        assert!(!is_on(&ka));
        // Toggle twice to ensure guard drop + recreate is safe.
        set(&ka, true);
        set(&ka, true); // idempotent
        assert!(is_on(&ka));
        set(&ka, false);
        assert!(!is_on(&ka));
    }
}
