//! The workspace file and the host's settings.
//!
//! A workspace keeps a set of files that sub-applications own together: the
//! tabs in order, which one is selected, each tab's camera, and the
//! conversation. It refers to the files and never holds their work: a tab is
//! its sub-application's id, its file's path, its label, and its camera. The
//! conversation's entries never hold a tool's input or output.
//!
//! The settings are the remembered model choice and the recent workspaces,
//! in `<Inpainter data folder>/settings.json`.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// The workspace file's extension.
pub(crate) const EXTENSION: &str = "inpainter";
/// The version this host writes and reads.
pub(crate) const VERSION: u32 = 1;
/// A workspace's name until it is saved.
pub(crate) const UNTITLED: &str = "Untitled Workspace";
/// How many recent workspaces are remembered.
const RECENT: usize = 10;

/// The `.inpainter` file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct WorkspaceFile {
    pub version: u32,
    /// The tab strip, in order.
    pub tabs: Vec<WorkspaceTab>,
    /// The selected tab's index in `tabs`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected: Option<usize>,
    #[serde(default)]
    pub conversation: Vec<assistant::Entry>,
}

/// One tab: which sub-application shows which file, and where it looks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct WorkspaceTab {
    /// The sub-application's manifest id.
    pub app: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub camera: Option<View>,
}

/// A tab's camera: the top-left point it shows and its zoom.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub(crate) struct View {
    pub origin: [f64; 2],
    pub zoom: f64,
}

impl WorkspaceFile {
    pub(crate) fn to_text(&self) -> String {
        let mut text =
            serde_json::to_string_pretty(self).expect("a workspace always encodes as JSON");
        text.push('\n');
        text
    }

    pub(crate) fn parse(text: &str) -> Result<Self, String> {
        let file: Self = serde_json::from_str(text).map_err(|error| error.to_string())?;
        if file.version != VERSION {
            return Err(format!(
                "It is version {} of the workspace file, and this Inpainter reads version {VERSION}.",
                file.version
            ));
        }
        Ok(file)
    }

    pub(crate) fn read(path: &Path) -> Result<Self, String> {
        let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
        Self::parse(&text)
    }

    /// Writes beside the file first and then replaces it, so a failed write
    /// never leaves half a workspace.
    pub(crate) fn write(&self, path: &Path) -> Result<(), String> {
        let mut partial = path.as_os_str().to_owned();
        partial.push(".partial");
        let partial = PathBuf::from(partial);
        std::fs::write(&partial, self.to_text()).map_err(|error| error.to_string())?;
        std::fs::rename(&partial, path).map_err(|error| {
            let _ = std::fs::remove_file(&partial);
            error.to_string()
        })
    }
}

/// The name a workspace is shown by: its file's name without the extension,
/// or Untitled Workspace.
pub(crate) fn name(path: Option<&Path>) -> String {
    path.and_then(Path::file_stem)
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| UNTITLED.to_string())
}

/// The path with the workspace extension, added when the dialog left it off.
pub(crate) fn with_extension(path: PathBuf) -> PathBuf {
    if path.extension().is_some_and(|ext| ext == EXTENSION) {
        path
    } else {
        let mut named = path.into_os_string();
        named.push(".");
        named.push(EXTENSION);
        PathBuf::from(named)
    }
}

/// The model the picker chose, by id, with the name it shows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct ModelChoice {
    pub id: String,
    pub name: String,
}

/// What the host remembers between runs.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub(crate) struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelChoice>,
    /// The workspaces opened or saved most recently, newest first.
    #[serde(default)]
    pub recent: Vec<PathBuf>,
    /// Where these settings live. None in frame tests, which never write.
    #[serde(skip)]
    file: Option<PathBuf>,
}

impl Settings {
    /// `<Inpainter data folder>/settings.json`.
    pub(crate) fn default_file() -> Option<PathBuf> {
        let dirs = directories::ProjectDirs::from("io.github", "spumcake", "Inpainter")?;
        Some(dirs.data_dir().join("settings.json"))
    }

