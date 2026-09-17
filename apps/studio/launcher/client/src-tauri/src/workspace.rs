use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::home::{self, AppHome, LauncherRegistry, WorkspaceRecord};

pub const LOCAL_WORKSPACE_ID: &str = "local";
const STRUCTURE_FILE: &str = "structure.json";

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
    let local = ensure_local_workspace()?;
    let mut registry = home::load_launcher_registry()?;
    let mut changed = false;
    for record in &mut registry.workspaces {
        let refreshed = refresh_listed_workspace(record.clone());
        if refreshed.id != record.id || refreshed.name != record.name {
            *record = refreshed;
            changed = true;
        }
    }
    if changed {
        home::save_launcher_registry(&registry)?;
    }
    let mut workspaces = vec![local.clone()];
    for record in registry.workspaces {
        if record.id == LOCAL_WORKSPACE_ID || same_path(&record.path, Path::new(&local.path)) {
            continue;
        }
        workspaces.push(record);
    }
    Ok(workspaces)
}

pub fn ensure_local_workspace() -> Result<WorkspaceRecord, String> {
    let home = AppHome::resolve()?;
    initialize_workspace(
        &home.local_workspace_dir(),
        &home.defaults_dir(),
        Some(WorkspaceManifest::new(
            LOCAL_WORKSPACE_ID.to_string(),
            "Local".to_string(),
            "local".to_string(),
        )),
    )
}

pub fn is_local_workspace(record: &WorkspaceRecord) -> bool {
    if record.id == LOCAL_WORKSPACE_ID {
        return true;
    }
    AppHome::resolve()
        .map(|home| same_path(&record.path, &home.local_workspace_dir()))
        .unwrap_or(false)
}

