use std::fs;
use std::io::Write;
use std::path::PathBuf;

use crate::model::Settings;

pub fn echo_dir() -> PathBuf {
    std::env::var_os("ECHO_HOME")
        .or_else(|| std::env::var_os("HEARBACK_HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".echo"))
}

pub fn legacy_dir() -> PathBuf {
    home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hearback")
}

pub fn response_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Some(explicit) = std::env::var_os("ECHO_RESPONSE_FILE")
        .or_else(|| std::env::var_os("HEARBACK_RESPONSE_FILE"))
    {
        files.push(PathBuf::from(explicit));
    }
    files.push(echo_dir().join("responses.jsonl"));
    let legacy = legacy_dir().join("responses.jsonl");
    if !files.contains(&legacy) {
        files.push(legacy);
    }
    files
}

pub fn settings_path() -> PathBuf {
    echo_dir().join("settings.json")
}

pub fn key_path() -> PathBuf {
    echo_dir().join("cursor-api-key")
}

pub fn delivered_path() -> PathBuf {
    echo_dir().join("delivered-runs.json")
}

pub fn ensure_dir() -> std::io::Result<()> {
    fs::create_dir_all(echo_dir())
}

pub fn load_settings() -> Settings {
    let raw = fs::read_to_string(settings_path())
        .ok()
        .or_else(|| fs::read_to_string(legacy_dir().join("settings.json")).ok());
    raw.and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: &Settings) {
    let _ = ensure_dir();
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = atomic_write(settings_path(), json.as_bytes(), 0o600);
    }
}

pub fn load_api_key() -> Option<String> {
    let candidates = [key_path(), legacy_dir().join("cursor-api-key")];
    for path in candidates {
        if let Ok(key) = fs::read_to_string(path) {
            let key = key.trim().to_string();
            if !key.is_empty() {
                return Some(key);
            }
        }
    }
    None
}

pub fn save_api_key(key: &str) -> std::io::Result<()> {
    ensure_dir()?;
    atomic_write(key_path(), key.trim().as_bytes(), 0o600)
}

pub fn clear_api_key() {
    let _ = fs::remove_file(key_path());
}

pub fn load_delivered() -> Vec<String> {
    fs::read_to_string(delivered_path())
        .ok()
        .or_else(|| fs::read_to_string(legacy_dir().join("delivered-runs.json")).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save_delivered(ids: &[String]) {
    let _ = ensure_dir();
    if let Ok(json) = serde_json::to_string(ids) {
        let _ = atomic_write(delivered_path(), json.as_bytes(), 0o600);
    }
}

fn atomic_write(path: PathBuf, bytes: &[u8], mode: u32) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(mode));
    }
    fs::rename(tmp, path)
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}
