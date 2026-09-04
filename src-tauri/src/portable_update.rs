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
//! 4. Puts the new `euclide.exe` in place **before** the app quits (Windows can
//!    rename a running exe, not overwrite it). The displaced file is deleted
//!    immediately when unlocked, otherwise right after this PID exits (helper)
//!    and again on the next launch. No `*.euclide-old*` leftovers are kept.
//!    Then this window closes; the user opens Euclide again. Does not start
//!    the new process.
#![cfg_attr(not(windows), allow(dead_code))]

use std::io::Cursor;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;

const PORTABLE_MARKER: &str = "euclide.portable";
const OLD_SUFFIX: &str = ".euclide-old";
const NEW_SUFFIX: &str = ".euclide-new";

/// After this PID exits, delete renamed leftovers (`*.euclide-old*`). The new
/// exe is already at `$Dest\euclide.exe` — this script must not copy or start.
/// Names are `euclide.exe.euclide-old-<pid>-<nanos>`, so the glob must be
/// `*.euclide-old*` (not `*.euclide-old`, which never matched).
const CLEANUP_HELPER_PS1: &str = r#"param(
  [Parameter(Mandatory=$true)][string]$Dest,
  [Parameter(Mandatory=$true)][int]$AppPid
)
$ErrorActionPreference = 'SilentlyContinue'
function Clear-EuclideLeftovers {
  param([string]$Root, [switch]$Recurse)
  if (-not (Test-Path -LiteralPath $Root)) { return }
  $items = if ($Recurse) {
    Get-ChildItem -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue
  }
  $items |
    Where-Object { -not $_.PSIsContainer -and ($_.Name -like '*.euclide-old*' -or $_.Name -like '*.euclide-new*') } |
    ForEach-Object {
      $_.IsReadOnly = $false
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
}
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Process -Id $AppPid -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) {
  Start-Sleep -Milliseconds 250
}
$until = (Get-Date).AddSeconds(90)
do {
  Clear-EuclideLeftovers -Root $Dest
  $sc = Join-Path $Dest 'euclide-sidecar'
  Clear-EuclideLeftovers -Root $sc -Recurse
  $left = @(
    Get-ChildItem -LiteralPath $Dest -Force -ErrorAction SilentlyContinue |
      Where-Object { -not $_.PSIsContainer -and ($_.Name -like '*.euclide-old*' -or $_.Name -like '*.euclide-new*') }
  )
  if ($left.Count -eq 0) { break }
  Start-Sleep -Milliseconds 400
} while ((Get-Date) -lt $until)
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
"#;
#[cfg(windows)]
const STAGING_PREFIX: &str = "euclide-update-";
#[cfg(windows)]
const MAX_UPDATE_BYTES: u64 = 400 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
#[allow(dead_code)] // constructed while downloading on Windows
pub enum PortableDownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
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
pub fn verify_update_signature(
    data: &[u8],
    release_signature: &str,
    pub_key: &str,
) -> Result<(), String> {
    use base64::Engine;
    use minisign_verify::{PublicKey, Signature};

    let decode = |s: &str, what: &str| -> Result<String, String> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(s.trim())
            .map_err(|e| format!("{what}: base64 invalide ({e})"))?;
        String::from_utf8(bytes).map_err(|_| format!("{what}: UTF-8 invalide"))
    };

    let public_key =
        PublicKey::decode(&decode(pub_key, "pubkey")?).map_err(|e| format!("pubkey: {e}"))?;
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
    path.components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase())
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
    let firsts: Vec<String> = paths.iter().filter_map(|p| top_name_lower(p)).collect();
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

pub fn is_update_leftover_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains(".euclide-old") || n.contains(".euclide-new")
}

