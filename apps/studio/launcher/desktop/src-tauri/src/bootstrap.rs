use std::fs;
use std::path::{Path, PathBuf};

use crate::home::{self, AppHome, SettingsFieldRecord};

/// Recreates the application home directory from the repo `bootstrap/` folder.
/// Overwrites launcher.json, settings.json, installs/, and startup/ each boot.
pub fn recreate_on_boot() -> Result<AppHome, String> {
    let home = AppHome::resolve()?;
    let source = bootstrap_source_dir()?;

    fs::create_dir_all(home.root())
        .map_err(|err| format!("failed to create {}: {err}", home.root().display()))?;

    copy_file(
        &source.join("launcher.json"),
        &home.launcher_registry_path(),
    )?;
    copy_file(&source.join("settings.json"), &home.settings_path())?;
    replace_dir(&source.join("installs"), &home.installs_dir())?;
    replace_dir(&source.join("startup"), &home.startup_dir())?;

    if !home.startup_dir().is_dir() {
        return Err(format!(
            "bootstrap did not produce a startup folder at {}",
            home.startup_dir().display()
        ));
    }

    for directory in home.runtime_directories() {
        fs::create_dir_all(&directory)
            .map_err(|err| format!("failed to create {}: {err}", directory.display()))?;
    }

    rewrite_settings_paths(&home)?;

    eprintln!(
        "[inpainter] bootstrapped application home at {}",
        home.root().display()
    );
    Ok(home)
}

fn bootstrap_source_dir() -> Result<PathBuf, String> {
    let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../../bootstrap");
    let source = candidate.canonicalize().map_err(|err| {
        format!(
            "could not find bootstrap folder at {}. ({err})",
            candidate.display()
        )
    })?;
    if !source.is_dir() {
        return Err(format!("bootstrap source is missing: {}", source.display()));
    }
    Ok(source)
}

fn copy_file(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.is_file() {
        return Err(format!("bootstrap file is missing: {}", src.display()));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create {}: {err}", parent.display()))?;
    }
    fs::copy(src, dst).map_err(|err| {
        format!(
            "failed to copy {} to {}: {err}",
            src.display(),
            dst.display()
        )
    })?;
    Ok(())
}

fn replace_dir(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Err(format!("bootstrap folder is missing: {}", src.display()));
    }
    if dst.exists() {
        fs::remove_dir_all(dst)
            .map_err(|err| format!("failed to replace {}: {err}", dst.display()))?;
    }
    home::copy_dir_all(src, dst)
}

fn rewrite_settings_paths(home: &AppHome) -> Result<(), String> {
    let mut settings = home::load_machine_settings()?;
    for panel in &mut settings.panels {
        for field in &mut panel.fields {
            if let SettingsFieldRecord::Path { id, value, .. } = field {
                match id.as_str() {
                    "installsLocation" => *value = home.installs_dir().display().to_string(),
                    "downloadsLocation" => *value = home.downloads_dir().display().to_string(),
                    _ => {}
                }
            }
        }
    }
    home::save_machine_settings(&settings)
}
