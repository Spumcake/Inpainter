use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::home::AppHome;

#[derive(Clone, Serialize)]
pub struct SkillBrowserTab {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillBrowserPanes {
    pub included: SkillBrowserPane,
    pub custom: SkillBrowserPane,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillBrowserPane {
    pub tree: Vec<SkillTreeNode>,
    pub empty_message: String,
    pub empty_description: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTreeNode {
    pub id: String,
    pub label: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<SkillTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Deserialize)]
struct SkillFileMeta {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

pub fn tabs() -> Vec<SkillBrowserTab> {
    vec![
        SkillBrowserTab {
            id: "included".to_string(),
            label: "Included".to_string(),
        },
        SkillBrowserTab {
            id: "custom".to_string(),
            label: "Custom".to_string(),
        },
    ]
}

pub fn panes() -> Result<SkillBrowserPanes, String> {
    let home = AppHome::resolve()?;
    Ok(SkillBrowserPanes {
        included: pane(
            &home.installs_included_dir(),
            "No included skills.",
            "Select a skill to see its description.",
        ),
        custom: pane(
            &home.installs_custom_dir(),
            "No custom skills.",
            "Select a skill to see its description.",
        ),
    })
}

fn pane(root: &Path, empty_message: &str, empty_description: &str) -> SkillBrowserPane {
    SkillBrowserPane {
        tree: walk_skill_tree(root),
        empty_message: empty_message.to_string(),
        empty_description: empty_description.to_string(),
    }
}

fn walk_skill_tree(root: &Path) -> Vec<SkillTreeNode> {
    if !root.is_dir() {
        return Vec::new();
    }
    walk_dir(root, root)
}

fn walk_dir(root: &Path, dir: &Path) -> Vec<SkillTreeNode> {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok())
        .collect();
    entries.sort_by_key(|entry| entry.file_name());

    let mut nodes = Vec::new();
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            nodes.push(SkillTreeNode {
                id: relative_id(root, &path),
                label: name.into_owned(),
                kind: "folder".to_string(),
                children: Some(walk_dir(root, &path)),
                title: None,
                description: None,
            });
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        nodes.push(skill_node(root, &path));
    }
    nodes
}

fn skill_node(root: &Path, path: &Path) -> SkillTreeNode {
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    let meta = read_skill_meta(path);
    let title_source = meta
        .as_ref()
        .and_then(|item| item.id.as_deref())
        .filter(|id| !id.is_empty())
        .unwrap_or(stem.as_str());
    let description = meta
        .as_ref()
        .and_then(|item| item.description.clone())
        .filter(|text| !text.trim().is_empty())
        .or_else(|| read_sibling_markdown(path));

    let title = skill_display_name(title_source);
    SkillTreeNode {
        id: relative_id(root, path),
        label: stem,
        kind: "skill".to_string(),
        children: None,
        title: Some(title),
        description,
    }
}

fn read_skill_meta(path: &Path) -> Option<SkillFileMeta> {
    let body = fs::read_to_string(path).ok()?;
    serde_json::from_str(&body).ok()
}

fn read_sibling_markdown(path: &Path) -> Option<String> {
    let markdown = path.with_extension("md");
    let body = fs::read_to_string(markdown).ok()?;
    let trimmed = body.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn skill_display_name(id_or_stem: &str) -> String {
    let last = id_or_stem
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(id_or_stem);
    last.split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn relative_id(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}
