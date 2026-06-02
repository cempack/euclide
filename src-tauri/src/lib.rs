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
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            use tauri::Manager;
            app.manage(db::Db(std::sync::Mutex::new(db::open())));
            app.manage(KeepAwake::default());

            // A more native feel: translucent window material behind the UI.
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = window_vibrancy::apply_vibrancy(
                        &win,
                        window_vibrancy::NSVisualEffectMaterial::Sidebar,
                        Some(window_vibrancy::NSVisualEffectState::Active),
                        Some(16.0),
                    );
                }
                #[cfg(target_os = "windows")]
                {
                    let _ = window_vibrancy::apply_mica(&win, None)
                        .or_else(|_| window_vibrancy::apply_acrylic(&win, None));
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
            commands::list_files,
            commands::recent_files,
            commands::import_files,
            commands::import_paths,
            commands::file_path,
            commands::open_file,
            commands::delete_file,
            commands::search_documents,
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
            commands::list_python_demos,
            commands::create_python_script,
            commands::save_python_script,
            commands::delete_python_script,
            commands::import_python_script,
            commands::run_python_demo,
            commands::run_python_code,
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
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Euclide");
}