fn refresh_listed_workspace(record: WorkspaceRecord) -> WorkspaceRecord {
    match read_manifest(Path::new(&record.path)) {
        Ok(Some(manifest)) => WorkspaceRecord {
            id: manifest.id,
            name: manifest.name,
            path: record.path,
        },
        _ => record,
    }
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

fn write_agent_directory(agent_dir: &Path, directory: &str) -> Result<(), String> {
    let path = agent_dir.join(AGENT_META_FILE);
    let body = serde_json::to_vec_pretty(&AgentMeta {
        directory: directory.to_string(),
    })
    .map_err(|err| format!("failed to serialize {}: {err}", path.display()))?;
    fs::write(&path, body).map_err(|err| format!("failed to write {}: {err}", path.display()))
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
    let home = AppHome::resolve()?;
    let parent = resolve_create_location(&location)?;
    let record = create_workspace_folder(name.trim(), &parent, &home.defaults_dir())?;
    register_workspace(record.clone())?;
    Ok(record)
}

fn resolve_create_location(location: &str) -> Result<PathBuf, String> {
    let trimmed = location.trim();
    if trimmed.is_empty() {
        return Ok(AppHome::resolve()?.workspaces_dir());
    }
    Ok(PathBuf::from(trimmed))
}

fn create_workspace_folder(
    name: &str,
    location: &Path,
    defaults: &Path,
) -> Result<WorkspaceRecord, String> {
    if name.is_empty() {
        return Err("Workspace name is required.".to_string());
    }
    fs::create_dir_all(location).map_err(|err| {
        format!("failed to create {}: {err}", location.display())
    })?;
    if !location.is_dir() {
        return Err(format!(
            "Location does not exist or is not a folder: {}",
            location.display()
        ));
    }

    let folder_name = slugify(name);
    validate_folder_name(&folder_name)?;
    let dest = location.join(&folder_name);
    if dest.exists() {
        return Err(format!(
            "A workspace folder named {folder_name} already exists in this location."
        ));
    }
    initialize_workspace(
        &dest,
        defaults,
        Some(WorkspaceManifest::new(
            uuid::Uuid::new_v4().to_string(),
            name.to_string(),
            folder_name,
        )),
    )
}

#[tauri::command]
pub fn add_workspace(path: String) -> Result<WorkspaceRecord, String> {
    let home = AppHome::resolve()?;
    let selected = PathBuf::from(path.trim());
    if !selected.is_dir() {
        return Err(format!(
            "Location does not exist or is not a folder: {}",
            selected.display()
        ));
    }
    let canonical = selected.canonicalize().unwrap_or(selected);
    if same_path(&home.local_workspace_dir().display().to_string(), &canonical) {
        return Err("That folder is already the Local workspace.".to_string());
    }
    let record = initialize_workspace(&canonical, &home.defaults_dir(), None)?;
    register_workspace(record.clone())?;
    Ok(record)
}

fn initialize_workspace(
    path: &Path,
    defaults: &Path,
    new_identity: Option<WorkspaceManifest>,
) -> Result<WorkspaceRecord, String> {
    fs::create_dir_all(path).map_err(|err| format!("failed to create {}: {err}", path.display()))?;
    if !path.is_dir() {
        return Err(format!(
            "Location does not exist or is not a folder: {}",
            path.display()
        ));
    }
    if read_manifest(path)?.is_none() {
        let manifest = match new_identity {
            Some(manifest) => manifest,
            None => {
                let name = path
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .filter(|name| !name.is_empty())
                    .ok_or_else(|| {
                        "Could not determine a workspace name from that folder.".to_string()
                    })?;
                let slug = slugify(&name);
                validate_folder_name(&slug)?;
                WorkspaceManifest::new(uuid::Uuid::new_v4().to_string(), name, slug)
            }
        };
        write_manifest(path, &manifest)?;
    }
    seed_defaults(path, defaults)?;
    let manifest = read_manifest(path)?.ok_or_else(|| {
        format!("failed to initialize workspace manifest in {}", path.display())
    })?;
    Ok(WorkspaceRecord {
        id: manifest.id,
        name: manifest.name,
        path: path.display().to_string(),
    })
}

fn seed_defaults(workspace: &Path, defaults: &Path) -> Result<(), String> {
    if !defaults.is_dir() {
        return Err(format!(
            "Workspace defaults folder is missing: {}",
            defaults.display()
        ));
    }
    copy_defaults(defaults, &workspace.join(".inpainter"))
}

fn copy_defaults(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest)
        .map_err(|err| format!("failed to create {}: {err}", dest.display()))?;
    for entry in fs::read_dir(src)
        .map_err(|err| format!("failed to read {}: {err}", src.display()))?
    {
        let entry = entry.map_err(|err| format!("failed to read {}: {err}", src.display()))?;
        let name = entry.file_name();
        if name == STRUCTURE_FILE || name == "workspace.json" {
            continue;
        }
        let dest_path = dest.join(&name);
        let kind = entry
            .file_type()
            .map_err(|err| format!("failed to inspect {}: {err}", entry.path().display()))?;
        if kind.is_dir() {
            copy_defaults(&entry.path(), &dest_path)?;
        } else if !dest_path.exists() {
            fs::copy(entry.path(), &dest_path).map_err(|err| {
                format!(
                    "failed to copy {} to {}: {err}",
                    entry.path().display(),
                    dest_path.display()
                )
            })?;
        }
    }
    Ok(())
}

fn register_workspace(record: WorkspaceRecord) -> Result<(), String> {
    let mut registry = home::load_launcher_registry()?;
    register_workspace_in(&mut registry, record)?;
    home::save_launcher_registry(&registry)
}

fn register_workspace_in(
    registry: &mut LauncherRegistry,
    record: WorkspaceRecord,
) -> Result<(), String> {
    if registry
        .workspaces
        .iter()
        .any(|workspace| same_path(&workspace.path, Path::new(&record.path)))
    {
        return Err(format!(
            "This folder is already a workspace tab: {}",
            record.path
        ));
    }
    if record.id == LOCAL_WORKSPACE_ID
        || registry
            .workspaces
            .iter()
            .any(|workspace| workspace.id == record.id)
    {
        return Err("A workspace with that identity is already in the launcher.".to_string());
    }
    registry.workspaces.push(record);
    Ok(())
}