fn clear_readonly(path: &Path) {
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        if perms.readonly() {
            perms.set_readonly(false);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
}

/// Windows `remove_file` fails on read-only leftovers (zip/USB) and on a
/// sharing violation while the old exe is still mapped. Clear the bit and retry.
fn delete_leftover_file(path: &Path) -> bool {
    if !path.exists() {
        return true;
    }
    clear_readonly(path);
    for i in 0..16 {
        if std::fs::remove_file(path).is_ok() {
            return true;
        }
        clear_readonly(path);
        std::thread::sleep(std::time::Duration::from_millis(40 + i * 20));
    }
    !path.exists()
}

#[cfg_attr(not(windows), allow(dead_code))]
fn leftover_file_names_in(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry
            .file_name()
            .to_str()
            .is_some_and(is_update_leftover_name)
    })
}

#[cfg_attr(not(windows), allow(dead_code))]
fn leftovers_present(dir: &Path) -> bool {
    leftover_file_names_in(dir) || leftover_file_names_in(&dir.join("euclide-sidecar"))
}

fn purge_leftover_files_in(dir: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if !is_update_leftover_name(name) {
            continue;
        }
        if delete_leftover_file(&path) {
            removed += 1;
        }
    }
    removed
}

fn purge_leftover_files_under(dir: &Path) -> usize {
    let mut removed = purge_leftover_files_in(dir);
    let Ok(entries) = std::fs::read_dir(dir) else {
        return removed;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            removed += purge_leftover_files_under(&path);
        }
    }
    removed
}

/// Delete displaced update files (`*.euclide-old*`, `*.euclide-new*`) next to
/// the exe and under `euclide-sidecar`. Never walks `Euclide-Data`.
pub fn purge_update_leftovers(dir: &Path) -> usize {
    let mut removed = purge_leftover_files_in(dir);
    let sidecar = dir.join("euclide-sidecar");
    if sidecar.is_dir() {
        removed += purge_leftover_files_under(&sidecar);
    }
    removed
}

/// After the in-process delete, a detached helper waits for this PID to exit
/// and retries — the running `euclide.exe` leftover can stay locked until then.
#[cfg(windows)]
pub fn schedule_leftover_cleanup(dir: &Path) {
    if leftovers_present(dir) {
        let _ = spawn_cleanup_helper(dir);
    }
}

fn unique_sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    name.push(format!(
        "-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0)
    ));
    PathBuf::from(name)
}

fn is_app_exe_rel(rel: &Path) -> bool {
    rel.components().nth(1).is_none()
        && rel
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.eq_ignore_ascii_case("euclide.exe"))
            .unwrap_or(false)
}

/// Windows can rename a running exe/dll but not overwrite it. Write the new
/// bytes beside the target, move the live file out of the way, then put the
/// new file at the original name.
pub fn replace_locked_file(src: &Path, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Impossible de créer {}: {e}", parent.display()))?;
    }

    let mut last = String::new();
    for _ in 0..8 {
        match replace_locked_file_once(src, dest) {
            Ok(()) => return Ok(()),
            Err(e) => last = e,
        }
        std::thread::sleep(std::time::Duration::from_millis(80));
    }
    Err(last)
}

fn replace_locked_file_once(src: &Path, dest: &Path) -> Result<(), String> {
    // Unlocked files (readme, portable marker) overwrite in place — no sibling.
    clear_readonly(dest);
    if std::fs::copy(src, dest).is_ok() {
        return Ok(());
    }

    let incoming = unique_sibling(dest, NEW_SUFFIX);
    let backup = unique_sibling(dest, OLD_SUFFIX);
    std::fs::copy(src, &incoming)
        .map_err(|e| format!("Impossible de préparer {}: {e}", dest.display()))?;

    if dest.exists() {
        if let Err(e) = std::fs::rename(dest, &backup) {
            let _ = delete_leftover_file(&incoming);
            return Err(format!(
                "Impossible de déplacer {} (fichier verrouillé): {e}",
                dest.display()
            ));
        }
    }

    if let Err(e) = std::fs::rename(&incoming, dest) {
        if let Err(copy_err) = std::fs::copy(&incoming, dest) {
            let _ = std::fs::rename(&backup, dest);
            let _ = delete_leftover_file(&incoming);
            return Err(format!(
                "Impossible d'installer {}: {e} / {copy_err}",
                dest.display()
            ));
        }
        let _ = delete_leftover_file(&incoming);
    }
    // Do not keep the displaced file. A running Windows exe may still lock
    // `backup` until this PID exits — the cleanup helper / next launch
    // removes it then.
    let _ = delete_leftover_file(&backup);
    Ok(())
}

