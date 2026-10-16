//! Routing between the assistant and the running sub-applications.
//!
//! The host offers the assistant every running sub-application, with its
//! name, its open tabs, and the skills it declared. When the assistant calls
//! a tool, the host sends `invoke` to the process of that tool's application
//! and passes back the `result` it answers. A process that has exited, or
//! stops answering, gets the call answered for it with `ok: false`. The host
//! never knows a skill or a tool by name.

use crate::window::Started;
use assistant::{Command, TabInfo, Target};
use protocol::{HostMessage, ToolResult};
use serde_json::json;
use std::time::{Duration, Instant};

/// A call with no answer after this long is answered as failed.
const NO_RESULT: Duration = Duration::from_secs(120);

/// One call sent to a sub-application and not yet answered.
struct Pending {
    call: String,
    /// The index of the sub-application in the window's list.
    app: usize,
    sent: Instant,
}

#[derive(Default)]
pub(crate) struct Routing {
    pending: Vec<Pending>,
    /// The targets the assistant was last told about.
    offered: Option<Vec<Target>>,
}

/// Every running sub-application, as a request offers it.
pub(crate) fn targets(apps: &[Started]) -> Vec<Target> {
    apps.iter()
        .filter(|started| !started.running.exited() && !started.running.pending())
        .map(|started| Target {
            app: started.id.clone(),
            name: started.name.clone(),
            tabs: started
                .running
                .tabs()
                .0
                .into_iter()
                .map(|tab| TabInfo {
                    id: tab.id,
                    label: tab.label,
                })
                .collect(),
            skills: started.running.declared.skills.clone(),
        })
        .collect()
}

fn failed(call: String, reason: &str) -> ToolResult {
    ToolResult {
        call,
        ok: false,
        output: json!({ "error": reason }),
        images: Vec::new(),
    }
}

impl Routing {
    /// The assistant asks for a tool. Returns an answer at once when the
    /// call cannot be sent.
    pub(crate) fn call(
        &mut self,
        apps: &mut [Started],
        call: String,
        app: &str,
        message: HostMessage,
    ) -> Option<Command> {
        let Some(index) = apps.iter().position(|started| started.id == app) else {
            return Some(Command::Result(failed(
                call,
                "No running application has that id.",
            )));
        };
        let started = &mut apps[index];
        if started.running.exited() {
            return Some(Command::Result(failed(
                call,
                &format!("{} has exited.", started.name),
            )));
        }
        started.running.send(&message);
        self.pending.push(Pending {
            call,
            app: index,
            sent: Instant::now(),
        });
        None
    }

    /// The answers that arrived this frame, and failures for calls whose
    /// process exited, stopped responding, or never answered.
    pub(crate) fn poll(&mut self, apps: &mut [Started]) -> Vec<Command> {
        let mut out = Vec::new();
        for (index, started) in apps.iter_mut().enumerate() {
            while let Some(result) = started.running.declared.results.pop_front() {
                let waiting = self
                    .pending
                    .iter()
                    .position(|pending| pending.app == index && pending.call == result.call);
                // A late answer, after its call was given up, is dropped.
                if let Some(position) = waiting {
                    self.pending.remove(position);
                    out.push(Command::Result(result));
                }
            }
        }
        let mut kept = Vec::new();
        for pending in std::mem::take(&mut self.pending) {
            let reason = match apps.get(pending.app) {
                None => Some("The application is no longer running.".to_string()),
                Some(started) if started.running.exited() => {
                    Some(format!("{} has exited.", started.name))
                }
                Some(started) if started.running.not_responding() => {
                    Some(format!("{} is not responding.", started.name))
                }
                Some(started) if pending.sent.elapsed() >= NO_RESULT => {
                    Some(format!("{} did not answer.", started.name))
                }
                Some(_) => None,
            };
            match reason {
                Some(reason) => out.push(Command::Result(failed(pending.call, &reason))),
                None => kept.push(pending),
            }
        }
        self.pending = kept;
        out
    }

    /// The running sub-applications, when they changed since the assistant
    /// was last told.
    pub(crate) fn changed_targets(&mut self, apps: &[Started]) -> Option<Vec<Target>> {
        let now = targets(apps);
        if self.offered.as_ref() == Some(&now) {
            return None;
        }
        self.offered = Some(now.clone());
        Some(now)
    }

    /// The request ended: no call is waited for any longer.
    pub(crate) fn end(&mut self) {
        self.pending.clear();
    }
}