#[tauri::command]
pub fn remove_workspace(id: String) -> Result<(), String> {
    if id == LOCAL_WORKSPACE_ID {
        return Err("The Local workspace cannot be removed.".to_string());
    }
    let mut registry = home::load_launcher_registry()?;
    let before = registry.workspaces.len();
    registry.workspaces.retain(|workspace| workspace.id != id);
    if registry.workspaces.len() == before {
        return Err("That workspace is not in the launcher.".to_string());
    }
    home::save_launcher_registry(&registry)
}

#[tauri::command]
pub fn create_agent(workspace_id: String, directory: Option<String>) -> Result<AgentRecord, String> {
    let workspace = find_workspace(&workspace_id)?;
    let agents = Path::new(&workspace.path).join(".inpainter").join("agents");
    fs::create_dir_all(&agents)
        .map_err(|err| format!("failed to create {}: {err}", agents.display()))?;
    let slug = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut dest = agents.join(&slug);
    let mut suffix = 1;
    while dest.exists() {
        dest = agents.join(format!("{slug}-{suffix}"));
        suffix += 1;
    }
    fs::create_dir_all(&dest).map_err(|err| format!("failed to create {}: {err}", dest.display()))?;
    let name = dest
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or(slug);
    let directory = directory
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| workspace.path.clone());
    write_agent_directory(&dest, &directory)?;
    Ok(AgentRecord {
        id: name.clone(),
        name,
        directory,
        status: AGENT_STATUS_IDLE.to_string(),
        modified: timestamp_now(),
    })
}

const MANIFEST_PATH: &str = ".inpainter/workspace.json";

#[derive(Debug, Deserialize, Serialize)]
struct WorkspaceManifest {
    id: String,
    name: String,
    slug: String,
    created: String,
    modified: String,
    inpainter: String,
}

impl WorkspaceManifest {
    fn new(id: String, name: String, slug: String) -> Self {
        let now = timestamp_now();
        Self {
            id,
            name,
            slug,
            created: now.clone(),
            modified: now,
            inpainter: WORKSPACE_INPAINTER.to_string(),
        }
    }
}

fn timestamp_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn timestamp_from_file(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    let time = metadata.created().ok().or_else(|| metadata.modified().ok())?;
    Some(
        chrono::DateTime::<chrono::Utc>::from(time)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    )
}

fn timestamp_modified(path: &Path) -> Option<String> {
    let time = fs::metadata(path).ok()?.modified().ok()?;
    Some(
        chrono::DateTime::<chrono::Utc>::from(time)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    )
}

