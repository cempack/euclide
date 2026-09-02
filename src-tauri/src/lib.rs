mod commands;
mod db;
mod keepawake;
mod linux_env;
mod paths;
mod portable_update;
mod sidecar;

use keepawake::KeepAwake;
use tauri::Manager;

/// Before GTK/WebKit: drop linuxdeploy's `GDK_BACKEND=x11` on Wayland and skip
/// the AppImage WebKit GPU path (surfaceless EGL_BAD_ALLOC abort).
pub fn apply_linux_runtime_env() {
    linux_env::apply();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    apply_linux_runtime_env();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            if !crate::paths::ensure_writable_data_dir() {
                std::process::exit(0);
            }
            app.manage(db::Db(std::sync::Mutex::new(db::open())));
            app.manage(KeepAwake::default());
            app.manage(sidecar::Sidecar::new(app.handle().clone()));

            // Keep screen from locking / sleeping by default ("Ne pas verrouiller l'écran").
            // This matches the teaching use-case. Persisted via settings key "keep_awake" ("1"/"0").
            // We read the saved pref (default on), ensure it's saved on every launch, and activate the guard accordingly.
            {
                let db = app.state::<db::Db>();
                let ka = app.state::<KeepAwake>();
                let conn = db.0.lock().unwrap();
                let val = crate::commands::get_setting_raw(&conn, "keep_awake");
                let should_on = val.as_deref() != Some("0");
                // Always ensure the preference is saved (defaults to on/"1" for first run).
                crate::commands::set_setting_raw(&conn, "keep_awake", if should_on { "1" } else { "0" });
                crate::keepawake::set(&ka, should_on);
            }

            if let Some(win) = app.get_webview_window("main") {
                // Adjust size dynamically to screen/monitor resolution for a perfect aspect ratio.
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    let monitor_width = (size.width as f64) / scale_factor;
                    let monitor_height = (size.height as f64) / scale_factor;

                    // Goal: 80% of screen width and height, clamped to safe desktop boundaries.
                    let target_width = (monitor_width * 0.8).clamp(1000.0, 1280.0);
                    let target_height = (monitor_height * 0.8).clamp(680.0, 840.0);

                    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                        width: target_width,
                        height: target_height,
                    }));
                    let _ = win.center();
                }
            }

            // Pre-start the Python sidecar *once* at launch and keep the process warm forever.
            // All Python work (Pronote, scripts, Jedi, PDF index...) now goes through a single
            // long-lived process using fast stdin/stdout JSON lines. No more per-call spawn,
            // no repeated PyInstaller extract, imports (pronotepy + jedi + pypdf) happen once.
            // Result: snappy even on low-end school laptops, always responsive.
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let sc: tauri::State<sidecar::Sidecar> = handle.state();
                    // ignore error here (first real call will retry if needed)
                    let _ = sc.start().await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::list_courses,
            commands::create_course,
            commands::update_course,
            commands::delete_course,
            commands::list_notes,
            commands::all_notes,
            commands::save_note,
            commands::delete_note,
            commands::rename_note,
            commands::list_files,
            commands::recent_files,
            commands::import_files,
            commands::import_paths,
            commands::file_path,
            commands::open_file,
            commands::reveal_file,
            commands::list_openers,
            commands::delete_file,
            commands::rename_file,
            commands::global_search,
            commands::reindex_documents,
            commands::index_files,
            commands::list_reminders,
            commands::create_reminder,
            commands::toggle_reminder,
            commands::delete_reminder,
            commands::list_links,
            commands::create_link,
            commands::delete_link,
            commands::open_url,
            commands::list_schedule,
            commands::get_today_classes,
            commands::save_schedule_entry,
            commands::delete_schedule_entry,
            commands::save_board,
            commands::read_board,
            commands::export_board_png,
            commands::save_annotations,
            commands::read_annotations,
            commands::save_export,
            commands::update_file,
            commands::get_file_versions,
            commands::read_version_data,
            commands::ensure_original_version,
            commands::list_python_demos,
            commands::create_python_script,
            commands::save_python_script,
            commands::delete_python_script,
            commands::rename_python_script,
            commands::import_python_script,
            commands::run_python_demo,
            commands::run_python_code,
            commands::python_complete,
            commands::choose_data_dir,
            commands::reset_data_dir,
            commands::set_keep_awake,
            commands::keep_awake_status,
            commands::get_setting,
            commands::set_setting,
            commands::log_event,
            commands::get_recap,
            commands::pronote_status,
            commands::pronote_qr_login,
            commands::pronote_password_login,
            commands::pronote_sync,
            commands::pronote_logout,
            commands::pronote_contents,
            commands::list_course_classes,
            commands::attach_class_to_course,
            commands::detach_course_class,
            commands::set_course_class_progress,
            commands::update_course_class_notes,
            commands::pronote_classes,
            portable_update::apply_windows_portable_update,
        ])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Euclide")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Gracefully stop the warm sidecar on app exit so the Python process doesn't linger.
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(sc) = app_handle.try_state::<sidecar::Sidecar>() {
                        sc.stop().await;
                    }
                });
            }
        });
}
