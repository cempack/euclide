mod commands;
mod db;
mod keepawake;
mod paths;
mod sidecar;

use keepawake::KeepAwake;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            app.manage(db::Db(std::sync::Mutex::new(db::open())));
            app.manage(KeepAwake::default());

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

            // A more native feel: translucent window material behind the UI.
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    // Use UnderWindowBackground for a more uniform frosted glass effect across the whole window.
                    let _ = window_vibrancy::apply_vibrancy(
                        &win,
                        window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
                        Some(window_vibrancy::NSVisualEffectState::Active),
                        Some(20.0),
                    );
                }
                #[cfg(target_os = "windows")]
                {
                    // Acrylic provides more blur and "transparent" frosted look than mica.
                    let _ = window_vibrancy::apply_acrylic(&win, None)
                        .or_else(|_| window_vibrancy::apply_mica(&win, None));
                }
                #[cfg(target_os = "linux")]
                {
                    let _ = window_vibrancy::apply_blur(&win, None);
                }
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
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Euclide");
}
