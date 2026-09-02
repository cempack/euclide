//! In-place Windows portable updates.
//!
//! USB / flash-drive copies live next to `euclide.exe` (`Euclide-Data`, notes, the
//! sidecar folder, anything the teacher dropped in that directory). The official
//! Tauri updater would run NSIS, which can install somewhere else and wipe
//! `$INSTDIR`. This path instead:
//!
//! 1. Downloads the signed `Euclide-windows-portable.zip`
//! 2. Overlays **only** `euclide.exe` / `Euclide.exe`, `euclide-sidecar/**`, and
//!    a couple of marker/readme files
//! 3. Never deletes unknown files, `Euclide-Data`, or `euclide-data.json`
//! 4. Replaces the running exe from a helper after this process exits, in the
//!    **same folder** (including `E:\` on a stick)
#![cfg_attr(not(windows), allow(dead_code))]

use std::io::Cursor;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;

const PORTABLE_MARKER: &str = "euclide.portable";
#[cfg(windows)]
const STAGING_PREFIX: &str = "euclide-update-";
#[cfg(windows)]
const MAX_UPDATE_BYTES: u64 = 400 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
#[allow(dead_code)] // constructed while downloading on Windows
pub enum PortableDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started { content_length: Option<u64> },
    #[serde(rename_all = "camelCase")]
    Progress { chunk_length: usize },
    Finished,
}

/// True when this process is the USB/portable layout (exe + sidecar in one folder),
/// not an NSIS install (which ships `uninstall.exe`).
pub fn is_windows_portable() -> bool {
    #[cfg(not(windows))]
    {
        false
    }
    #[cfg(windows)]
    {
        is_windows_portable_dir(&crate::paths::exe_dir())
    }
}

pub fn is_windows_portable_dir(dir: &Path) -> bool {
    if dir.join(PORTABLE_MARKER).is_file() {
        return true;
    }
    if !dir.join("euclide-sidecar").is_dir() {
        return false;
    }
    !dir_has_uninstaller(dir)
}

fn dir_has_uninstaller(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|e| {
        let name = e.file_name().to_string_lossy().to_ascii_lowercase();
        name.ends_with(".exe") && name.contains("uninstall")
    })
}

fn updater_pubkey() -> Result<String, String> {
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|e| format!("tauri.conf.json: {e}"))?;
    conf["plugins"]["updater"]["pubkey"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "Clé publique updater absente de tauri.conf.json".into())
}

/// Minisign check matching `tauri-plugin-updater` (`verify_signature`).
pub fn verify_update_signature(data: &[u8], release_signature: &str, pub_key: &str) -> Result<(), String> {
    use base64::Engine;
    use minisign_verify::{PublicKey, Signature};

    let decode = |s: &str, what: &str| -> Result<String, String> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(s.trim())
            .map_err(|e| format!("{what}: base64 invalide ({e})"))?;
        String::from_utf8(bytes).map_err(|_| format!("{what}: UTF-8 invalide"))
    };

    let public_key = PublicKey::decode(&decode(pub_key, "pubkey")?)
        .map_err(|e| format!("pubkey: {e}"))?;
    let signature = Signature::decode(&decode(release_signature, "signature")?)
        .map_err(|e| format!("signature: {e}"))?;
    public_key
        .verify(data, &signature, true)
        .map_err(|e| format!("Signature de la mise à jour invalide: {e}"))
}

