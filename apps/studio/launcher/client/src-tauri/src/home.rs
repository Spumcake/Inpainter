use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const APP_DIR_NAME: &str = ".inpainter";

#[derive(Clone, Debug)]
pub struct AppHome {
    root: PathBuf,
}

impl AppHome {
    pub fn resolve() -> Result<Self, String> {
        if let Ok(root) = std::env::var("INPAINTER_HOME") {
            let path = PathBuf::from(root);
            if path.as_os_str().is_empty() {
                return Err("INPAINTER_HOME is empty".to_string());
            }
            return Ok(Self { root: path });
        }
        let home = dirs::home_dir().ok_or_else(|| "could not resolve home directory".to_string())?;
        Ok(Self {
            root: home.join(APP_DIR_NAME),
        })
    }

    pub fn root(&self) -> &PathBuf {
        &self.root
    }

    pub fn core_bin(&self) -> PathBuf {
        let name = if cfg!(windows) {
            "inpainter-core.cmd"
        } else {
            "inpainter-core"
        };
        self.bin_dir().join(name)
    }

    pub fn bin_dir(&self) -> PathBuf {
        self.root.join("bin")
    }

    pub fn bootstrap_dir(&self) -> PathBuf {
        self.root.join("bootstrap")
    }

    pub fn config_dir(&self) -> PathBuf {
        self.root.join("config")
    }

    pub fn workspaces_dir(&self) -> PathBuf {
        self.root.join("workspaces")
    }

    pub fn local_workspace_dir(&self) -> PathBuf {
        self.workspaces_dir().join("Local")
    }

    pub fn installs_dir(&self) -> PathBuf {
        self.root.join("installs")
    }

    pub fn installs_included_dir(&self) -> PathBuf {
        self.installs_dir().join("included")
    }

    pub fn installs_custom_dir(&self) -> PathBuf {
        self.installs_dir().join("custom")
    }

    pub fn providers_dir(&self) -> PathBuf {
        self.root.join("providers")
    }

    pub fn resources_dir(&self) -> PathBuf {
        self.bootstrap_dir().join("resources")
    }

    pub fn guides_dir(&self) -> PathBuf {
        self.bootstrap_dir().join("guides")
    }

    pub fn defaults_dir(&self) -> PathBuf {
        self.bootstrap_dir().join("defaults")
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
        self.config_dir().join("launcher.json")
    }

    pub fn settings_path(&self) -> PathBuf {
        self.config_dir().join("settings.json")
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WorkspaceRecord {
    pub id: String,
    pub name: String,
    pub path: String,
}