fn json_string(obj: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    obj.get(key)?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn core_keys_in_order(obj: &serde_json::Map<String, serde_json::Value>) -> bool {
    let present: Vec<&str> = obj
        .keys()
        .filter(|key| MANIFEST_KEY_ORDER.contains(&key.as_str()))
        .map(String::as_str)
        .collect();
    let expected: Vec<&str> = MANIFEST_KEY_ORDER
        .iter()
        .copied()
        .filter(|key| obj.contains_key(*key))
        .collect();
    present == expected
}

const MANIFEST_KEY_ORDER: [&str; 6] = ["id", "name", "slug", "created", "modified", "inpainter"];
const MANIFEST_RESERVED_KEYS: [&str; 8] = [
    "id",
    "name",
    "slug",
    "created",
    "modified",
    "inpainter",
    "version",
    "schema_version",
];
const WORKSPACE_INPAINTER: &str = "pre-alpha";

fn manifest_document(
    manifest: &WorkspaceManifest,
    extra: Option<&serde_json::Map<String, serde_json::Value>>,
) -> serde_json::Value {
    let mut out = serde_json::Map::new();
    out.insert("id".into(), serde_json::Value::String(manifest.id.clone()));
    out.insert("name".into(), serde_json::Value::String(manifest.name.clone()));
    out.insert("slug".into(), serde_json::Value::String(manifest.slug.clone()));
    out.insert(
        "created".into(),
        serde_json::Value::String(manifest.created.clone()),
    );
    out.insert(
        "modified".into(),
        serde_json::Value::String(manifest.modified.clone()),
    );
    out.insert(
        "inpainter".into(),
        serde_json::Value::String(manifest.inpainter.clone()),
    );
    if let Some(extra) = extra {
        for (key, value) in extra {
            if MANIFEST_RESERVED_KEYS.contains(&key.as_str()) {
                continue;
            }
            out.insert(key.clone(), value.clone());
        }
    }
    serde_json::Value::Object(out)
}

fn encode_manifest(
    manifest: &WorkspaceManifest,
    extra: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(&manifest_document(manifest, extra)).map_err(|err| err.to_string())
}

fn read_manifest(workspace: &Path) -> Result<Option<WorkspaceManifest>, String> {
    let path = workspace.join(MANIFEST_PATH);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("failed to read {}: {err}", path.display())),
    };
    let mut value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|err| format!("invalid workspace manifest {}: {err}", path.display()))?;
    let obj = value.as_object_mut().ok_or_else(|| {
        format!(
            "Unsupported or incomplete workspace manifest: {}",
            path.display()
        )
    })?;
    let name = json_string(obj, "name").ok_or_else(|| {
        format!(
            "Unsupported or incomplete workspace manifest: {}",
            path.display()
        )
    })?;
    let folder_slug = workspace
        .file_name()
        .map(|name| slugify(&name.to_string_lossy()))
        .unwrap_or_else(|| slugify(&name));
    let id = json_string(obj, "id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let slug = json_string(obj, "slug").unwrap_or(folder_slug);
    if let Err(err) = validate_folder_name(&slug) {
        return Err(format!("{}: {err}", path.display()));
    }
    let created = json_string(obj, "created")
        .or_else(|| timestamp_from_file(&path))
        .unwrap_or_else(timestamp_now);
    let modified = json_string(obj, "modified").unwrap_or_else(timestamp_now);
    let inpainter = json_string(obj, "inpainter")
        .or_else(|| json_string(obj, "version"))
        .unwrap_or_else(|| WORKSPACE_INPAINTER.to_string());
    let manifest = WorkspaceManifest {
        id,
        name,
        slug,
        created,
        modified,
        inpainter,
    };
    let needs_rewrite = ["id", "slug", "created", "modified", "inpainter"]
        .into_iter()
        .any(|key| json_string(obj, key).is_none())
        || obj.contains_key("schema_version")
        || obj.contains_key("version")
        || !core_keys_in_order(obj);
    if needs_rewrite {
        replace_manifest(workspace, &manifest, Some(obj))?;
    }
    Ok(Some(manifest))
}

