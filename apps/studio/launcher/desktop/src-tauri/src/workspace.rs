use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::home::{self, AppHome, WorkspaceRecord};

pub fn known_workspaces() -> Result<Vec<WorkspaceRecord>, String> {
    Ok(home::load_launcher_registry()?.workspaces)
}

#[tauri::command]
pub fn get_user_home() -> Result<String, String> {
    dirs::home_dir()
        .map(|path| path.display().to_string())
        .ok_or_else(|| "could not resolve home directory".to_string())
}

#[tauri::command]
pub fn create_workspace(
    name: String,
    location: String,
    folder_name: String,
) -> Result<WorkspaceRecord, String> {
    let name = name.trim();
    let folder_name = folder_name.trim();
    if name.is_empty() {
        return Err("Workspace name is required.".to_string());
    }
    validate_folder_name(folder_name)?;

    let location = PathBuf::from(location.trim());
    if !location.is_dir() {
        return Err(format!(
            "Location does not exist or is not a folder: {}",
            location.display()
        ));
    }

    let dest = location.join(folder_name);
    prepare_destination(&dest)?;

    let home = AppHome::resolve()?;
    let startup = home.startup_dir();
    if !startup.is_dir() {
        return Err(format!(
            "startup template is missing: {}",
            startup.display()
        ));
    }
    home::copy_dir_all(&startup, &dest)?;

    register_workspace(name.to_string(), dest)
}

#[tauri::command]
pub fn import_workspace(path: String) -> Result<WorkspaceRecord, String> {
    let selected = PathBuf::from(path.trim());
    if !selected.is_dir() {
        return Err(format!(
            "Location does not exist or is not a folder: {}",
            selected.display()
        ));
    }
    let canonical = selected.canonicalize().unwrap_or(selected);

    let home = AppHome::resolve()?;
    let startup = home.startup_dir();
    if !startup.is_dir() {
        return Err(format!(
            "startup template is missing: {}",
            startup.display()
        ));
    }
    ensure_looks_like_workspace(&canonical, &startup)?;

    let registry = home::load_launcher_registry()?;
    if registry
        .workspaces
        .iter()
        .any(|workspace| same_path(&workspace.path, &canonical))
    {
        return Err(format!(
            "This workspace is already in the launcher: {}",
            canonical.display()
        ));
    }

    let name = canonical
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Could not determine a workspace name from that folder.".to_string())?;

    register_workspace(name, canonical)
}

#[tauri::command]
pub fn remove_workspace(id: String) -> Result<(), String> {
    let mut registry = home::load_launcher_registry()?;
    let before = registry.workspaces.len();
    registry.workspaces.retain(|workspace| workspace.id != id);
    if registry.workspaces.len() == before {
        return Err("That workspace is not in the launcher.".to_string());
    }
    home::save_launcher_registry(&registry)
}

fn register_workspace(name: String, path: PathBuf) -> Result<WorkspaceRecord, String> {
    let record = WorkspaceRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path: path.display().to_string(),
    };
    let mut registry = home::load_launcher_registry()?;
    registry.workspaces.push(record.clone());
    home::save_launcher_registry(&registry)?;
    Ok(record)
}

fn startup_entry_names(startup: &Path) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(startup)
        .map_err(|err| format!("failed to read {}: {err}", startup.display()))?;
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("failed to read {}: {err}", startup.display()))?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    Ok(names)
}

fn ensure_looks_like_workspace(path: &Path, startup: &Path) -> Result<(), String> {
    let required = startup_entry_names(startup)?;
    if required.is_empty() {
        return Ok(());
    }
    let entries = fs::read_dir(path)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    let present: HashSet<String> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    let missing: Vec<&String> = required
        .iter()
        .filter(|name| !present.contains(*name))
        .collect();
    if missing.is_empty() {
        return Ok(());
    }
    Err(format!(
        "This folder doesn't look like an Inpainter workspace (missing: {}).",
        missing
            .iter()
            .map(|name| name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn same_path(stored: &str, candidate: &Path) -> bool {
    let stored_path = PathBuf::from(stored);
    match (stored_path.canonicalize(), candidate.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => stored_path == candidate,
    }
}

fn validate_folder_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Workspace folder name is required.".to_string());
    }
    if name == "." || name == ".." {
        return Err("Workspace folder name is invalid.".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("Workspace folder name must be a single folder, not a path.".to_string());
    }
    Ok(())
}

fn prepare_destination(dest: &Path) -> Result<(), String> {
    if !dest.exists() {
        fs::create_dir_all(dest)
            .map_err(|err| format!("failed to create {}: {err}", dest.display()))?;
        return Ok(());
    }
    if !dest.is_dir() {
        return Err(format!(
            "Destination exists and is not a folder: {}",
            dest.display()
        ));
    }
    let mut entries = fs::read_dir(dest)
        .map_err(|err| format!("failed to read {}: {err}", dest.display()))?;
    if entries.next().is_some() {
        return Err(format!(
            "Folder already exists and is not empty: {}",
            dest.display()
        ));
    }
    Ok(())
}
