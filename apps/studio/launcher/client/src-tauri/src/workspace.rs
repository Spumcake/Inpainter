use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::cli;
use crate::home::{AppHome, WorkspaceRecord};

pub const LOCAL_WORKSPACE_ID: &str = "local";

#[derive(Clone, Debug, Serialize)]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub status: String,
    pub modified: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ToolRecord {
    pub id: String,
    pub label: String,
    pub path: String,
}

pub fn list_workspaces() -> Result<Vec<WorkspaceRecord>, String> {
    let payload = cli::run(&["workspace", "list"])?;
    let workspaces = payload
        .get("workspaces")
        .and_then(|value| value.as_array())
        .ok_or_else(|| "core workspace list did not return workspaces".to_string())?;
    workspaces.iter().map(workspace_record_from_value).collect()
}

pub fn is_local_workspace(record: &WorkspaceRecord) -> bool {
    if record.id == LOCAL_WORKSPACE_ID {
        return true;
    }
    AppHome::resolve()
        .map(|home| same_path(&record.path, &home.local_workspace_dir()))
        .unwrap_or(false)
}

pub fn find_workspace(workspace_id: &str) -> Result<WorkspaceRecord, String> {
    list_workspaces()?
        .into_iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| "That workspace is not in the launcher.".to_string())
}

const AGENT_STATUS_IDLE: &str = "Idle";
const AGENT_META_FILE: &str = "agent.json";

#[derive(Deserialize, Serialize)]
struct AgentMeta {
    directory: String,
}

fn read_agent_directory(agent_dir: &Path, fallback: &str) -> String {
    let path = agent_dir.join(AGENT_META_FILE);
    let Ok(bytes) = fs::read(&path) else {
        return fallback.to_string();
    };
    serde_json::from_slice::<AgentMeta>(&bytes)
        .ok()
        .map(|meta| meta.directory)
        .filter(|directory| !directory.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

pub fn list_agents(workspace: &Path) -> Vec<AgentRecord> {
    let directory = workspace.display().to_string();
    let agents = workspace.join(".inpainter").join("agents");
    let Ok(entries) = fs::read_dir(&agents) else {
        return Vec::new();
    };
    let mut records: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            !name.starts_with('.') && entry.path().is_dir()
        })
        .map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            AgentRecord {
                id: name.clone(),
                name,
                directory: read_agent_directory(&path, &directory),
                status: AGENT_STATUS_IDLE.to_string(),
                modified: timestamp_modified(&path).unwrap_or_else(timestamp_now),
            }
        })
        .collect();
    records.sort_by(|left, right| right.modified.cmp(&left.modified).then(left.name.cmp(&right.name)));
    records
}

#[derive(Deserialize)]
struct ToolFileMeta {
    #[serde(default)]
    label: Option<String>,
}

pub fn list_tools(workspace: &Path) -> Vec<ToolRecord> {
    let tools = workspace.join(".inpainter").join("tools");
    let Ok(entries) = fs::read_dir(&tools) else {
        return Vec::new();
    };
    let mut records: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            !name.starts_with('.') && name.ends_with(".tool.json") && entry.path().is_file()
        })
        .filter_map(|entry| {
            let path = entry.path();
            let id = entry.file_name().to_string_lossy().into_owned();
            let stem = id
                .strip_suffix(".tool.json")
                .unwrap_or(id.as_str())
                .to_string();
            let body = fs::read_to_string(&path).ok()?;
            let meta: ToolFileMeta = serde_json::from_str(&body).ok()?;
            let label = meta
                .label
                .filter(|label| !label.trim().is_empty())
                .unwrap_or(stem);
            Some(ToolRecord {
                id,
                label,
                path: path.display().to_string(),
            })
        })
        .collect();
    records.sort_by(|left, right| left.id.cmp(&right.id));
    records
}

#[tauri::command]
pub fn get_user_home() -> Result<String, String> {
    dirs::home_dir()
        .map(|path| path.display().to_string())
        .ok_or_else(|| "could not resolve home directory".to_string())
}