fn normalize_zip_entry(raw: &str) -> Option<PathBuf> {
    let n = raw.replace('\\', "/");
    let n = n.trim().trim_start_matches('/');
    if n.is_empty() || n.contains('\0') {
        return None;
    }
    if n.chars().nth(1) == Some(':') {
        return None;
    }
    let mut out = PathBuf::new();
    for c in Path::new(n).components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn top_name_lower(path: &Path) -> Option<String> {
    path.components().next().map(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase())
}

fn is_app_root_name(name_lower: &str) -> bool {
    matches!(
        name_lower,
        "euclide.exe" | "euclide.portable" | "readme.txt" | "readme.md" | "euclide-sidecar"
    )
}

/// If every entry lives under a single wrapper folder (e.g. `Euclide-portable/`),
/// strip it. Never strip `euclide-sidecar` or the exe itself.
fn strip_wrapper_dir(path: &Path, wrapper: Option<&str>) -> PathBuf {
    let Some(w) = wrapper else {
        return path.to_path_buf();
    };
    let mut comps = path.components();
    if let Some(Component::Normal(first)) = comps.next() {
        if first.to_string_lossy() == w {
            return comps.collect();
        }
    }
    path.to_path_buf()
}

fn detect_wrapper(paths: &[PathBuf]) -> Option<String> {
    if paths.is_empty() {
        return None;
    }
    let firsts: Vec<String> = paths
        .iter()
        .filter_map(|p| top_name_lower(p))
        .collect();
    if firsts.len() != paths.len() {
        return None;
    }
    let wrap = firsts[0].clone();
    if firsts.iter().any(|f| f != &wrap) {
        return None;
    }
    if is_app_root_name(&wrap) {
        return None;
    }
    Some(
        paths[0]
            .components()
            .next()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())?,
    )
}

pub fn is_allowed_overlay_rel(path: &Path) -> bool {
    if path.as_os_str().is_empty() {
        return false;
    }
    let mut comps = path.components();
    let Some(Component::Normal(first)) = comps.next() else {
        return false;
    };
    let first_l = first.to_string_lossy().to_ascii_lowercase();
    match first_l.as_str() {
        "euclide.exe" | "euclide.portable" | "readme.txt" | "readme.md" => comps.next().is_none(),
        "euclide-sidecar" => true,
        _ => false,
    }
}

/// Overlay allowed app files onto `dest`. Unknown files already in `dest` are left
/// untouched — no deletes, no purge of `Euclide-Data`.
pub fn extract_allowed_overlay(bytes: &[u8], dest: &Path) -> Result<usize, String> {
    if bytes.len() < 4 || &bytes[0..2] != b"PK" {
        return Err(
            "La mise à jour portable attend une archive zip (pas un installateur NSIS).".into(),
        );
    }

    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| format!("Archive zip illisible: {e}"))?;

    let mut names: Vec<(usize, PathBuf)> = Vec::new();
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| format!("Entrée zip {i}: {e}"))?;
        if file.is_dir() {
            continue;
        }
        let Some(rel) = normalize_zip_entry(file.name()) else {
            return Err(format!("Chemin zip refusé: {}", file.name()));
        };
        names.push((i, rel));
    }

    let collected: Vec<PathBuf> = names.iter().map(|(_, p)| p.clone()).collect();
    let wrapper = detect_wrapper(&collected);

    let mut written = 0usize;
    for (i, rel) in names {
        let rel = strip_wrapper_dir(&rel, wrapper.as_deref());
        if rel.as_os_str().is_empty() {
            continue;
        }
        if !is_allowed_overlay_rel(&rel) {
            // Extra files in the zip (notes, data, random docs) are ignored — never
            // extracted, never used as a reason to wipe the destination.
            continue;
        }
        let out_path = dest.join(&rel);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Impossible de créer {}: {e}", parent.display()))?;
        }
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Entrée zip {}: {e}", rel.display()))?;
        let mut out = std::fs::File::create(&out_path)
            .map_err(|e| format!("Écriture impossible ({}): {e}", out_path.display()))?;
        std::io::copy(&mut file, &mut out)
            .map_err(|e| format!("Copie zip ({}): {e}", rel.display()))?;
        written += 1;
    }

    if written == 0 {
        return Err(
            "L'archive ne contient pas euclide.exe / euclide-sidecar. Mise à jour refusée.".into(),
        );
    }
    Ok(written)
}

#[tauri::command]
pub async fn apply_windows_portable_update(
    app: AppHandle,
    url: String,
    signature: String,
    on_event: Channel<PortableDownloadEvent>,
) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = (app, url, signature, on_event);
        Err("La mise à jour portable in-place n'est disponible que sous Windows.".into())
    }
    #[cfg(windows)]
    {
        apply_windows_portable_update_inner(app, url, signature, on_event).await
    }
}

