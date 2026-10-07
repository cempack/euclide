//! Tauri commands, one module per domain. Each module holds plain functions
//! on a `rusqlite::Connection` (tested directly) and thin async commands that
//! run them through `Db::read` / `Db::write`, off the UI thread.
//!
//! `legacy` still holds the commands that have not been converted yet.

pub mod app;
pub mod courses;
pub mod legacy;
pub mod links;
pub mod notes;
pub mod recap;
pub mod reminders;
pub mod schedule;
pub mod sequences;
pub mod settings;

pub(crate) use settings::{get_setting_raw, set_setting_raw};
