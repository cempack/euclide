//! Windows: the Python processes Euclide starts belong to a job object that
//! dies with Euclide. Without it, a crash or « Fin de tâche » left them
//! running, holding files on the USB key so it could not be ejected.
//! Elsewhere a no-op: closing the pipes ends them.

#[cfg(windows)]
mod imp {
    use std::ffi::c_void;
    use std::sync::OnceLock;

    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// The job's handle, as an address: kept open for Euclide's lifetime; the
    /// system closes it on exit, and the job's processes go with it.
    static JOB: OnceLock<Option<usize>> = OnceLock::new();

    fn job() -> Option<*mut c_void> {
        JOB.get_or_init(|| {
            // SAFETY: plain Win32 calls with a zeroed, correctly sized struct.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                (ok != 0).then_some(handle as usize)
            }
        })
        .map(|h| h as *mut c_void)
    }

    pub fn adopt(process: *mut c_void) {
        if let Some(job) = job() {
            // SAFETY: `process` is a live child handle; failure only means
            // the process is not tied to Euclide's lifetime.
            let ok = unsafe { AssignProcessToJobObject(job, process) };
            if ok == 0 {
                crate::applog::warn("[job] a Python process could not join Euclide's job");
            }
        }
    }
}

/// Ties a child process to Euclide's lifetime (Windows only).
pub fn adopt(child: &tokio::process::Child) {
    #[cfg(windows)]
    if let Some(handle) = child.raw_handle() {
        imp::adopt(handle);
    }
    #[cfg(not(windows))]
    let _ = child;
}
