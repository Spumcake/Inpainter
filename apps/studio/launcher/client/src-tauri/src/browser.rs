use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

use serde::Serialize;

use crate::home::{self, SettingsFieldRecord, SettingsPanelRecord};
use crate::skill_browser;
use crate::workspace;

const LOAD_DELAY: Duration = Duration::from_millis(800);

fn simulate_load() {
    thread::sleep(LOAD_DELAY);
}

async fn with_simulated_load<T, F>(build: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        simulate_load();
        build()
    })
    .await
    .map_err(|err| format!("browser data task failed: {err}"))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserShellResponse {
    pub brand: BrandPayload,
    pub destinations: Vec<DestinationNavItem>,
    pub selected_destination: String,
    pub chrome: ChromePayload,
}

#[derive(Clone, Serialize)]
pub struct BrandPayload {
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuAction {
    pub id: String,
    pub label: String,
    pub icon: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestinationNavItem {
    pub id: String,
    pub label: String,
    pub icon: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub section_menu: Vec<MenuAction>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChromePayload {
    pub update_banner: Option<UpdateBannerPayload>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBannerPayload {
    pub title: String,
    pub body: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DestinationContentResponse {
    pub destination_id: String,
    pub content: DestinationContent,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DestinationContent {
    #[serde(rename_all = "camelCase")]
    SkillBrowser {
        tabs: Vec<skill_browser::SkillBrowserTab>,
        selected_tab: String,
        panes: skill_browser::SkillBrowserPanes,
    },
    #[serde(rename_all = "camelCase")]
    WorkspaceBrowser {
        tabs: Vec<WorkspaceBrowserTab>,
        selected_tab: String,
        can_add_tab: bool,
        panes: BTreeMap<String, WorkspaceBrowserPane>,
    },
    Placeholder {
        title: Option<String>,
        message: String,
        actions: Vec<PlaceholderAction>,
    },
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderAction {
    pub id: String,
    pub label: String,
    pub icon: String,
    pub tone: String,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBrowserTab {
    pub id: String,
    pub label: String,
    pub builtin: bool,
    pub path: String,
    pub agents: Vec<workspace::AgentRecord>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<workspace::ToolRecord>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBrowserPane {
    pub tree: Vec<WorkspaceTreeNode>,
    pub empty_message: String,
    pub empty_description: String,
}

#[derive(Clone, Serialize)]
pub struct WorkspaceTreeNode {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub path: String,
    pub agents: Vec<workspace::AgentRecord>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<workspace::ToolRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<WorkspaceTreeNode>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsResponse {
    pub title: String,
    pub version_label: String,
    pub categories: Vec<SettingsCategory>,
    pub selected_category: String,
    pub panel: SettingsPanel,
}

#[derive(Clone, Serialize)]
pub struct SettingsCategory {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPanel {
    pub category_id: String,
    pub fields: Vec<SettingsField>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SettingsField {
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

#[tauri::command]
pub async fn get_browser_shell() -> Result<BrowserShellResponse, String> {
    with_simulated_load(shell_payload).await
}

#[tauri::command]
pub async fn get_destination_content(
    destination_id: String,
) -> Result<DestinationContentResponse, String> {
    with_simulated_load(move || destination_payload(&destination_id)).await?
}

#[tauri::command]
pub async fn get_settings(category_id: Option<String>) -> Result<SettingsResponse, String> {
    with_simulated_load(move || settings_payload(category_id.as_deref())).await?
}

fn shell_payload() -> BrowserShellResponse {
    BrowserShellResponse {
        brand: BrandPayload {
            name: "Inpainter".to_string(),
        },
        destinations: vec![
            nav_item(
                "projects",
                "Workspaces",
                "folder",
                vec![menu_action("projects.new", "New Workspace", "plus")],
            ),
            nav_item(
                "installs",
                "Installs",
                "hard-drive",
                vec![menu_action("installs.add", "New install", "plus")],
            ),
            nav_item(
                "providers",
                "Providers",
                "cloud",
                vec![menu_action("providers.add", "New provider", "plus")],
            ),
            nav_item("resources", "Resources", "book-open", Vec::new()),
            nav_item("guides", "Guides", "book", Vec::new()),
            nav_item("studio", "Studio", "box", Vec::new()),
        ],
        selected_destination: "projects".to_string(),
        chrome: ChromePayload {
            update_banner: Some(UpdateBannerPayload {
                title: "Inpainter Studio 1.6 is now available.".to_string(),
                body: "Upgrade for the latest updates and improvements.".to_string(),
            }),
        },
    }
}

fn nav_item(id: &str, label: &str, icon: &str, section_menu: Vec<MenuAction>) -> DestinationNavItem {
    DestinationNavItem {
        id: id.to_string(),
        label: label.to_string(),
        icon: icon.to_string(),
        section_menu,
    }
}

fn menu_action(id: &str, label: &str, icon: &str) -> MenuAction {
    MenuAction {
        id: id.to_string(),
        label: label.to_string(),
        icon: icon.to_string(),
    }
}

fn destination_payload(destination_id: &str) -> Result<DestinationContentResponse, String> {
    let content = match destination_id {
        "projects" => projects_content()?,
        "installs" => installs_content()?,
        "providers" => placeholder_content("Providers"),
        "resources" => placeholder_content("Resources"),
        "guides" => placeholder_content("Guides"),
        "studio" => placeholder_content("Studio"),
        other => placeholder_content(other),
    };

    Ok(DestinationContentResponse {
        destination_id: destination_id.to_string(),
        content,
    })
}

fn projects_content() -> Result<DestinationContent, String> {
    let workspaces = workspace::list_workspaces()?;
    let mut tabs = Vec::new();
    let mut panes = BTreeMap::new();
    for item in workspaces {
        let path = Path::new(&item.path);
        let agents = workspace::list_agents(path);
        let tools = workspace::list_tools(path);
        let tree = if path.is_dir() {
            walk_workspace_tree(&item.id, path, path)?
        } else {
            Vec::new()
        };
        panes.insert(
            item.id.clone(),
            WorkspaceBrowserPane {
                tree,
                empty_message: String::new(),
                empty_description: String::new(),
            },
        );
        tabs.push(WorkspaceBrowserTab {
            builtin: workspace::is_local_workspace(&item),
            id: item.id,
            label: item.name,
            path: item.path,
            agents,
            tools,
        });
    }
    let selected_tab = tabs
        .first()
        .map(|tab| tab.id.clone())
        .unwrap_or_default();

    Ok(DestinationContent::WorkspaceBrowser {
        tabs,
        selected_tab,
        can_add_tab: true,
        panes,
    })
}

fn walk_workspace_tree(workspace_id: &str, root: &Path, dir: &Path) -> Result<Vec<WorkspaceTreeNode>, String> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|err| format!("failed to read {}: {err}", dir.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("failed to read {}: {err}", dir.display()))?;
    entries.sort_by_key(|entry| entry.file_name());

    let mut nodes = Vec::new();
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let id = format!("{workspace_id}/{relative}");
        let file_type = entry.file_type()
            .map_err(|err| format!("failed to inspect {}: {err}", path.display()))?;
        if file_type.is_dir() {
            nodes.push(WorkspaceTreeNode {
                id,
                label: name.into_owned(),
                kind: "folder".to_string(),
                path: path.display().to_string(),
                agents: Vec::new(),
                tools: Vec::new(),
                children: Some(walk_workspace_tree(workspace_id, root, &path)?),
            });
            continue;
        }
        nodes.push(WorkspaceTreeNode {
            id,
            label: name.into_owned(),
            // Represent directory links without recursing into cycles or other workspaces.
            kind: if file_type.is_symlink() && path.is_dir() { "folder" } else { "file" }.to_string(),
            path: path.display().to_string(),
            agents: Vec::new(),
            tools: Vec::new(),
            children: None,
        });
    }
    Ok(nodes)
}

fn installs_content() -> Result<DestinationContent, String> {
    Ok(DestinationContent::SkillBrowser {
        tabs: skill_browser::tabs(),
        selected_tab: "included".to_string(),
        panes: skill_browser::panes()?,
    })
}

fn placeholder_content(label: &str) -> DestinationContent {
    DestinationContent::Placeholder {
        title: None,
        message: format!("Content for {label} coming soon."),
        actions: Vec::new(),
    }
}

fn settings_payload(category_id: Option<&str>) -> Result<SettingsResponse, String> {
    let stored = home::load_machine_settings()?;
    let selected = category_id
        .filter(|id| stored.categories.iter().any(|category| category.id == *id))
        .unwrap_or(stored.selected_category.as_str())
        .to_string();
    let panel = stored
        .panels
        .into_iter()
        .find(|panel| panel.category_id == selected)
        .unwrap_or_else(|| SettingsPanelRecord {
            category_id: selected.clone(),
            fields: vec![SettingsFieldRecord::Placeholder {
                message: "Settings for this category coming soon.".to_string(),
            }],
        });

    Ok(SettingsResponse {
        title: stored.title,
        version_label: stored.version_label,
        categories: stored
            .categories
            .into_iter()
            .map(|category| SettingsCategory {
                id: category.id,
                label: category.label,
            })
            .collect(),
        selected_category: selected,
        panel: SettingsPanel {
            category_id: panel.category_id,
            fields: panel.fields.into_iter().map(settings_field_from_record).collect(),
        },
    })
}

fn settings_field_from_record(field: SettingsFieldRecord) -> SettingsField {
    match field {
        SettingsFieldRecord::Path {
            id,
            title,
            description,
            value,
        } => SettingsField::Path {
            id,
            title,
            description,
            value,
        },
        SettingsFieldRecord::Number {
            id,
            title,
            description,
            value,
            min,
            max,
        } => SettingsField::Number {
            id,
            title,
            description,
            value,
            min,
            max,
        },
        SettingsFieldRecord::Bool {
            id,
            title,
            description,
            value,
            label,
        } => SettingsField::Bool {
            id,
            title,
            description,
            value,
            label,
        },
        SettingsFieldRecord::Placeholder { message } => SettingsField::Placeholder { message },
    }
}
