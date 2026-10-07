mod commands;
mod db;
mod error;
mod keepawake;
mod linux_env;
mod models;
mod paths;
mod perf;
mod portable_update;
mod relaunch;
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
    perf::start();
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
            crate::paths::freeze_data_dir();
            let exe_dir = crate::paths::exe_dir();
            crate::portable_update::purge_update_leftovers(&exe_dir);
            #[cfg(windows)]
            crate::portable_update::schedule_leftover_cleanup(&exe_dir);
            let db = match db::Db::open(&crate::paths::db_path()) {
                Ok(db) => db,
                Err(err) => {
                    rfd::MessageDialog::new()
                        .set_title("Euclide")
                        .set_level(rfd::MessageLevel::Error)
                        .set_description(format!(
                            "Impossible d'ouvrir la base de données d'Euclide.\n\n{}",
                            err.message()
                        ))
                        .show();
                    std::process::exit(1);
                }
            };
            db::seed_python_demos();
            let _ = commands::recap::prune(&db.lock());
            app.manage(db);
            app.manage(KeepAwake::default());
            app.manage(sidecar::Sidecar::new(app.handle().clone()));

            // Keep screen from locking / sleeping by default ("Ne pas verrouiller l'écran").
            // This matches the teaching use-case. Persisted via settings key "keep_awake" ("1"/"0").
            // We read the saved pref (default on), ensure it's saved on every launch, and activate the guard accordingly.
            {
                let db = app.state::<db::Db>();
                let ka = app.state::<KeepAwake>();
                let conn = db.lock();
                let val = crate::commands::get_setting_raw(&conn, "keep_awake");
                let should_on = val.as_deref() != Some("0");
                // Always ensure the preference is saved (defaults to on/"1" for first run).
                crate::commands::set_setting_raw(
                    &conn,
                    "keep_awake",
                    if should_on { "1" } else { "0" },
                );
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

            perf::append(&[format!("rust.setup_done_ms={}", perf::uptime_ms())]);

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
            commands::app::get_app_info,
            commands::courses::list_courses,
            commands::courses::create_course,
            commands::courses::update_course,
            commands::courses::delete_course,
            commands::notes::list_notes,
            commands::notes::all_notes,
            commands::notes::save_note,
            commands::notes::delete_note,
            commands::notes::rename_note,
            commands::notes::get_note,
            commands::notes::list_note_summaries,
            commands::legacy::list_files,
            commands::legacy::recent_files,
            commands::legacy::import_files,
            commands::legacy::import_paths,
            commands::legacy::file_path,
            commands::legacy::open_file,
            commands::legacy::reveal_file,
            commands::legacy::list_openers,
            commands::legacy::delete_file,
            commands::legacy::rename_file,
            commands::legacy::global_search,
            commands::legacy::reindex_documents,
            commands::legacy::index_files,
            commands::reminders::list_reminders,
            commands::reminders::create_reminder,
            commands::reminders::update_reminder,
            commands::reminders::toggle_reminder,
            commands::reminders::delete_reminder,
            commands::sequences::list_sequences,
            commands::sequences::list_sequence_items,
            commands::sequences::create_sequence,
            commands::sequences::rename_sequence,
            commands::sequences::delete_sequence,
            commands::sequences::move_sequence,
            commands::sequences::create_sequence_item,
            commands::sequences::update_sequence_item,
            commands::sequences::delete_sequence_item,
            commands::sequences::move_sequence_item,
            commands::links::list_links,
            commands::links::create_link,
            commands::links::delete_link,
            commands::links::open_url,
            commands::schedule::list_schedule,
            commands::schedule::get_today_classes,
            commands::schedule::save_schedule_entry,
            commands::schedule::delete_schedule_entry,
            commands::legacy::save_board,
            commands::legacy::read_board,
            commands::legacy::export_board_png,
            commands::legacy::save_annotations,
            commands::legacy::read_annotations,
            commands::legacy::save_export,
            commands::legacy::update_file,
            commands::legacy::get_file_versions,
            commands::legacy::read_version_data,
            commands::legacy::ensure_original_version,
            commands::legacy::list_python_demos,
            commands::legacy::create_python_script,
            commands::legacy::save_python_script,
            commands::legacy::delete_python_script,
            commands::legacy::rename_python_script,
            commands::legacy::import_python_script,
            commands::legacy::run_python_demo,
            commands::legacy::run_python_code,
            commands::legacy::python_complete,
            commands::legacy::choose_data_dir,
            commands::legacy::reset_data_dir,
            commands::legacy::backup_data_dir,
            commands::settings::set_keep_awake,
            commands::settings::keep_awake_status,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::recap::log_event,
            commands::recap::get_recap,
            commands::legacy::pronote_status,
            commands::legacy::pronote_qr_login,
            commands::legacy::pronote_password_login,
            commands::legacy::pronote_sync,
            commands::legacy::pronote_logout,
            commands::legacy::pronote_contents,
            commands::courses::list_course_classes,
            commands::courses::attach_class_to_course,
            commands::courses::detach_course_class,
            commands::courses::set_course_class_progress,
            commands::courses::set_course_class_item,
            commands::courses::update_course_class_notes,
            commands::legacy::pronote_classes,
            perf::log_perf,
            portable_update::apply_windows_portable_update,
            relaunch::relaunch_after_update,
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