fn collect_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    fn rec(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                rec(&path, out);
            } else {
                out.push(path);
            }
        }
    }
    rec(root, &mut out);
    out
}

fn dest_has_app_exe(dest: &Path) -> bool {
    dest.join("euclide.exe").is_file() || dest.join("Euclide.exe").is_file()
}

/// Copy staged app files onto `dest` now (rename-around locks). `euclide.exe`
/// is replaced first and must succeed. Sidecar files that are still locked
/// are skipped so a busy helper never aborts the whole update. `Euclide-Data`
/// is never touched.
pub fn apply_staging_overlay(staging: &Path, dest: &Path) -> Result<usize, String> {
    let mut files = collect_files(staging);
    files.sort_by_key(|src| {
        src.strip_prefix(staging)
            .ok()
            .map(|rel| if is_app_exe_rel(rel) { 0 } else { 1 })
            .unwrap_or(2)
    });

    let mut written = 0usize;
    let mut exe_ok = false;
    for src in files {
        let Ok(rel) = src.strip_prefix(staging) else {
            continue;
        };
        if rel.as_os_str().is_empty() || !is_allowed_overlay_rel(rel) {
            continue;
        }
        let is_exe = is_app_exe_rel(rel);
        match replace_locked_file(&src, &dest.join(rel)) {
            Ok(()) => {
                written += 1;
                if is_exe {
                    exe_ok = true;
                }
            }
            Err(e) if is_exe => return Err(e),
            Err(_) => {}
        }
    }
    if !exe_ok || !dest_has_app_exe(dest) {
        return Err("La mise à jour n'a pas pu remplacer euclide.exe.".into());
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

    if let Some(sc) = app.try_state::<crate::sidecar::Sidecar>() {
        let _ = tokio::time::timeout(std::time::Duration::from_millis(800), sc.stop()).await;
    }

    if let Err(e) = extract_allowed_overlay(&bytes, &staging) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }
    if let Err(e) = apply_staging_overlay(&staging, &dest) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }
    let _ = std::fs::remove_dir_all(&staging);
    let _ = purge_update_leftovers(&dest);
    let _ = spawn_cleanup_helper(&dest);
    // Return success first so the UI does not treat the dying IPC as a failure.
    // Then close this window. Do not start the new process.
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
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
fn spawn_cleanup_helper(dest: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let helper =
        std::env::temp_dir().join(format!("euclide-apply-update-{}.ps1", std::process::id()));
    std::fs::write(&helper, CLEANUP_HELPER_PS1)
        .map_err(|e| format!("Helper de mise à jour: {e}"))?;

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
        .arg("-AppPid")
        .arg(std::process::id().to_string())
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
            let opts =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
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
        assert!(is_allowed_overlay_rel(Path::new(
            "euclide-sidecar/euclide-sidecar.exe"
        )));
        assert!(is_allowed_overlay_rel(Path::new(
            "euclide-sidecar/internal/foo.pyd"
        )));
        assert!(!is_allowed_overlay_rel(Path::new(
            "Euclide-Data/euclide.db"
        )));
        assert!(!is_allowed_overlay_rel(Path::new("euclide-data.json")));
        assert!(!is_allowed_overlay_rel(Path::new("notes.txt")));
        assert!(!is_allowed_overlay_rel(Path::new("unrelated/euclide.exe")));
        assert!(normalize_zip_entry("../Euclide-Data/x").is_none());
        assert!(normalize_zip_entry("euclide-sidecar/../../secret").is_none());
        assert!(normalize_zip_entry("C:/Windows/euclide.exe").is_none());
    }

    #[test]
    fn portable_dir_detects_marker_and_sidecar_without_uninstaller() {
        let tmp =
            std::env::temp_dir().join(format!("euclide-portable-detect-{}", std::process::id()));
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
        std::fs::write(
            tmp.join("euclide-data.json"),
            br#"{"dataDir":"Euclide-Data"}"#,
        )
        .unwrap();
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
        assert_eq!(
            std::fs::read(tmp.join("Euclide-Data/euclide.db")).unwrap(),
            b"KEEP-DB"
        );
        assert_eq!(
            std::fs::read_to_string(tmp.join("euclide-data.json")).unwrap(),
            r#"{"dataDir":"Euclide-Data"}"#
        );
        assert_eq!(
            std::fs::read(tmp.join("mes-cours.pdf")).unwrap(),
            b"KEEP-PDF"
        );
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
        assert_eq!(
            std::fs::read(tmp.join("euclide.exe")).unwrap(),
            b"WRAPPED-EXE"
        );
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
        let err =
            verify_update_signature(b"hello", "not-valid-signature", &updater_pubkey().unwrap())
                .unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn pubkey_in_tauri_conf_is_present() {
        updater_pubkey().expect("pubkey in tauri.conf.json");
    }

    #[test]
    fn overlay_reads_deflate_zip() {
        let tmp =
            std::env::temp_dir().join(format!("euclide-overlay-deflate-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("keep.txt"), b"KEEP").unwrap();

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zw = zip::ZipWriter::new(&mut cursor);
            let opts =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zw.start_file("euclide.exe", opts).unwrap();
            zw.write_all(b"DEFLATED-EXE").unwrap();
            zw.finish().unwrap();
        }
        extract_allowed_overlay(&cursor.into_inner(), &tmp).unwrap();
        assert_eq!(
            std::fs::read(tmp.join("euclide.exe")).unwrap(),
            b"DEFLATED-EXE"
        );
        assert_eq!(std::fs::read(tmp.join("keep.txt")).unwrap(), b"KEEP");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn overlay_accepts_windows_backslash_zip_paths() {
        let tmp = std::env::temp_dir().join(format!("euclide-overlay-bs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join("keep.bin"), b"KEEP").unwrap();
        let zip = zip_with(&[
            ("euclide.exe", b"EXE"),
            ("euclide-sidecar\\internal\\mod.pyd", b"PYD"),
        ]);
        extract_allowed_overlay(&zip, &tmp).unwrap();
        assert_eq!(std::fs::read(tmp.join("euclide.exe")).unwrap(), b"EXE");
        assert_eq!(
            std::fs::read(tmp.join("euclide-sidecar/internal/mod.pyd")).unwrap(),
            b"PYD"
        );
        assert_eq!(std::fs::read(tmp.join("keep.bin")).unwrap(), b"KEEP");
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn leftover_name_matches_unique_sibling() {
        assert!(is_update_leftover_name("euclide.exe.euclide-old-12-99"));
        assert!(is_update_leftover_name("euclide.exe.euclide-new-12-99"));
        assert!(is_update_leftover_name(
            "README.txt.euclide-old-7964-506436300"
        ));
        assert!(is_update_leftover_name(
            "euclide.portable.euclide-old-7964-503352900"
        ));
        assert!(!is_update_leftover_name("euclide.exe"));
        assert!(!is_update_leftover_name("euclide.db"));
    }

    #[test]
    fn cleanup_helper_only_deletes_renamed_leftovers() {
        assert!(CLEANUP_HELPER_PS1.contains("Get-Process -Id $AppPid"));
        assert!(CLEANUP_HELPER_PS1.contains("*.euclide-old*"));
        assert!(
            CLEANUP_HELPER_PS1.contains("IsReadOnly"),
            "Windows leftovers from a zip are often read-only; -Force alone is not enough"
        );
        assert!(
            !CLEANUP_HELPER_PS1
                .lines()
                .any(|l| !l.trim().starts_with('#') && l.contains("Start-Process")),
            "must not auto-start Euclide"
        );
        assert!(!CLEANUP_HELPER_PS1.lines().any(|l| {
            let t = l.trim();
            !t.starts_with('#') && t.to_ascii_lowercase().contains("copy-item")
        }));
    }

    #[test]
    fn purge_removes_readonly_leftovers() {
        let tmp = std::env::temp_dir().join(format!("euclide-purge-ro-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let leftover = tmp.join("README.txt.euclide-old-7964-506436300");
        std::fs::write(&leftover, b"OLD").unwrap();
        let mut perms = std::fs::metadata(&leftover).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&leftover, perms).unwrap();
        assert_eq!(purge_update_leftovers(&tmp), 1);
        assert!(
            !leftover.exists(),
            "read-only leftover must be deleted on the next launch"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn replace_locked_file_moves_old_aside_and_writes_new() {
        let tmp = std::env::temp_dir().join(format!("euclide-replace-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("Euclide-Data")).unwrap();
        std::fs::write(tmp.join("Euclide-Data/euclide.db"), b"KEEP-DB").unwrap();
        std::fs::write(tmp.join("euclide.exe"), b"OLD-EXE").unwrap();
        std::fs::create_dir_all(tmp.join("euclide-sidecar")).unwrap();
        std::fs::write(tmp.join("euclide-sidecar/run.exe"), b"OLD-SC").unwrap();

        let stage = tmp.join("stage");
        std::fs::create_dir_all(stage.join("euclide-sidecar")).unwrap();
        std::fs::write(stage.join("euclide.exe"), b"NEW-EXE").unwrap();
        std::fs::write(stage.join("euclide-sidecar/run.exe"), b"NEW-SC").unwrap();
        std::fs::write(stage.join("euclide.portable"), b"").unwrap();

        apply_staging_overlay(&stage, &tmp).unwrap();
        assert_eq!(std::fs::read(tmp.join("euclide.exe")).unwrap(), b"NEW-EXE");
        let leftovers: Vec<_> = std::fs::read_dir(&tmp)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| is_update_leftover_name(n))
            .collect();
        assert!(
            leftovers.is_empty(),
            "old exe must be deleted, leftover={leftovers:?}"
        );
        assert_eq!(
            std::fs::read(tmp.join("euclide-sidecar/run.exe")).unwrap(),
            b"NEW-SC"
        );
        assert_eq!(
            std::fs::read(tmp.join("Euclide-Data/euclide.db")).unwrap(),
            b"KEEP-DB"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn purge_removes_leftovers_and_skips_data_dir() {
        let tmp = std::env::temp_dir().join(format!("euclide-purge-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("Euclide-Data")).unwrap();
        std::fs::create_dir_all(tmp.join("euclide-sidecar/internal")).unwrap();
        std::fs::write(tmp.join("euclide.exe"), b"LIVE").unwrap();
        std::fs::write(tmp.join("euclide.exe.euclide-old-1-2"), b"OLD").unwrap();
        std::fs::write(tmp.join("euclide-sidecar/run.exe.euclide-new-3-4"), b"TMP").unwrap();
        std::fs::write(tmp.join("Euclide-Data/keep.euclide-old-x"), b"KEEP").unwrap();
        assert_eq!(purge_update_leftovers(&tmp), 2);
        assert!(tmp.join("euclide.exe").is_file());
        assert!(!tmp.join("euclide.exe.euclide-old-1-2").exists());
        assert!(!tmp.join("euclide-sidecar/run.exe.euclide-new-3-4").exists());
        assert_eq!(
            std::fs::read(tmp.join("Euclide-Data/keep.euclide-old-x")).unwrap(),
            b"KEEP"
        );
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
