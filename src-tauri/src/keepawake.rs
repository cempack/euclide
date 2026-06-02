use std::sync::Mutex;

/// Tracks whether Euclide is currently preventing the machine from sleeping/locking.
pub struct KeepAwake(pub Mutex<bool>);

impl Default for KeepAwake {
    fn default() -> Self {
        KeepAwake(Mutex::new(false))
    }
}

#[cfg(windows)]
pub fn set(on: bool) {
    use windows_sys::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };
    unsafe {
        if on {
            SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        } else {
            SetThreadExecutionState(ES_CONTINUOUS);
        }
    }
}

/// On non-Windows targets (e.g. the macOS dev machine) we only track state.
/// The shipped target is Windows where the real API call above applies.
#[cfg(not(windows))]
pub fn set(_on: bool) {}
