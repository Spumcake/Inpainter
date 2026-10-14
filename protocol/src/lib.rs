//! Messages between the host and a sub-application.
//!
//! JSON Lines: one JSON object per line, ended by `\n`. A trailing `\r` is
//! stripped. Every object has a `type` field naming the message. Strings are
//! JSON strings, so a label may hold spaces, quotes, or any other text.

use serde::{Deserialize, Serialize};

/// The version this crate speaks. A sub-application's first message says
/// which version it speaks; the host accepts only this one.
pub const PROTOCOL_VERSION: u32 = 1;

/// What a sub-application writes to the host, on its standard output.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppMessage {
    /// Always first. Names the protocol version the sub-application speaks.
    Hello { protocol: u32 },
    /// One document the sub-application has open. `label` is the name of the
    /// file it manages or, when it manages no file, the sub-application's name.
    Tab { id: String, label: String },
    /// What the host draws in that tab's contents area.
    Contents { tab: String, kind: ContentsKind },
    /// That tab uses the host's properties panel, on this side.
    Panel { tab: String, side: PanelSide },
    /// The declaration is complete.
    End,
}

/// What the host writes to a sub-application, on its standard input.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum HostMessage {
    /// The window is closing. Exit.
    Shutdown,
}

/// A shared component the host draws in a contents area.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentsKind {
    Grid,
}