fn write_manifest(workspace: &Path, manifest: &WorkspaceManifest) -> Result<(), String> {
    let path = workspace.join(MANIFEST_PATH);
    let parent = path.parent().unwrap();
    fs::create_dir_all(parent)
        .map_err(|err| format!("failed to create {}: {err}", parent.display()))?;
    let bytes = encode_manifest(manifest, None)?;
    let temporary = parent.join(format!(".workspace-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::hard_link(&temporary, &path)?;
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    result.map_err(|err| format!("failed to create {}: {err}", path.display()))
}

fn replace_manifest(
    workspace: &Path,
    manifest: &WorkspaceManifest,
    extra: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Result<(), String> {
    let path = workspace.join(MANIFEST_PATH);
    let parent = path.parent().ok_or_else(|| {
        format!("failed to replace {}: missing parent", path.display())
    })?;
    fs::create_dir_all(parent)
        .map_err(|err| format!("failed to create {}: {err}", parent.display()))?;
    let bytes = encode_manifest(manifest, extra)?;
    let temporary = parent.join(format!(".workspace-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        fs::write(&temporary, &bytes)?;
        fs::rename(&temporary, &path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(|err| format!("failed to update {}: {err}", path.display()))
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut dash = false;
    for ch in name.chars() {
        if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                slug.push(lower);
            }
            dash = false;
        } else if !slug.is_empty() && !dash {
            slug.push('-');
            dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "workspace".to_string()
    } else {
        slug
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDir(PathBuf);
    impl TestDir {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("inpainter-workspace-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn metadata_travels_with_workspace_and_preserves_legacy_identity() {
        let root = TestDir::new();
        let original = root.0.join("original");
        let moved = root.0.join("renamed-folder");
        let manifest =
            WorkspaceManifest::new("existing-registry-id".into(), "My Production".into(), "my-production".into());
        write_manifest(&original, &manifest).unwrap();
        fs::rename(&original, &moved).unwrap();
        let loaded = read_manifest(&moved).unwrap().unwrap();
        assert_eq!(loaded.id, manifest.id);
        assert_eq!(loaded.slug, "my-production");
        assert_eq!(loaded.name, "My Production");
    }

    #[test]
    fn existing_metadata_is_never_overwritten() {
        let root = TestDir::new();
        let original = WorkspaceManifest::new("original".into(), "Original Name".into(), "original-name".into());
        write_manifest(&root.0, &original).unwrap();
        let replacement = WorkspaceManifest::new("replacement".into(), "Replacement".into(), "replacement".into());
        assert!(write_manifest(&root.0, &replacement).is_err());
        assert_eq!(
            read_manifest(&root.0).unwrap().unwrap().name,
            "Original Name"
        );
    }

    #[test]
    fn malformed_and_future_manifests_are_errors_not_missing_metadata() {
        let root = TestDir::new();
        assert!(read_manifest(&root.0).unwrap().is_none());
        fs::create_dir_all(root.0.join(".inpainter")).unwrap();
        for content in ["invalid json", r#"{"name":""}"#, r#"{"slug":"name"}"#] {
            fs::write(root.0.join(MANIFEST_PATH), content).unwrap();
            assert!(read_manifest(&root.0).is_err());
        }
    }

    #[test]
    fn legacy_manifests_are_rewritten_with_a_slug() {
        let root = TestDir::new();
        fs::create_dir_all(root.0.join(".inpainter")).unwrap();
        fs::write(
            root.0.join(MANIFEST_PATH),
            r#"{"schema_version":1,"id":"old-id","name":"My Production"}"#,
        )
        .unwrap();
        let loaded = read_manifest(&root.0).unwrap().unwrap();
        assert_eq!(loaded.id, "old-id");
        assert_eq!(loaded.name, "My Production");
        assert_eq!(
            loaded.slug,
            slugify(&root.0.file_name().unwrap().to_string_lossy())
        );
        assert!(!loaded.created.is_empty());
        assert!(!loaded.modified.is_empty());
        assert_eq!(loaded.inpainter, WORKSPACE_INPAINTER);
        let rewritten: serde_json::Value =
            serde_json::from_slice(&fs::read(root.0.join(MANIFEST_PATH)).unwrap()).unwrap();
        assert_eq!(rewritten["id"], "old-id");
        assert_eq!(rewritten["name"], "My Production");
        assert_eq!(rewritten["slug"], loaded.slug);
        assert!(rewritten.get("created").and_then(serde_json::Value::as_str).is_some());
        assert!(rewritten.get("modified").and_then(serde_json::Value::as_str).is_some());
        assert_eq!(rewritten["inpainter"], WORKSPACE_INPAINTER);
        assert!(rewritten.get("schema_version").is_none());
    }

    #[test]
    fn unknown_manifest_fields_are_kept() {
        let root = TestDir::new();
        fs::create_dir_all(root.0.join(".inpainter")).unwrap();
        fs::write(
            root.0.join(MANIFEST_PATH),
            r#"{
  "id": "keep-id",
  "name": "Keep",
  "slug": "keep",
  "created": "2026-01-01T00:00:00.000Z",
  "modified": "2026-01-01T00:00:00.000Z",
  "color": "red"
}"#,
        )
        .unwrap();
        let loaded = read_manifest(&root.0).unwrap().unwrap();
        assert_eq!(loaded.id, "keep-id");
        assert_eq!(loaded.inpainter, WORKSPACE_INPAINTER);
        let stored: serde_json::Value =
            serde_json::from_slice(&fs::read(root.0.join(MANIFEST_PATH)).unwrap()).unwrap();
        assert_eq!(stored["color"], "red");
        assert_eq!(stored["inpainter"], WORKSPACE_INPAINTER);
    }

    #[test]
    fn slugify_turns_display_names_into_folder_names() {
        assert_eq!(slugify("My Production"), "my-production");
        assert_eq!(slugify("  Hello---World  "), "hello-world");
        assert_eq!(slugify("***"), "workspace");
    }

    fn write_defaults(root: &Path) -> PathBuf {
        let defaults = root.join("defaults");
        fs::create_dir_all(defaults.join("settings")).unwrap();
        fs::create_dir_all(defaults.join("skills")).unwrap();
        fs::create_dir_all(defaults.join("tools")).unwrap();
        fs::create_dir_all(defaults.join("agents")).unwrap();
        fs::write(defaults.join("settings").join("theme.json"), "{}").unwrap();
        fs::write(defaults.join("tools").join("canvas.tool.json"), r#"{"label":"Canvas View"}"#).unwrap();
        fs::write(
            defaults.join(STRUCTURE_FILE),
            r#"{"folders":[".inpainter/media","sessions"]}"#,
        )
        .unwrap();
        defaults
    }

    #[test]
    fn create_workspace_folder_seeds_defaults_under_inpainter() {
        let root = TestDir::new();
        let defaults = write_defaults(&root.0);
        let created = create_workspace_folder("Test Workspace", &root.0, &defaults).unwrap();
        let dest = PathBuf::from(&created.path);
        assert_eq!(dest, root.0.join("test-workspace"));
        assert_eq!(created.name, "Test Workspace");
        let manifest = read_manifest(&dest).unwrap().unwrap();
        assert_eq!(manifest.name, "Test Workspace");
        assert_eq!(manifest.slug, "test-workspace");
        assert_eq!(manifest.id, created.id);
        assert!(dest.join(MANIFEST_PATH).is_file());
        assert!(dest.join(".inpainter/settings/theme.json").is_file());
        assert!(dest.join(".inpainter/skills").is_dir());
        assert!(dest.join(".inpainter/tools/canvas.tool.json").is_file());
        assert!(dest.join(".inpainter/agents").is_dir());
        assert!(!dest.join("agents").exists());
        assert!(!dest.join("sessions").exists());
        assert!(!dest.join("settings").exists());
        assert!(!dest.join(".inpainter/media").exists());
        assert!(!dest.join("structure.json").exists());
        assert!(!dest.join(".inpainter").join(STRUCTURE_FILE).exists());
        let entries: Vec<_> = fs::read_dir(&dest)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(entries, vec![std::ffi::OsString::from(".inpainter")]);
    }

    #[test]
    fn seed_defaults_does_not_overwrite_existing_files() {
        let root = TestDir::new();
        let defaults = write_defaults(&root.0);
        let dest = root.0.join("workspace");
        fs::create_dir_all(dest.join(".inpainter/settings")).unwrap();
        fs::write(dest.join(".inpainter/settings/theme.json"), "custom").unwrap();
        seed_defaults(&dest, &defaults).unwrap();
        assert_eq!(
            fs::read_to_string(dest.join(".inpainter/settings/theme.json")).unwrap(),
            "custom"
        );
        assert!(dest.join(".inpainter/tools/canvas.tool.json").is_file());
    }

    #[test]
    fn initialize_workspace_reuses_existing_manifest_and_seeds_defaults() {
        let root = TestDir::new();
        let defaults = write_defaults(&root.0);
        fs::create_dir_all(root.0.join("notes")).unwrap();
        fs::write(root.0.join("notes/idea.txt"), "keep").unwrap();
        write_manifest(
            &root.0,
            &WorkspaceManifest::new("keep-id".into(), "Existing".into(), "existing".into()),
        )
        .unwrap();
        let initialized = initialize_workspace(&root.0, &defaults, None).unwrap();
        assert_eq!(initialized.id, "keep-id");
        assert_eq!(initialized.name, "Existing");
        assert_eq!(
            fs::read_to_string(root.0.join("notes/idea.txt")).unwrap(),
            "keep"
        );
        assert!(root.0.join(".inpainter/settings/theme.json").is_file());
        assert!(!root.0.join("structure.json").exists());
    }

    #[test]
    fn initialize_workspace_writes_a_manifest_when_missing() {
        let root = TestDir::new();
        let defaults = write_defaults(&root.0);
        let folder = root.0.join("My Footage");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("clip.mp4"), []).unwrap();
        let initialized = initialize_workspace(&folder, &defaults, None).unwrap();
        assert_eq!(initialized.name, "My Footage");
        assert!(folder.join(MANIFEST_PATH).is_file());
        assert!(folder.join("clip.mp4").is_file());
        assert!(folder.join(".inpainter/agents").is_dir());
        assert!(!folder.join("sessions").exists());
    }

    #[test]
    fn initialize_workspace_rejects_a_malformed_manifest() {
        let root = TestDir::new();
        let defaults = write_defaults(&root.0);
        fs::create_dir_all(root.0.join(".inpainter")).unwrap();
        fs::write(root.0.join(MANIFEST_PATH), "invalid json").unwrap();
        assert!(initialize_workspace(&root.0, &defaults, None).is_err());
    }

    #[test]
    fn register_workspace_rejects_duplicate_path_and_identity() {
        let mut registry = LauncherRegistry::default();
        let first = WorkspaceRecord {
            id: "id-1".into(),
            name: "One".into(),
            path: "/tmp/one".into(),
        };
        register_workspace_in(&mut registry, first.clone()).unwrap();
        assert!(register_workspace_in(&mut registry, first).is_err());
        assert!(register_workspace_in(
            &mut registry,
            WorkspaceRecord {
                id: "id-1".into(),
                name: "Copy".into(),
                path: "/tmp/copy".into(),
            }
        )
        .is_err());
        register_workspace_in(
            &mut registry,
            WorkspaceRecord {
                id: "id-2".into(),
                name: "Two".into(),
                path: "/tmp/two".into(),
            },
        )
        .unwrap();
        assert_eq!(registry.workspaces.len(), 2);
    }

    #[test]
    fn refresh_keeps_cache_when_the_folder_is_missing() {
        let cached = WorkspaceRecord {
            id: "cached-id".into(),
            name: "Cached Name".into(),
            path: "/definitely/missing/workspace".into(),
        };
        let refreshed = refresh_listed_workspace(cached.clone());
        assert_eq!(refreshed.id, cached.id);
        assert_eq!(refreshed.name, cached.name);
        assert_eq!(refreshed.path, cached.path);
    }

    #[test]
    fn refresh_reads_manifest_name_when_the_folder_is_available() {
        let root = TestDir::new();
        write_manifest(
            &root.0,
            &WorkspaceManifest::new("live-id".into(), "Live Name".into(), "live-name".into()),
        )
        .unwrap();
        let refreshed = refresh_listed_workspace(WorkspaceRecord {
            id: "stale-id".into(),
            name: "Stale".into(),
            path: root.0.display().to_string(),
        });
        assert_eq!(refreshed.id, "live-id");
        assert_eq!(refreshed.name, "Live Name");
    }
}
