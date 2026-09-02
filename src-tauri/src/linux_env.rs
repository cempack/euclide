/// Runtime env that must exist before GTK/WebKit initialize.
///
/// The linuxdeploy GTK AppRun hook ships `export GDK_BACKEND=x11`. On Wayland
/// that sends the Ubuntu WebKit bundled in the AppImage through X11 EGL, which
/// then aborts: `Could not create surfaceless EGL display: EGL_BAD_ALLOC`.
/// Unset that backend when we are on Wayland, and skip the GPU compositor for
/// the AppImage copy of WebKit (host Mesa is fine; the bundled WebKit is not).
pub fn apply() {
    #[cfg(target_os = "linux")]
    apply_linux();
}

#[cfg(target_os = "linux")]
fn apply_linux() {
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var_os("WAYLAND_SOCKET").is_some();
    if wayland && std::env::var("GDK_BACKEND").ok().as_deref() == Some("x11") {
        std::env::remove_var("GDK_BACKEND");
    }

    let bundled_webkit =
        std::env::var_os("APPIMAGE").is_some() || std::env::var_os("APPDIR").is_some();
    if bundled_webkit {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::ffi::OsString;

    fn restore(key: &str, prev: Option<OsString>) {
        match prev {
            Some(v) => std::env::set_var(key, v),
            None => std::env::remove_var(key),
        }
    }

    #[test]
    fn wayland_drops_forced_x11_backend() {
        let _g = crate::paths::TEST_ENV_LOCK.lock().unwrap();
        let prev_wl = std::env::var_os("WAYLAND_DISPLAY");
        let prev_gdk = std::env::var_os("GDK_BACKEND");
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_dir = std::env::var_os("APPDIR");
        let prev_dma = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
        let prev_comp = std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE");

        std::env::set_var("WAYLAND_DISPLAY", "wayland-1");
        std::env::set_var("GDK_BACKEND", "x11");
        std::env::remove_var("APPIMAGE");
        std::env::remove_var("APPDIR");
        std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
        std::env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");

        apply();

        assert!(
            std::env::var_os("GDK_BACKEND").is_none(),
            "GDK_BACKEND=x11 must not survive on Wayland"
        );
        assert!(
            std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none(),
            "native (non-AppImage) WebKit should keep GPU compositing"
        );

        restore("WAYLAND_DISPLAY", prev_wl);
        restore("GDK_BACKEND", prev_gdk);
        restore("APPIMAGE", prev_app);
        restore("APPDIR", prev_dir);
        restore("WEBKIT_DISABLE_DMABUF_RENDERER", prev_dma);
        restore("WEBKIT_DISABLE_COMPOSITING_MODE", prev_comp);
    }

    #[test]
    fn appimage_disables_bundled_webkit_gpu() {
        let _g = crate::paths::TEST_ENV_LOCK.lock().unwrap();
        let prev_app = std::env::var_os("APPIMAGE");
        let prev_dma = std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER");
        let prev_comp = std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE");

        std::env::set_var("APPIMAGE", "/tmp/Euclide.AppImage");
        std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER");
        std::env::remove_var("WEBKIT_DISABLE_COMPOSITING_MODE");

        apply();

        assert_eq!(
            std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER")
                .ok()
                .as_deref(),
            Some("1")
        );
        assert_eq!(
            std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE")
                .ok()
                .as_deref(),
            Some("1")
        );

        restore("APPIMAGE", prev_app);
        restore("WEBKIT_DISABLE_DMABUF_RENDERER", prev_dma);
        restore("WEBKIT_DISABLE_COMPOSITING_MODE", prev_comp);
    }
}
