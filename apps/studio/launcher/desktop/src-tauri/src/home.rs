use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const APP_DIR_NAME: &str = ".inpainter";

#[derive(Clone, Debug)]
pub struct AppHome {
    root: PathBuf,
}

impl AppHome {
    pub fn resolve() -> Result<Self, String> {
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home directory".to_string())?;
        Ok(Self {
            root: home.join(APP_DIR_NAME),
        })
    }

    pub fn root(&self) -> &PathBuf {
        &self.root
    }

    pub fn startup_dir(&self) -> PathBuf {
        self.root.join("startup")
    }

    pub fn installs_dir(&self) -> PathBuf {
        self.root.join("installs")
    }

    pub fn installs_skills_dir(&self) -> PathBuf {
        self.installs_dir().join("skills")
    }

    pub fn installs_addons_dir(&self) -> PathBuf {
        self.installs_dir().join("addons")
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.root.join("cache")
    }

    pub fn downloads_dir(&self) -> PathBuf {
        self.cache_dir().join("downloads")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn launcher_registry_path(&self) -> PathBuf {
        self.root.join("launcher.json")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    pub fn runtime_directories(&self) -> [PathBuf; 3] {
        [self.cache_dir(), self.downloads_dir(), self.logs_dir()]
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WorkspaceRecord {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct LauncherRegistry {
    #[serde(default)]
    pub workspaces: Vec<WorkspaceRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineSettings {
    pub title: String,
    pub version_label: String,
    pub selected_category: String,
    pub categories: Vec<SettingsCategoryRecord>,
    pub panels: Vec<SettingsPanelRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SettingsCategoryRecord {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPanelRecord {
    pub category_id: String,
    pub fields: Vec<SettingsFieldRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SettingsFieldRecord {
    Path {
        id: String,
        title: String,
        description: String,
        value: String,
    },
    Number {
        id: String,
        title: String,
        description: String,
        value: i32,
        min: i32,
        max: i32,
    },
    Bool {
        id: String,
        title: String,
        description: String,
        value: bool,
        label: String,
    },
    Placeholder {
        message: String,
    },
}

pub fn load_launcher_registry() -> Result<LauncherRegistry, String> {
    let path = AppHome::resolve()?.launcher_registry_path();
    read_json(&path)
}

pub fn save_launcher_registry(registry: &LauncherRegistry) -> Result<(), String> {
    let path = AppHome::resolve()?.launcher_registry_path();
    write_json(&path, registry)
}

pub fn load_machine_settings() -> Result<MachineSettings, String> {
    let path = AppHome::resolve()?.settings_path();
    read_json(&path)
}

pub fn save_machine_settings(settings: &MachineSettings) -> Result<(), String> {
    let path = AppHome::resolve()?.settings_path();
    write_json(&path, settings)
}

pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|err| format!("failed to create {}: {err}", dst.display()))?;
    let entries = fs::read_dir(src)
        .map_err(|err| format!("failed to read {}: {err}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|err| format!("failed to read {}: {err}", src.display()))?;
        let dest = dst.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|err| format!("failed to inspect {}: {err}", entry.path().display()))?;
        if file_type.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), &dest).map_err(|err| {
                format!(
                    "failed to copy {} to {}: {err}",
                    entry.path().display(),
                    dest.display()
                )
            })?;
        }
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<T, String> {
    let contents = fs::read_to_string(path)
        .map_err(|err| format!("failed to read {}: {err}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|err| format!("failed to parse {}: {err}", path.display()))
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let body = serde_json::to_string_pretty(value)
        .map_err(|err| format!("failed to serialize {}: {err}", path.display()))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|err| format!("failed to write {}: {err}", path.display()))
}
