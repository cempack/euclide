//! Tauri commands, one module per domain. Each module holds plain functions
//! on a `rusqlite::Connection` (tested directly) and thin async commands that
//! run them through `Db::read` / `Db::write`, off the UI thread.
//!
//! `legacy` still holds the commands that have not been converted yet.

pub mod courses;
pub mod legacy;
pub mod notes;
pub mod reminders;

pub(crate) use legacy::{get_setting_raw, set_setting_raw};