/// Where the properties panel sits. Only the right side has a reference.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PanelSide {
    Right,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TabReport {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentsReport {
    pub tab: String,
    pub kind: ContentsKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PanelReport {
    pub tab: String,
    pub side: PanelSide,
}

/// Everything a sub-application has declared. The host draws only a
/// declaration that `accept` has returned `Ready` for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Declaration {
    pub tabs: Vec<TabReport>,
    pub contents: Vec<ContentsReport>,
    pub panels: Vec<PanelReport>,
    greeted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Accept {
    More,
    Ready,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub line: String,
}

impl Declaration {
    pub fn empty() -> Self {
        Self {
            tabs: Vec::new(),
            contents: Vec::new(),
            panels: Vec::new(),
            greeted: false,
        }
    }

    fn knows_tab(&self, id: &str) -> bool {
        self.tabs.iter().any(|tab| tab.id == id)
    }

    /// Adds one message. `Hello` with this crate's version must come first,
    /// and only once. A tab id is new; contents and a panel name a known tab,
    /// at most one of each per tab.
    pub fn accept(&mut self, message: AppMessage) -> Accept {
        if !self.greeted {
            return match message {
                AppMessage::Hello { protocol } if protocol == PROTOCOL_VERSION => {
                    self.greeted = true;
                    Accept::More
                }
                _ => Accept::Failed,
            };
        }
        match message {
            AppMessage::Hello { .. } => Accept::Failed,
            AppMessage::Tab { id, label } => {
                if self.knows_tab(&id) {
                    Accept::Failed
                } else {
                    self.tabs.push(TabReport { id, label });
                    Accept::More
                }
            }
            AppMessage::Contents { tab, kind } => {
                let vacant = self.contents.iter().all(|contents| contents.tab != tab);
                if self.knows_tab(&tab) && vacant {
                    self.contents.push(ContentsReport { tab, kind });
                    Accept::More
                } else {
                    Accept::Failed
                }
            }
            AppMessage::Panel { tab, side } => {
                let vacant = self.panels.iter().all(|panel| panel.tab != tab);
                if self.knows_tab(&tab) && vacant {
                    self.panels.push(PanelReport { tab, side });
                    Accept::More
                } else {
                    Accept::Failed
                }
            }
            AppMessage::End => Accept::Ready,
        }
    }
}

fn strip(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

pub fn parse_app_message(line: &str) -> Result<AppMessage, ParseError> {
    let line = strip(line);
    serde_json::from_str(line).map_err(|_| ParseError {
        line: line.to_string(),
    })
}

pub fn parse_host_message(line: &str) -> Result<HostMessage, ParseError> {
    let line = strip(line);
    serde_json::from_str(line).map_err(|_| ParseError {
        line: line.to_string(),
    })
}

/// One line, including the trailing newline. Compact JSON escapes any
/// newline inside a string, so the message stays on one line.
pub fn encode_app_message(message: &AppMessage) -> String {
    let mut line = serde_json::to_string(message).expect("an app message always encodes");
    line.push('\n');
    line
}

pub fn encode_host_message(message: &HostMessage) -> String {
    let mut line = serde_json::to_string(message).expect("a host message always encodes");
    line.push('\n');
    line
}

/// The file that registers a sub-application with the host. Each one lives
/// in its own folder under `apps/`: `apps/<id>/manifest.json`.
pub const MANIFEST_FILE: &str = "manifest.json";

/// What the host reads about a sub-application before it starts the program.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    /// Lowercase letters, digits, and hyphens. It is the folder name under
    /// `apps/` and the value the host's `--app` option takes.
    pub id: String,
    /// The sub-application's name as people see it.
    pub name: String,
    /// The program's file name, found beside the host's executable.
    pub executable: String,
    /// The protocol version the program speaks. Must be `PROTOCOL_VERSION`.
    pub protocol: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestError(pub String);

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Reads a manifest and checks the rules the host relies on.
pub fn parse_manifest(text: &str) -> Result<Manifest, ManifestError> {
    let manifest: Manifest =
        serde_json::from_str(text).map_err(|error| ManifestError(error.to_string()))?;
    let id_ok = !manifest.id.is_empty()
        && manifest
            .id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !id_ok {
        return Err(ManifestError(format!(
            "id {:?} must be lowercase letters, digits, and hyphens",
            manifest.id
        )));
    }
    if manifest.executable.is_empty() || manifest.executable.contains(['/', '\\']) {
        return Err(ManifestError(format!(
            "executable {:?} must be a file name, not a path",
            manifest.executable
        )));
    }
    if manifest.protocol != PROTOCOL_VERSION {
        return Err(ManifestError(format!(
            "protocol {} is not this host's version {PROTOCOL_VERSION}",
            manifest.protocol
        )));
    }
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_text(id: &str, executable: &str, protocol: u32) -> String {
        serde_json::json!({
            "id": id,
            "name": "Sketch",
            "executable": executable,
            "protocol": protocol,
        })
        .to_string()
    }

    /// Catches a framing that splits on spaces and drops the rest of the label.
    #[test]
    fn tab_label_with_spaces_round_trips() {
        let label = "Canvas 1".to_string();
        let message = AppMessage::Tab {
            id: "canvas-1".to_string(),
            label: label.clone(),
        };
        let encoded = encode_app_message(&message);
        let line = encoded
            .strip_suffix('\n')
            .expect("encoded message ends with one newline");
        let parsed = parse_app_message(line).expect("label with spaces parses as one message");
        assert_eq!(parsed, message);

        let mut declaration = Declaration::empty();
        assert_eq!(
            declaration.accept(AppMessage::Hello { protocol: 1 }),
            Accept::More
        );
        assert_eq!(declaration.accept(parsed), Accept::More);
        assert_eq!(declaration.tabs[0].label, label);
    }

    /// Catches a declaration the host would draw without agreeing the version.
    #[test]
    fn declaration_fails_without_hello_version_1() {
        let mut declaration = Declaration::empty();
        assert_eq!(
            declaration.accept(AppMessage::Tab {
                id: "canvas-1".to_string(),
                label: "Canvas 1".to_string(),
            }),
            Accept::Failed
        );

        let mut declaration = Declaration::empty();
        assert_eq!(
            declaration.accept(AppMessage::Hello { protocol: 2 }),
            Accept::Failed
        );
    }

    /// Catches an id that is not lowercase letters, digits, and hyphens.
    #[test]
    fn manifest_refuses_id_outside_lowercase_digits_and_hyphens() {
        let text = manifest_text("Sketch", "sketch", 1);
        assert!(
            parse_manifest(&text).is_err(),
            "uppercase id was accepted"
        );
    }

    /// Catches an executable that is a path.
    #[test]
    fn manifest_refuses_executable_path() {
        for executable in ["bin/sketch", "bin\\sketch"] {
            let text = manifest_text("sketch", executable, 1);
            assert!(
                parse_manifest(&text).is_err(),
                "path executable {executable:?} was accepted"
            );
        }
    }

    /// Catches a protocol version other than 1.
    #[test]
    fn manifest_refuses_protocol_other_than_1() {
        let text = manifest_text("sketch", "sketch", 2);
        assert!(
            parse_manifest(&text).is_err(),
            "protocol 2 was accepted"
        );
    }
}
