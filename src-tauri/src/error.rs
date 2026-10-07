//! One error type for every command.
//!
//! The webview receives `{ code, message }`: `message` is French and can be
//! shown as is, `code` lets the UI react to specific cases (a missing item, a
//! file held open by another program, Pronote asking for a PIN…).

use serde::ser::{Serialize, SerializeStruct, Serializer};
use std::io::ErrorKind;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A message written for the teacher.
    #[error("{0}")]
    User(String),
    /// The item asked for no longer exists.
    #[error("{0}")]
    NotFound(String),
    #[error(transparent)]
    Db(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    /// Unexpected failure; the detail helps when the teacher reports it.
    #[error("{0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn user(msg: impl Into<String>) -> Self {
        Self::User(msg.into())
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::NotFound(msg.into())
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::User(_) => "user",
            Self::NotFound(_) => "not_found",
            Self::Db(rusqlite::Error::QueryReturnedNoRows) => "not_found",
            Self::Db(_) => "db",
            Self::Io(e) => match e.kind() {
                ErrorKind::NotFound => "not_found",
                ErrorKind::PermissionDenied => "file_locked",
                ErrorKind::StorageFull => "disk_full",
                _ => "io",
            },
            Self::Internal(_) => "internal",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::User(m) | Self::NotFound(m) | Self::Internal(m) => m.clone(),
            Self::Db(rusqlite::Error::QueryReturnedNoRows) => "Élément introuvable.".into(),
            Self::Db(e) => format!("Erreur de la base de données : {e}"),
            Self::Io(e) => match e.kind() {
                ErrorKind::NotFound => "Fichier introuvable.".into(),
                ErrorKind::PermissionDenied => {
                    "Accès refusé : le fichier est peut-être ouvert dans un autre programme, \
                     ou la clé est protégée en écriture."
                        .into()
                }
                ErrorKind::StorageFull => "La clé USB est pleine.".into(),
                _ => format!("Erreur de fichier : {e}"),
            },
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.message())?;
        s.end()
    }
}

// Commands not yet converted still produce `String` errors.
impl From<String> for AppError {
    fn from(msg: String) -> Self {
        Self::User(msg)
    }
}

impl From<&str> for AppError {
    fn from(msg: &str) -> Self {
        Self::User(msg.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        Self::Internal(e.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(e: tokio::task::JoinError) -> Self {
        Self::Internal(format!("Tâche interrompue : {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_french_message() {
        let v = serde_json::to_value(AppError::Db(rusqlite::Error::QueryReturnedNoRows)).unwrap();
        assert_eq!(v["code"], "not_found");
        assert_eq!(v["message"], "Élément introuvable.");
        let locked = AppError::Io(std::io::Error::from(ErrorKind::PermissionDenied));
        assert_eq!(locked.code(), "file_locked");
    }
}
