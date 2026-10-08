mod applog;
mod boot;
mod commands;
mod db;
mod error;
mod exit;
mod fsx;
mod jobobject;
mod jobs;
mod keepawake;
mod linux_env;
mod models;
mod paths;
mod perf;
mod portable_update;
mod print;
mod protocol;
mod relaunch;
mod runner;
mod secrets;
mod sidecar;
mod thumbs;

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
    applog::install_panic_hook();
    apply_linux_runtime_env();
    tauri::Builder::default()
        // First, so a second launch (a double-click while the window is still
        // opening) focuses the running window instead of opening the data twice.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            boot::focus_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Before any window exists: its close button goes through the gate.
        .manage(exit::ExitGate::default())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(protocol::handle(&app, &request));
            });
        })
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            if !crate::paths::ensure_writable_data_dir() {
                std::process::exit(0);
            }
            crate::paths::freeze_data_dir();
            // A restore chosen in Settings is applied before the database opens.
            match jobs::backup::apply_pending_restore() {
                Ok(Some(name)) => perf::append(&[format!("backup.restored={name}")]),
                Ok(None) => {}
                Err(e) => applog::warn(format!("[backup] restore: {}", e.message())),
            }
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
            let db_ms = perf::uptime_ms();
            commands::pronote::protect_stored_password(&db.lock());
            let version = app.package_info().version.to_string();
            let updated_from = commands::app::record_version(&db.lock(), &version);

            // The window first: the webview starts loading while the rest of
            // setup runs, and opens with everything its first render needs.
            let boot_state = boot::state(&db.lock(), updated_from.as_deref());
            boot::create_main_window(app, &boot_state)?;
            let window_ms = perf::uptime_ms();

            // Applied by keepawake::spawn_auto once the state is managed:
            // « during classes » by default, the timetable says when.
            let keep_awake = KeepAwake::default();
            app.manage(db.clone());
            app.manage(keep_awake);
            keepawake::spawn_auto(app.handle().clone());
            app.manage(jobs::indexer::Indexer::default());
            app.manage(commands::pronote::PronoteLane::default());
            app.manage(jobs::backup::Health::default());
            // Started on first use: launching Python competes with the webview
            // for the CPU and the USB key, for features a lesson may not need.
            // A sidecar staged by an update is swapped in before that.
            let exe_dir = crate::paths::exe_dir();
            let sidecar_swapped =
                portable_update::apply_staged_sidecar(&exe_dir, &version).is_some();
            app.manage(sidecar::Sidecar::new(app.handle().clone()));
            app.manage(runner::Runner::default());
            sidecar::start_reaper(app.handle().clone());
            runner::start_reaper(app.handle().clone());
            jobs::backup::spawn(app.handle().clone());
            jobs::indexer::spawn(app.handle().clone());

            // Housekeeping that the first screen doesn't wait for.
            let after_update = updated_from.is_some();
            std::thread::Builder::new()
                .name("startup-chores".into())
                .spawn(move || {
                    // Files an update renamed aside: swept after each update,
                    // otherwise only when a quick look finds some.
                    if after_update || portable_update::leftovers_present(&exe_dir) {
                        portable_update::purge_update_leftovers(&exe_dir);
                        #[cfg(windows)]
                        portable_update::schedule_leftover_cleanup(&exe_dir);
                    }
                    for old in portable_update::old_sidecar_dirs(&exe_dir) {
                        let _ = std::fs::remove_dir_all(old);
                    }
                    portable_update::remove_stale_staging(&exe_dir);
                    db::seed_python_demos();
                    let _ = commands::recap::prune(&db.lock());
                    // Previews of documents deleted since.
                    let ids = db.lock().prepare("SELECT id FROM files").and_then(|mut s| {
                        s.query_map([], |r| r.get::<_, i64>(0))?
                            .collect::<Result<std::collections::HashSet<_>, _>>()
                    });
                    if let Ok(ids) = ids {
                        thumbs::prune(&ids);
                    }
                })?;

            let mut marks = vec![
                format!("rust.db_open_ms={db_ms}"),
                format!("rust.window_created_ms={window_ms}"),
                format!("rust.setup_done_ms={}", perf::uptime_ms()),
            ];
            if let Some(from) = &updated_from {
                marks.push(format!("app.updated from={from} to={version}"));
            }
            if sidecar_swapped {
                marks.push("app.sidecar_swapped".into());
            }
            perf::append(&marks);

            // PDFs left unindexed by a previous session: resume once startup has settled.
            {
                let indexer = app.state::<jobs::indexer::Indexer>().inner().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                    indexer.kick();
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
            commands::files::list_files,
            commands::files::recent_files,
            commands::files::library_stats,
            commands::files::import_files,
            commands::files::import_paths,
            commands::files::file_path,
            commands::files::open_file,
            commands::files::reveal_file,
            commands::files::list_openers,
            commands::files::delete_file,
            commands::files::rename_file,
            commands::files::attach_files_to_course,
            commands::search::global_search,
            commands::files::reindex_documents,
            commands::files::index_files,
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
            commands::sequences::rename_sequence_item,
            commands::sequences::add_step_resource,
            commands::sequences::remove_step_resource,
            commands::sequences::move_step_resource,
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
            commands::editing::save_board,
            commands::editing::read_board,
            commands::editing::save_annotations,
            commands::editing::read_annotations,
            commands::editing::get_file_versions,
            commands::editing::write_file_bytes,
            commands::editing::create_file_bytes,
            commands::python::list_python_demos,
            commands::python::create_python_script,
            commands::python::save_python_script,
            commands::python::delete_python_script,
            commands::python::rename_python_script,
            commands::python::import_python_script,
            thumbs::missing_thumbnails,
            thumbs::save_thumbnail,
            print::print_to_pdf,
            runner::python_run,
            runner::python_input,
            runner::python_stop,
            runner::python_prewarm,
            commands::python::python_complete,
            commands::storage::choose_data_dir,
            commands::storage::reset_data_dir,
            commands::storage::backup_data_dir,
            commands::storage::get_backup_status,
            commands::storage::backup_now,
            commands::storage::choose_backup_folder,
            commands::storage::clear_backup_folder,
            commands::storage::restore_snapshot,
            commands::storage::cancel_restore,
            commands::storage::open_folder,
            commands::settings::set_keep_awake,
            commands::settings::set_keep_awake_mode,
            commands::settings::keep_awake_status,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::recap::log_event,
            commands::recap::get_recap,
            commands::pronote::pronote_status,
            commands::pronote::pronote_qr_login,
            commands::pronote::pronote_password_login,
            commands::pronote::pronote_sync,
            commands::pronote::pronote_logout,
            commands::pronote::pronote_contents,
            commands::courses::list_course_classes,
            commands::courses::list_all_course_classes,
            commands::courses::attach_class_to_course,
            commands::courses::detach_course_class,
            commands::courses::set_course_class_progress,
            commands::courses::set_course_class_item,
            commands::courses::update_course_class_notes,
            commands::pronote::pronote_classes,
            perf::log_perf,
            applog::log_errors,
            portable_update::apply_windows_portable_update,
            relaunch::relaunch_after_update,
            exit::close_ack,
            exit::app_exit,
        ])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Euclide")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } = &event
            {
                if label == "main" {
                    exit::on_close_requested(app_handle, api);
                }
                return;
            }
            if let tauri::RunEvent::Exit = event {
                // Windows does not end child processes with their parent: a
                // Python left running would hold the sidecar's files.
                if let Some(runner) = app_handle.try_state::<runner::Runner>() {
                    runner.shutdown(std::time::Duration::from_millis(300));
                }
                if let Some(sc) = app_handle.try_state::<sidecar::Sidecar>() {
                    sc.shutdown(std::time::Duration::from_millis(500));
                }
                if let Some(db) = app_handle.try_state::<db::Db>() {
                    db.close();
                }
            }
        });
}
