use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};

use chrono::{DateTime, Local};
use serde::Serialize;

use crate::home::{self, SettingsFieldRecord, SettingsPanelRecord, WorkspaceRecord};
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
    Table {
        columns: Vec<TableColumn>,
        rows: Vec<ProjectRow>,
        search: SearchConfig,
        row_affordances: Vec<String>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        overflow_menu: Vec<MenuAction>,
    },
    #[serde(rename_all = "camelCase")]
    SkillBrowser {
        tabs: Vec<skill_browser::SkillBrowserTab>,
        selected_tab: String,
        panes: skill_browser::SkillBrowserPanes,
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
pub struct TableColumn {
    pub key: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
pub struct SearchConfig {
    pub placeholder: String,
    pub scope: String,
}

#[derive(Clone, Serialize)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub modified: String,
    pub size: String,
    pub conversations: Vec<ConversationRow>,
}

#[derive(Clone, Serialize)]
pub struct ConversationRow {
    pub name: String,
    pub modified: String,
    pub size: String,
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
                vec![
                    menu_action("projects.new", "New workspace", "plus"),
                    menu_action("projects.import", "Import workspace", "folder-plus"),
                ],
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
    let workspaces = workspace::known_workspaces()?;
    if workspaces.is_empty() {
        return Ok(no_projects_content());
    }

    Ok(DestinationContent::Table {
        columns: vec![
            TableColumn {
                key: "name".to_string(),
                label: "Name".to_string(),
            },
            TableColumn {
                key: "modified".to_string(),
                label: "Modified".to_string(),
            },
            TableColumn {
                key: "size".to_string(),
                label: "Size".to_string(),
            },
        ],
        row_affordances: vec!["disclosure".to_string(), "overflow".to_string()],
        overflow_menu: vec![menu_action("projects.remove", "Remove", "x")],
        search: SearchConfig {
            placeholder: "Search".to_string(),
            scope: "name|path|conversations".to_string(),
        },
        rows: workspaces.into_iter().map(project_row_from_workspace).collect(),
    })
}

fn project_row_from_workspace(workspace: WorkspaceRecord) -> ProjectRow {
    let path = Path::new(&workspace.path);
    ProjectRow {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path.clone(),
        modified: format_modified(path),
        size: format_size(dir_size(path)),
        conversations: Vec::new(),
    }
}

fn format_modified(path: &Path) -> String {
    let Ok(metadata) = fs::metadata(path) else {
        return "—".to_string();
    };
    let Ok(modified) = metadata.modified() else {
        return "—".to_string();
    };
    if modified < UNIX_EPOCH {
        return "—".to_string();
    }
    DateTime::<Local>::from(modified)
        .format("%b %-d, %Y")
        .to_string()
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0;
    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            total += dir_size(&child);
        } else if let Ok(metadata) = entry.metadata() {
            total += metadata.len();
        }
    }
    total
}

fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{} KB", (bytes + KB / 2) / KB)
    } else {
        format!("{bytes} B")
    }
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

fn no_projects_content() -> DestinationContent {
    DestinationContent::Placeholder {
        title: Some("No Workspaces".to_string()),
        message: "Create a new workspace or import an existing one to get started.".to_string(),
        actions: vec![
            PlaceholderAction {
                id: "projects.import".to_string(),
                label: "Import workspaces".to_string(),
                icon: "folder-plus".to_string(),
                tone: "neutral".to_string(),
                available: true,
                unavailable_reason: None,
            },
            PlaceholderAction {
                id: "projects.new".to_string(),
                label: "New workspace".to_string(),
                icon: "plus".to_string(),
                tone: "accent".to_string(),
                available: true,
                unavailable_reason: None,
            },
        ],
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
