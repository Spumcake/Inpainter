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