#[cfg(windows)]
async fn apply_windows_portable_update_inner(
    app: AppHandle,
    url: String,
    signature: String,
    on_event: Channel<PortableDownloadEvent>,
) -> Result<(), String> {
    if !is_windows_portable() {
        return Err("Cette copie n'est pas la version portable Windows.".into());
    }
    if !(url.starts_with("https://") || url.starts_with("HTTPS://")) {
        return Err("L'URL de mise à jour doit être en HTTPS.".into());
    }

    let bytes = download_update(&url, &on_event).await?;
    let pubkey = updater_pubkey()?;
    verify_update_signature(&bytes, &signature, &pubkey)?;

    let dest = crate::paths::exe_dir();
    let staging = std::env::temp_dir().join(format!("{STAGING_PREFIX}{}", std::process::id()));
    if staging.exists() {
        let _ = std::fs::remove_dir_all(&staging);
    }
    std::fs::create_dir_all(&staging)
        .map_err(|e| format!("Dossier temporaire de mise à jour: {e}"))?;

    let written = match extract_allowed_overlay(&bytes, &staging) {
        Ok(n) => n,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(e);
        }
    };
    let _ = written;

    if let Some(sc) = app.try_state::<crate::sidecar::Sidecar>() {
        sc.stop().await;
    }

    let exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_os_string()))
        .unwrap_or_else(|| std::ffi::OsString::from("euclide.exe"));

    spawn_overlay_helper(&dest, &staging, &exe_name)?;

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        app2.exit(0);
    });
    Ok(())
}

#[cfg(windows)]
async fn download_update(
    url: &str,
    on_event: &Channel<PortableDownloadEvent>,
) -> Result<Vec<u8>, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::builder()
        .user_agent(concat!("Euclide/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("HTTP: {e}"))?;

    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("Téléchargement: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Téléchargement: HTTP {}",
            response.status().as_u16()
        ));
    }

    let content_length = response.content_length();
    if let Some(len) = content_length {
        if len > MAX_UPDATE_BYTES {
            return Err("Archive de mise à jour trop volumineuse.".into());
        }
    }
    let _ = on_event.send(PortableDownloadEvent::Started { content_length });

    let mut buffer = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Téléchargement: {e}"))?;
        if buffer.len() as u64 + chunk.len() as u64 > MAX_UPDATE_BYTES {
            return Err("Archive de mise à jour trop volumineuse.".into());
        }
        let _ = on_event.send(PortableDownloadEvent::Progress {
            chunk_length: chunk.len(),
        });
        buffer.extend_from_slice(&chunk);
    }
    let _ = on_event.send(PortableDownloadEvent::Finished);
    Ok(buffer)
}