    /// The settings in `file`, or none remembered yet.
    pub(crate) fn load(file: Option<PathBuf>) -> Self {
        let mut settings = file
            .as_deref()
            .and_then(|file| std::fs::read_to_string(file).ok())
            .and_then(|text| serde_json::from_str::<Settings>(&text).ok())
            .unwrap_or_default();
        settings.file = file;
        settings
    }

    fn write(&self) {
        let Some(file) = &self.file else {
            return;
        };
        if let Some(folder) = file.parent() {
            let _ = std::fs::create_dir_all(folder);
        }
        if let Ok(text) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(file, text);
        }
    }

    /// Another window may have changed the file since this one read it, so
    /// read it again and change only this one value.
    fn update(&mut self, change: impl FnOnce(&mut Settings)) {
        if self.file.is_some() {
            let fresh = Self::load(self.file.clone());
            self.recent = fresh.recent;
            self.model = fresh.model;
        }
        change(self);
        self.write();
    }

    pub(crate) fn choose_model(&mut self, choice: ModelChoice) {
        self.update(|settings| settings.model = Some(choice));
    }

    /// Puts `path` first among the recent workspaces.
    pub(crate) fn add_recent(&mut self, path: &Path) {
        let path = path.to_path_buf();
        self.update(|settings| {
            settings.recent.retain(|known| *known != path);
            settings.recent.insert(0, path);
            settings.recent.truncate(RECENT);
        });
    }

    pub(crate) fn forget_recent(&mut self, path: &Path) {
        let path = path.to_path_buf();
        self.update(|settings| settings.recent.retain(|known| *known != path));
    }
}

/// The models the picker offers, in its order, as the owner asked on
/// 2026-10-15: a few recent, well-known models in the class of Claude Haiku
/// 5.5 and Claude Sonnet 5.5, each able to use tools and see pictures. One
/// the OpenRouter list no longer offers is left out.
pub(crate) const PICKER: &[&str] = &[
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-opus-5.5",
    "openai/gpt-6-luna",
    "openai/gpt-6.1-sol",
    "google/gemini-3.8-flash",
    "google/gemini-4-argon",
];

/// The models of [`PICKER`] that the list offers, in the picker's order.
pub(crate) fn picker_models(list: Vec<assistant::Model>) -> Vec<assistant::Model> {
    PICKER
        .iter()
        .filter_map(|id| list.iter().find(|model| model.id == *id && model.images).cloned())
        .collect()
}

/// The model to use when none is chosen: the newest Claude Haiku the list
/// offers, or else the first model in it.
pub(crate) fn default_model(models: &[assistant::Model]) -> Option<&assistant::Model> {
    // The newest Claude Haiku, as the owner chose on 2026-10-15.
    let haiku = models
        .iter()
        .filter(|model| {
            let id = model.id.to_ascii_lowercase();
            // A variant such as `:batch` or `:free` is never the default.
            id.contains("claude") && id.contains("haiku") && !id.contains(':')
        })
        .max_by(|a, b| version_of(&a.id).cmp(&version_of(&b.id)));
    haiku.or_else(|| models.first())
}

