//! Pronote passwords never sit in plain text in the database.
//!
//! Most accounts keep no password at all: at login, the sidecar trades it
//! for Pronote's rotating token, as the mobile app does (`commands::pronote`).
//! Where an establishment hands out no token, the password is sealed
//! (ChaCha20-Poly1305) with a key kept in a file of the data folder, outside
//! the database. The key travels with the data, so every PC reads it back,
//! on Windows, Linux and macOS alike: a copy of the database alone does not
//! give the password away; the whole data folder does.
//!
//! Euclide 0.3 encrypted it for one Windows user on one PC (DPAPI) instead,
//! so that every other PC asked for it again: such a value is still read on
//! the PC that wrote it, and sealed again (`open_legacy`).

use base64::Engine;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, CHACHA20_POLY1305, NONCE_LEN};
use ring::rand::{SecureRandom, SystemRandom};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static SESSION: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// The folder that holds the key: the data folder, set once at startup.
static KEY_DIR: Mutex<Option<PathBuf>> = Mutex::new(None);
/// Creating the key is check-then-write: one at a time.
static KEY_LOCK: Mutex<()> = Mutex::new(());

const KEY_FILE: &str = "euclide.key";
const SEALED: &str = "v1:";

/// Where the key lives from now on (the data folder).
pub fn use_key_dir(dir: &Path) {
    *KEY_DIR.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir.to_path_buf());
}

fn key_dir() -> Option<PathBuf> {
    KEY_DIR.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Remember a password for the rest of this session.
pub fn remember(account: &str, password: &str) {
    let mut guard = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    guard
        .get_or_insert_with(HashMap::new)
        .insert(account.to_string(), password.to_string());
}

pub fn recall(account: &str) -> Option<String> {
    let guard = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    guard.as_ref()?.get(account).cloned()
}

pub fn forget(account: &str) {
    let mut guard = SESSION.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(map) = guard.as_mut() {
        map.remove(account);
    }
}

/// Seal a password with the data folder's key, made on first use. `None`
/// when no folder was given for the key, or it cannot be written.
pub fn seal(plain: &str) -> Option<String> {
    seal_in(&key_dir()?, plain)
}

/// Open what `seal` produced, on any PC that has the same data folder.
pub fn open(stored: &str) -> Option<String> {
    open_in(&key_dir()?, stored)
}

/// Euclide 0.3's value, readable only by the Windows user and PC that
/// encrypted it (DPAPI). `None` anywhere else.
pub fn open_legacy(stored: &str) -> Option<String> {
    let cipher = base64::engine::general_purpose::STANDARD
        .decode(stored)
        .ok()?;
    String::from_utf8(dpapi::unprotect(&cipher)?).ok()
}

fn key_in(dir: &Path, create: bool) -> Option<LessSafeKey> {
    let path = dir.join(KEY_FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => {
            let mut bytes = vec![0u8; CHACHA20_POLY1305.key_len()];
            SystemRandom::new().fill(&mut bytes).ok()?;
            crate::fsx::atomic_write(&path, &bytes).ok()?;
            bytes
        }
        Err(_) => return None,
    };
    let key = UnboundKey::new(&CHACHA20_POLY1305, &bytes).ok()?;
    Some(LessSafeKey::new(key))
}

fn seal_in(dir: &Path, plain: &str) -> Option<String> {
    let key = {
        let _one = KEY_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        key_in(dir, true)?
    };
    let mut nonce = [0u8; NONCE_LEN];
    SystemRandom::new().fill(&mut nonce).ok()?;
    let mut sealed = plain.as_bytes().to_vec();
    key.seal_in_place_append_tag(
        Nonce::assume_unique_for_key(nonce),
        Aad::empty(),
        &mut sealed,
    )
    .ok()?;
    let mut out = nonce.to_vec();
    out.extend_from_slice(&sealed);
    Some(format!(
        "{SEALED}{}",
        base64::engine::general_purpose::STANDARD.encode(out)
    ))
}

fn open_in(dir: &Path, stored: &str) -> Option<String> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(stored.strip_prefix(SEALED)?)
        .ok()?;
    if data.len() < NONCE_LEN {
        return None;
    }
    let (nonce, sealed) = data.split_at(NONCE_LEN);
    let key = key_in(dir, false)?;
    let mut buf = sealed.to_vec();
    let plain = key
        .open_in_place(
            Nonce::try_assume_unique_for_key(nonce).ok()?,
            Aad::empty(),
            &mut buf,
        )
        .ok()?;
    String::from_utf8(plain.to_vec()).ok()
}

