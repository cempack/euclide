//! Data shared between the database, the commands and the webview.
//! Field names are part of the IPC contract: they mirror src/lib/api.ts.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub teacher_name: String,
    pub author: String,
    pub version: String,
    pub data_dir: String,
    pub windows_portable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Course {
    pub id: i64,
    pub name: String,
    pub emoji: String,
    pub color: String,
    pub description: String,
    pub matiere: String, // "Mathématiques" | "NSI" | "Maths expertes" - used to map to Pronote subject for cahier de textes contents
    pub created_at: String,
}

/// Attachment of a course to a Pronote class/group. Stores per-class progress (last document)
/// and professor notes specific to how far that class has gone in the course.
#[derive(Debug, Serialize, Deserialize)]
pub struct CourseClass {
    #[serde(default)]
    pub id: i64,
    pub course_id: i64,
    pub class_name: String,
    #[serde(default)]
    pub last_file_id: Option<i64>,
    #[serde(default)]
    pub last_file_name: Option<String>,
    #[serde(default)]
    pub last_file_kind: Option<String>,
    /// Step of a sequence this class has reached (see `sequence_items`).
    #[serde(default)]
    pub last_item_id: Option<i64>,
    #[serde(default)]
    pub last_item_title: Option<String>,
    #[serde(default)]
    pub last_sequence_title: Option<String>,
    #[serde(default)]
    pub progress_updated_at: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    #[serde(default)]
    pub id: i64,
    pub course_id: Option<i64>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub updated_at: String,
}

/// A note in a list: no body, just the start of it.
#[derive(Debug, Serialize)]
pub struct NoteSummary {
    pub id: i64,
    pub course_id: Option<i64>,
    pub title: String,
    pub excerpt: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct FileItem {
    pub id: i64,
    pub course_id: Option<i64>,
    pub name: String,
    pub rel_path: String,
    pub kind: String,
    pub size: i64,
    pub added_at: String,
}

#[derive(Debug, Serialize)]
pub struct Reminder {
    pub id: i64,
    pub title: String,
    pub due_at: Option<String>,
    pub done: bool,
    pub created_at: String,
    /// Course this reminder belongs to, if any.
    pub course_id: Option<i64>,
    /// "none" | "daily" | "weekly" | "monthly".
    pub repeat_rule: String,
}

/// A chapter of a course's progression.
#[derive(Debug, Serialize)]
pub struct Sequence {
    pub id: i64,
    pub course_id: i64,
    pub title: String,
    pub position: i64,
    pub created_at: String,
}

/// A step inside a sequence (a lesson), with what it needs in class.
#[derive(Debug, Serialize)]
pub struct SequenceItem {
    pub id: i64,
    pub sequence_id: i64,
    pub title: String,
    pub position: i64,
    pub resources: Vec<StepResource>,
}

/// Something a step opens: a document, a note, a Python script or a link.
#[derive(Debug, Serialize)]
pub struct StepResource {
    pub id: i64,
    pub item_id: i64,
    /// "file", "note", "script" or "link".
    pub kind: String,
    /// The file, note or link id; None for a script.
    pub ref_id: Option<i64>,
    /// A script's file name (scripts are not in the database).
    pub ref_name: String,
    /// What to show: the document's or note's name, the link's label.
    pub name: String,
    /// The document's kind (pdf, image, board…), for its icon.
    pub file_kind: Option<String>,
    /// A link's address.
    pub url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QuickLink {
    pub id: i64,
    pub label: String,
    pub url: String,
    pub icon: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScheduleEntry {
    #[serde(default)]
    pub id: i64,
    pub day_of_week: i64,
    pub start_time: String,
    pub end_time: String,
    pub subject: String,
    #[serde(default)]
    pub room: String,
    #[serde(default)]
    pub course_id: Option<i64>,
    #[serde(default = "default_source")]
    pub source: String,
}

pub fn default_source() -> String {
    "manual".into()
}

#[derive(Debug, Serialize)]
pub struct PronoteStatus {
    pub connected: bool,
    pub account_name: Option<String>,
    pub last_sync: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PythonDemo {
    pub name: String,
    pub path: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub kind: String, // note | file | course
    pub id: i64,
    pub title: String,
    pub subtitle: String,
    pub snippet: String,
    pub course_id: Option<i64>,
    pub file_kind: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PythonCompletion {
    pub name: String,
    pub complete: Option<String>,
    #[serde(rename = "type")]
    pub type_: Option<String>,
    pub signature: Option<String>,
    pub doc: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TopCourse {
    pub name: String,
    pub emoji: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct TopItem {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct RecapData {
    pub period_label: Option<String>,
    pub files_opened: i64,
    pub notes_written: i64,
    pub demos_run: i64,
    pub reminders_done: i64,
    pub active_minutes: i64,
    pub top_courses: Vec<TopCourse>,
    pub top_documents: Vec<TopItem>,
    pub top_tools: Vec<TopItem>,
    pub time_by_area: Vec<TopItem>,
}

/// What the library holds (its own files, every note), for counters.
#[derive(Debug, Serialize, PartialEq)]
pub struct LibraryStats {
    pub files: i64,
    pub notes: i64,
    pub bytes: i64,
}