/// The numbers in a model id, in order, so `claude-sonnet-4.5` is newer
/// than `claude-sonnet-4` and `claude-3.7-sonnet`.
fn version_of(id: &str) -> Vec<u32> {
    let name = id.split_once('/').map_or(id, |(_, name)| name);
    let name = name.split_once(':').map_or(name, |(name, _)| name);
    name.split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty() && part.len() < 6)
        .filter_map(|part| part.parse().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use assistant::{Entry, Model, Role};

    fn entry(role: Role, text: &str) -> Entry {
        Entry {
            role,
            text: text.to_string(),
            time: 1_760_000_000,
            attachments: Vec::new(),
            tool: None,
            ok: None,
        }
    }

    fn sample() -> WorkspaceFile {
        let mut person = entry(Role::Person, "Make it larger");
        person.attachments = vec!["/home/someone/guide.png".to_string()];
        let mut tool = entry(Role::Tool, "");
        tool.tool = Some("one-app__edit__grow".to_string());
        tool.ok = Some(true);
        WorkspaceFile {
            version: VERSION,
            tabs: vec![
                WorkspaceTab {
                    app: "one-app".to_string(),
                    path: Some("/home/someone/work.file".to_string()),
                    label: "work".to_string(),
                    camera: Some(View {
                        origin: [-120.5, 40.0],
                        zoom: 1.25,
                    }),
                },
                WorkspaceTab {
                    app: "other-app".to_string(),
                    path: None,
                    label: "Other".to_string(),
                    camera: None,
                },
            ],
            selected: Some(1),
            conversation: vec![person, tool, entry(Role::Assistant, "Done.")],
        }
    }

    /// Catches a workspace that loses a tab's file, camera, the selection,
    /// or a line of the conversation on the way to its file and back.
    #[test]
    fn the_workspace_file_round_trips() {
        let file = sample();
        let text = file.to_text();
        assert_eq!(WorkspaceFile::parse(&text).unwrap(), file);

        let folder = std::env::temp_dir().join(format!("inpainter-ws-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        let path = with_extension(folder.join("trip"));
        assert_eq!(path.extension().unwrap(), EXTENSION);
        file.write(&path).unwrap();
        assert_eq!(WorkspaceFile::read(&path).unwrap(), file);
        assert_eq!(name(Some(&path)), "trip");
        assert_eq!(name(None), UNTITLED);
        std::fs::remove_dir_all(&folder).unwrap();
    }

    /// Catches a newer workspace version read as if this host understood it.
    #[test]
    fn a_newer_workspace_version_is_refused() {
        let mut file = sample();
        file.version = VERSION + 1;
        assert!(WorkspaceFile::parse(&file.to_text()).is_err());
    }

    /// Catches settings that forget the model or reorder the recent list
    /// wrongly, or that another window's write is lost.
    #[test]
    fn settings_keep_the_model_and_the_newest_workspace_first() {
        let folder = std::env::temp_dir().join(format!("inpainter-set-{}", std::process::id()));
        let file = folder.join("settings.json");
        let mut settings = Settings::load(Some(file.clone()));
        settings.add_recent(Path::new("/a.inpainter"));
        settings.add_recent(Path::new("/b.inpainter"));
        let mut other = Settings::load(Some(file.clone()));
        other.choose_model(ModelChoice {
            id: "x/y".to_string(),
            name: "Y".to_string(),
        });
        settings.add_recent(Path::new("/a.inpainter"));
        let read = Settings::load(Some(file));
        assert_eq!(
            read.recent,
            vec![PathBuf::from("/a.inpainter"), PathBuf::from("/b.inpainter")]
        );
        assert_eq!(read.model.map(|model| model.id).as_deref(), Some("x/y"));
        std::fs::remove_dir_all(&folder).unwrap();
    }

    /// Catches a picker that offers every model OpenRouter lists, or one
    /// that cannot see pictures.
    #[test]
    fn the_picker_offers_its_short_list_in_order() {
        let model = |id: &str, images: bool| Model {
            id: id.to_string(),
            name: id.to_string(),
            images,
        };
        let list = vec![
            model("some/other-model", true),
            model("anthropic/claude-sonnet-5.5", true),
            model("anthropic/claude-sonnet-5.5:batch", true),
            model("anthropic/claude-haiku-5.5", true),
            model("openai/gpt-6-luna", false),
        ];
        let ids: Vec<String> = picker_models(list).into_iter().map(|model| model.id).collect();
        assert_eq!(ids, ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"]);
    }

    #[test]
    fn the_default_model_is_the_newest_haiku() {
        let model = |id: &str| Model {
            id: id.to_string(),
            name: id.to_string(),
            images: true,
        };
        let models = vec![
            model("openai/gpt-5"),
            model("anthropic/claude-sonnet-5.5"),
            model("anthropic/claude-3.5-haiku"),
            model("anthropic/claude-haiku-5.5"),
            // Seen on 2026-10-15: the batch variant sorts after the plain one.
            model("anthropic/claude-haiku-5.5:batch"),
            model("anthropic/claude-haiku-4.5"),
            model("anthropic/claude-opus-4.1"),
        ];
        assert_eq!(
            default_model(&models).map(|model| model.id.as_str()),
            Some("anthropic/claude-haiku-5.5")
        );
        assert_eq!(
            default_model(&models[..1]).map(|model| model.id.as_str()),
            Some("openai/gpt-5")
        );
    }
}