#[tauri::command]
pub fn get_workspaces_dir() -> Result<String, String> {
    let path = AppHome::resolve()?.workspaces_dir();
    fs::create_dir_all(&path)
        .map_err(|err| format!("failed to create {}: {err}", path.display()))?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn reveal_folder(path: String) -> Result<(), String> {
    let folder = PathBuf::from(path.trim());
    if !folder.is_dir() {
        return Err(format!(
            "Folder does not exist or is not a directory: {}",
            folder.display()
        ));
    }
    let mut command = if cfg!(target_os = "windows") {
        Command::new("explorer")
    } else if cfg!(target_os = "macos") {
        Command::new("open")
    } else {
        Command::new("xdg-open")
    };
    command
        .arg(&folder)
        .spawn()
        .map_err(|err| format!("failed to open {}: {err}", folder.display()))?;
    Ok(())
}

const MAX_PREVIEW_BYTES: usize = 256 * 1024;

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let requested = PathBuf::from(path.trim());
    let canonical = requested
        .canonicalize()
        .map_err(|err| format!("failed to open {}: {err}", requested.display()))?;
    if !canonical.is_file() {
        return Err(format!("Not a file: {}", canonical.display()));
    }
    ensure_inside_known_workspace(&canonical)?;
    let bytes = fs::read(&canonical)
        .map_err(|err| format!("failed to read {}: {err}", canonical.display()))?;
    if bytes.len() > MAX_PREVIEW_BYTES {
        return Err("File is too large to preview.".to_string());
    }
    String::from_utf8(bytes).map_err(|_| format!("{} is not valid UTF-8.", canonical.display()))
}

fn ensure_inside_known_workspace(path: &Path) -> Result<(), String> {
    for workspace in list_workspaces()? {
        let Ok(root) = PathBuf::from(&workspace.path).canonicalize() else {
            continue;
        };
        if path.starts_with(&root) {
            return Ok(());
        }
    }
    Err("That file is not inside a workspace.".to_string())
}

#[tauri::command]
pub fn create_workspace(name: String, location: String) -> Result<WorkspaceRecord, String> {
    workspace_record_from_value(&cli::run(&[
        "workspace",
        "create",
        "--name",
        name.trim(),
        "--location",
        location.trim(),
    ])?)
}

#[tauri::command]
pub fn add_workspace(path: String) -> Result<WorkspaceRecord, String> {
    workspace_record_from_value(&cli::run(&["workspace", "add", "--path", path.trim()])?)
}

#[tauri::command]
pub fn remove_workspace(id: String) -> Result<(), String> {
    cli::run(&["workspace", "remove", "--id", id.trim()])?;
    Ok(())
}

#[tauri::command]
pub fn create_agent(workspace_id: String, directory: Option<String>) -> Result<AgentRecord, String> {
    let workspace_id = workspace_id.trim().to_string();
    let directory = directory
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let payload = if let Some(directory) = directory.as_deref() {
        cli::run(&[
            "agent",
            "create",
            "--workspace-id",
            &workspace_id,
            "--directory",
            directory,
        ])?
    } else {
        cli::run(&["agent", "create", "--workspace-id", &workspace_id])?
    };
    Ok(AgentRecord {
        id: json_string(&payload, "id")?,
        name: json_string(&payload, "name")?,
        directory: json_string(&payload, "directory")?,
        status: json_string(&payload, "status")?,
        modified: json_string(&payload, "modified")?,
    })
}

fn json_string(value: &serde_json::Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(|item| item.as_str())
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("core returned an invalid agent {key}"))
}

fn workspace_record_from_value(value: &serde_json::Value) -> Result<WorkspaceRecord, String> {
    let id = value
        .get("id")
        .and_then(|item| item.as_str())
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "core returned an invalid workspace id".to_string())?;
    let name = value
        .get("name")
        .and_then(|item| item.as_str())
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "core returned an invalid workspace name".to_string())?;
    let path = value
        .get("path")
        .and_then(|item| item.as_str())
        .filter(|item| !item.is_empty())
        .ok_or_else(|| "core returned an invalid workspace path".to_string())?;
    Ok(WorkspaceRecord {
        id: id.to_string(),
        name: name.to_string(),
        path: path.to_string(),
    })
}

fn timestamp_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn timestamp_modified(path: &Path) -> Option<String> {
    let time = fs::metadata(path).ok()?.modified().ok()?;
    Some(
        chrono::DateTime::<chrono::Utc>::from(time)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    )
}

fn same_path(stored: &str, candidate: &Path) -> bool {
    let stored_path = PathBuf::from(stored);
    match (stored_path.canonicalize(), candidate.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => stored_path == candidate,
    }
}