#[cfg(windows)]
mod dpapi {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    pub fn unprotect(cipher: &[u8]) -> Option<Vec<u8>> {
        let blob_in = CRYPT_INTEGER_BLOB {
            cbData: u32::try_from(cipher.len()).ok()?,
            pbData: cipher.as_ptr() as *mut u8,
        };
        let mut blob_out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        };
        // SAFETY: blob_in points at `cipher` for the duration of the call;
        // blob_out is allocated by Windows and freed with LocalFree below.
        let ok = unsafe {
            CryptUnprotectData(
                &blob_in,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut blob_out,
            )
        };
        if ok == 0 || blob_out.pbData.is_null() {
            return None;
        }
        // SAFETY: Windows returned `cbData` bytes at `pbData`.
        let out = unsafe {
            std::slice::from_raw_parts(blob_out.pbData, blob_out.cbData as usize).to_vec()
        };
        unsafe {
            LocalFree(blob_out.pbData as _);
        }
        Some(out)
    }
}

#[cfg(not(windows))]
mod dpapi {
    pub fn unprotect(_cipher: &[u8]) -> Option<Vec<u8>> {
        None
    }
}

/// A folder of its own for each test's key.
#[cfg(test)]
pub(crate) fn test_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("euclide-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_memory() {
        remember("acc", "secret");
        assert_eq!(recall("acc").as_deref(), Some("secret"));
        forget("acc");
        assert_eq!(recall("acc"), None);
    }

    #[test]
    fn sealed_with_the_folder_key_and_opened_anywhere_it_goes() {
        let dir = test_dir("seal");
        let sealed = seal_in(&dir, "mot de passe é").expect("sealed");
        assert!(sealed.starts_with(SEALED));
        assert!(!sealed.contains("mot de passe"));
        assert!(dir.join(KEY_FILE).exists(), "the key is made on first use");
        // Another PC: the same folder, so the same key.
        let moved = test_dir("seal-moved");
        std::fs::copy(dir.join(KEY_FILE), moved.join(KEY_FILE)).unwrap();
        assert_eq!(open_in(&moved, &sealed).as_deref(), Some("mot de passe é"));
        // Each seal draws its own nonce.
        assert_ne!(seal_in(&dir, "mot de passe é"), Some(sealed.clone()));
    }

    #[test]
    fn nothing_opens_without_the_key_or_with_another() {
        let dir = test_dir("seal-other");
        let sealed = seal_in(&dir, "secret").unwrap();
        let empty = test_dir("seal-empty");
        assert_eq!(open_in(&empty, &sealed), None);
        assert!(!empty.join(KEY_FILE).exists(), "opening never makes a key");
        let other = test_dir("seal-wrong");
        seal_in(&other, "x").unwrap();
        assert_eq!(open_in(&other, &sealed), None);
        assert_eq!(open_in(&dir, "v1:not base64"), None);
        assert_eq!(open_in(&dir, "plain"), None);
    }

    #[test]
    fn a_dpapi_value_opens_only_where_windows_can_read_it() {
        assert_eq!(open_legacy("not base64 !"), None);
        if !cfg!(windows) {
            assert_eq!(open_legacy("AAAA"), None);
        }
    }
}
