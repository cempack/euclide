// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    euclide_lib::apply_linux_runtime_env();
    euclide_lib::run()
}