#[cfg(windows)]
fn spawn_overlay_helper(dest: &Path, staging: &Path, exe_name: &std::ffi::OsStr) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let helper = std::env::temp_dir().join(format!("euclide-apply-update-{}.ps1", std::process::id()));
    let script = r#"param(
  [Parameter(Mandatory=$true)][string]$Dest,
  [Parameter(Mandatory=$true)][string]$Stage,
  [Parameter(Mandatory=$true)][int]$AppPid,
  [Parameter(Mandatory=$true)][string]$ExeName
)
$ErrorActionPreference = 'Continue'
while (Get-Process -Id $AppPid -ErrorAction SilentlyContinue) {
  Start-Sleep -Milliseconds 400
}
# Overlay only: copy/overwrite files from the staging dir. Never Remove-Item on $Dest,
# never robocopy /MIR. Euclide-Data, euclide-data.json, and any other files stay.
if (Test-Path -LiteralPath $Stage) {
  Get-ChildItem -LiteralPath $Stage -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse -Force -ErrorAction SilentlyContinue
  }
}
$exe = Join-Path $Dest $ExeName
if (Test-Path -LiteralPath $exe) {
  Start-Process -FilePath $exe -WorkingDirectory $Dest
}
Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
"#;
    std::fs::write(&helper, script).map_err(|e| format!("Helper de mise à jour: {e}"))?;

    let powershell = std::env::var("SystemRoot")
        .map(|r| format!(r"{r}\System32\WindowsPowerShell\v1.0\powershell.exe"))
        .unwrap_or_else(|_| "powershell.exe".into());

    std::process::Command::new(powershell)
        .arg("-NoProfile")
        .arg("-WindowStyle")
        .arg("Hidden")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&helper)
        .arg("-Dest")
        .arg(dest)
        .arg("-Stage")
        .arg(staging)
        .arg("-AppPid")
        .arg(std::process::id().to_string())
        .arg("-ExeName")
        .arg(exe_name)
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| format!("Impossible de lancer le helper de mise à jour: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn zip_with(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut cursor);
            let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            for (name, data) in files {
                zw.start_file(*name, opts).unwrap();
                zw.write_all(data).unwrap();
            }
            zw.finish().unwrap();
        }
        cursor.into_inner()
    }

    #[test]
    fn allowlist_accepts_app_files_only() {
        assert!(is_allowed_overlay_rel(Path::new("euclide.exe")));
        assert!(is_allowed_overlay_rel(Path::new("Euclide.exe")));
        assert!(is_allowed_overlay_rel(Path::new("euclide.portable")));
        assert!(is_allowed_overlay_rel(Path::new("euclide-sidecar/euclide-sidecar.exe")));
        assert!(is_allowed_overlay_rel(Path::new("euclide-sidecar/internal/foo.pyd")));
        assert!(!is_allowed_overlay_rel(Path::new("Euclide-Data/euclide.db")));
        assert!(!is_allowed_overlay_rel(Path::new("euclide-data.json")));
        assert!(!is_allowed_overlay_rel(Path::new("notes.txt")));
        assert!(!is_allowed_overlay_rel(Path::new("unrelated/euclide.exe")));
        assert!(normalize_zip_entry("../Euclide-Data/x").is_none());
        assert!(normalize_zip_entry("euclide-sidecar/../../secret").is_none());
        assert!(normalize_zip_entry("C:/Windows/euclide.exe").is_none());
    }

    #[test]
    fn portable_dir_detects_marker_and_sidecar_without_uninstaller() {
        let tmp = std::env::temp_dir().join(format!("euclide-portable-detect-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("euclide-sidecar")).unwrap();
        assert!(is_windows_portable_dir(&tmp));
        std::fs::write(tmp.join("Uninstall.exe"), b"nsis").unwrap();
        assert!(!is_windows_portable_dir(&tmp));
        std::fs::remove_file(tmp.join("Uninstall.exe")).unwrap();
        std::fs::write(tmp.join(PORTABLE_MARKER), b"").unwrap();
        std::fs::write(tmp.join("Uninstall.exe"), b"nsis").unwrap();
        // Marker wins: a USB copy that later gained a stray uninstall.exe still overlays.
        assert!(is_windows_portable_dir(&tmp));
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn overlay_replaces_app_files_and_keeps_everything_else() {
        let tmp = std::env::temp_dir().join(format!("euclide-overlay-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("Euclide-Data/courses")).unwrap();
        std::fs::write(tmp.join("Euclide-Data/euclide.db"), b"KEEP-DB").unwrap();
        std::fs::write(tmp.join("euclide-data.json"), br#"{"dataDir":"Euclide-Data"}"#).unwrap();
        std::fs::write(tmp.join("mes-cours.pdf"), b"KEEP-PDF").unwrap();
        std::fs::create_dir_all(tmp.join("euclide-sidecar")).unwrap();
        std::fs::write(tmp.join("euclide-sidecar/old.dat"), b"OLD-SIDECAR-EXTRA").unwrap();
        std::fs::write(tmp.join("euclide.exe"), b"OLD-EXE").unwrap();

        let zip = zip_with(&[
            ("euclide.exe", b"NEW-EXE"),
            ("euclide.portable", b""),
            ("euclide-sidecar/euclide-sidecar.exe", b"NEW-SIDECAR"),
            ("Euclide-Data/euclide.db", b"SHOULD-NOT-WRITE"),
            ("euclide-data.json", br#"{"hack":true}"#),
            ("stray.txt", b"NOPE"),
        ]);

        let n = extract_allowed_overlay(&zip, &tmp).unwrap();
        assert!(n >= 3);
        assert_eq!(std::fs::read(tmp.join("euclide.exe")).unwrap(), b"NEW-EXE");
        assert_eq!(
            std::fs::read(tmp.join("euclide-sidecar/euclide-sidecar.exe")).unwrap(),
            b"NEW-SIDECAR"
        );
        assert_eq!(std::fs::read(tmp.join("Euclide-Data/euclide.db")).unwrap(), b"KEEP-DB");
        assert_eq!(
            std::fs::read_to_string(tmp.join("euclide-data.json")).unwrap(),
            r#"{"dataDir":"Euclide-Data"}"#
        );
        assert_eq!(std::fs::read(tmp.join("mes-cours.pdf")).unwrap(), b"KEEP-PDF");
        assert_eq!(
            std::fs::read(tmp.join("euclide-sidecar/old.dat")).unwrap(),
            b"OLD-SIDECAR-EXTRA"
        );
        assert!(!tmp.join("stray.txt").exists());
        assert!(tmp.join(PORTABLE_MARKER).is_file());
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn overlay_strips_wrapper_folder_and_rejects_nsis_exe_zip() {
        let tmp = std::env::temp_dir().join(format!("euclide-overlay-wrap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("keep-me.txt"), b"SAFE").unwrap();

        let zip = zip_with(&[
            ("Euclide-portable/euclide.exe", b"WRAPPED-EXE"),
            ("Euclide-portable/euclide-sidecar/run.exe", b"WRAPPED-SC"),
        ]);
        extract_allowed_overlay(&zip, &tmp).unwrap();
        assert_eq!(std::fs::read(tmp.join("euclide.exe")).unwrap(), b"WRAPPED-EXE");
        assert_eq!(
            std::fs::read(tmp.join("euclide-sidecar/run.exe")).unwrap(),
            b"WRAPPED-SC"
        );
        assert_eq!(std::fs::read(tmp.join("keep-me.txt")).unwrap(), b"SAFE");
        assert!(!tmp.join("Euclide-portable").exists());

        let nsis = zip_with(&[("Euclide_0.1.0_x64-setup.exe", b"MZ-fake-installer")]);
        let err = extract_allowed_overlay(&nsis, &tmp).unwrap_err();
        assert!(err.contains("euclide.exe") || err.contains("refus"));
        assert_eq!(std::fs::read(tmp.join("keep-me.txt")).unwrap(), b"SAFE");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn verify_rejects_garbage_signature() {
        let err = verify_update_signature(b"hello", "not-valid-signature", &updater_pubkey().unwrap())
            .unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn pubkey_in_tauri_conf_is_present() {
        updater_pubkey().expect("pubkey in tauri.conf.json");
    }

    #[test]
    fn overlay_reads_deflate_zip() {
        let tmp = std::env::temp_dir().join(format!("euclide-overlay-deflate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("keep.txt"), b"KEEP").unwrap();

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut cursor);
            let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zw.start_file("euclide.exe", opts).unwrap();
            zw.write_all(b"DEFLATED-EXE").unwrap();
            zw.finish().unwrap();
        }
        extract_allowed_overlay(&cursor.into_inner(), &tmp).unwrap();
        assert_eq!(std::fs::read(tmp.join("euclide.exe")).unwrap(), b"DEFLATED-EXE");
        assert_eq!(std::fs::read(tmp.join("keep.txt")).unwrap(), b"KEEP");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn overlay_rejects_non_zip() {
        let tmp = std::env::temp_dir().join(format!("euclide-overlay-nsis-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let err = extract_allowed_overlay(b"MZ this is an nsis installer", &tmp).unwrap_err();
        assert!(err.to_lowercase().contains("zip"));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
