//! Pronote passwords never sit in plain text on the key.
//!
//! On Windows, DPAPI encrypts the password for the current Windows user on
//! this PC: the database only holds ciphertext that another PC or account
//! cannot read, so a lost key exposes nothing and another PC asks once. On
//! other systems the password is kept for the session only.
//!
//! (QR-code accounts never need this: they store Pronote's rotating token.)

use std::collections::HashMap;
use std::sync::Mutex;

static SESSION: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

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

/// Encrypt for this Windows user on this PC (base64). `None` where unsupported.
pub fn protect(plain: &str) -> Option<String> {
    use base64::Engine;
    let cipher = imp::protect(plain.as_bytes())?;
    Some(base64::engine::general_purpose::STANDARD.encode(cipher))
}

/// Decrypt what `protect` produced, on the same PC and Windows account.
pub fn unprotect(stored: &str) -> Option<String> {
    use base64::Engine;
    let cipher = base64::engine::general_purpose::STANDARD
        .decode(stored)
        .ok()?;
    String::from_utf8(imp::unprotect(&cipher)?).ok()
}

#[cfg(windows)]
mod imp {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn run(input: &[u8], encrypt: bool) -> Option<Vec<u8>> {
        let blob_in = CRYPT_INTEGER_BLOB {
            cbData: u32::try_from(input.len()).ok()?,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut blob_out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: null_mut(),
        };
        // SAFETY: blob_in points at `input` for the duration of the call;
        // blob_out is allocated by Windows and freed with LocalFree below.
        let ok = unsafe {
            if encrypt {
                CryptProtectData(
                    &blob_in,
                    null(),
                    null(),
                    null(),
                    null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut blob_out,
                )
            } else {
                CryptUnprotectData(
                    &blob_in,
                    null_mut(),
                    null(),
                    null(),
                    null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut blob_out,
                )
            }
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

    pub fn protect(plain: &[u8]) -> Option<Vec<u8>> {
        run(plain, true)
    }

    pub fn unprotect(cipher: &[u8]) -> Option<Vec<u8>> {
        run(cipher, false)
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn protect(_plain: &[u8]) -> Option<Vec<u8>> {
        None
    }

    pub fn unprotect(_cipher: &[u8]) -> Option<Vec<u8>> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_memory_and_round_trip() {
        remember("acc", "secret");
        assert_eq!(recall("acc").as_deref(), Some("secret"));
        forget("acc");
        assert_eq!(recall("acc"), None);
        // Where DPAPI exists, a value must decrypt back; elsewhere nothing is stored.
        let protected = protect("mot de passe é");
        if cfg!(windows) {
            let c = protected.expect("DPAPI is available on Windows");
            assert_eq!(unprotect(&c).as_deref(), Some("mot de passe é"));
        } else {
            assert!(protected.is_none());
        }
    }
}
