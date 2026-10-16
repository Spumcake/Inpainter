//! The workspace's flows, reached from the logo menu and the window's close:
//! saving, opening, a recent workspace, clearing, a new window, and quitting.
//!
//! The host owns the workspace file. It holds each tab's sub-application,
//! file, label, and camera, the selected tab, and the conversation, never a
//! sub-application's work. Saving first asks each tab that saves and has no
//! file to keep itself, through its sub-application's own Save. Opening,
//! clearing, and quitting first offer to save the workspace when it has
//! changed, then close every tab through the quit flow, so each
//! sub-application asks about its own unsaved work. Opening then starts the
//! sub-applications the file names to restore, and reopens each tab.

use super::{AppSpec, HostWindow, Started};
use crate::chat::LogoChoice;
use crate::process::Running;
use crate::workspace::{self, View, WorkspaceFile, WorkspaceTab};
use assistant::{Command, Entry, Role};
use eframe::egui;
use protocol::{Ask, AskButton, FileFilter, HostMessage};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// After the sub-applications have declared themselves, what they report
/// for this long is still the workspace's starting state, not a change.
#[cfg(not(test))]
const SETTLE_GRACE: Duration = Duration::from_millis(400);
#[cfg(test)]
const SETTLE_GRACE: Duration = Duration::ZERO;
/// How long a restore waits for the tabs it asked to reopen.
const RESTORE_WAIT: Duration = Duration::from_secs(10);
/// A tab asked to keep itself that has not answered after this long, with
/// no question or file dialog of its own showing, cancels the save.
const NO_KEPT: Duration = Duration::from_secs(10);
/// The host's own question's id, apart from every sub-application's.
const QUESTION: usize = usize::MAX;

/// What runs once the workspace question is answered.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum After {
    Quit,
    /// Open Workspace…: choose the file, then open it.
    Pick,
    Open(PathBuf),
    Clear,
}

/// The quit flow is closing every tab, and then this happens.
enum Closing {
    Quit { closed: bool },
    Open(PathBuf, WorkspaceFile),
    Clear,
}

/// A question the host asks itself, in the existing dialog look.
enum Question {
    Save(After),
    Failed { title: String, line: String },
}

struct SaveJob {
    /// Save Workspace As…, or a workspace never saved: ask for its file.
    choose: bool,
    /// Tabs that save and have no file, each asked to keep itself in turn.
    queue: VecDeque<(usize, String)>,
    waiting: Option<(usize, String)>,
    /// When the tab waited on last showed a question or a file dialog, or
    /// was asked.
    heard: Instant,
    /// The files those tabs were kept as.
    kept: HashMap<(usize, String), String>,
    then: Option<After>,
}

struct RestoreTab {
    path: Option<String>,
    camera: Option<View>,
}

/// One restarted sub-application's tabs to reopen, in order.
struct RestoreApp {
    tabs: Vec<RestoreTab>,
    opened: bool,
    /// The new tab id of each, once matched.
    ids: Option<Vec<Option<String>>>,
}

struct Restore {
    apps: Vec<RestoreApp>,
    /// The selected tab: its sub-application, and its place among that one's tabs.
    selected: Option<(usize, usize)>,
    started: Instant,
    mapped: bool,
    cameras: Vec<(usize, String, View)>,
}

/// A tab as the workspace's changes are judged: its sub-application, its
/// id, and its file.
#[derive(Debug, Clone, PartialEq)]
struct TabKey {
    app: String,
    tab: String,
    path: Option<String>,
}

#[derive(Default)]
struct Baseline {
    tabs: Vec<TabKey>,
    selected: Option<TabKey>,
    conversation: usize,
}

#[derive(Default)]
enum Settle {
    /// The sub-applications are still declaring themselves.
    #[default]
    Waiting,
    Grace(Instant),
    Done,
}

#[derive(Default)]
pub(crate) struct Flows {
    /// The workspace's file, once saved or opened.
    pub path: Option<PathBuf>,
    /// A tab's camera was moved by hand since the workspace was saved.
    pub moved: bool,
    /// When a file dialog a sub-application asked for last closed.
    pub dialog_closed: Option<Instant>,
    baseline: Baseline,
    settle: Settle,
    question: Option<Question>,
    save: Option<SaveJob>,
    closing: Option<Closing>,
    restore: Option<Restore>,
}

impl Flows {
    /// The title of the host's own question, while one shows.
    #[cfg(test)]
    pub(crate) fn question_shown(&self) -> Option<String> {
        match self.question.as_ref()? {
            Question::Save(_) => Some("Save this workspace?".to_string()),
            Question::Failed { title, .. } => Some(title.clone()),
        }
    }

    /// The quit flow is closing every tab.
    #[cfg(test)]
    pub(crate) fn closing_started(&self) -> bool {
        self.closing.is_some()
    }

    fn busy(&self) -> bool {
        self.question.is_some()
            || self.save.is_some()
            || self.closing.is_some()
            || self.restore.is_some()
    }
}

fn button(id: &str, label: &str) -> AskButton {
    AskButton {
        id: id.to_string(),
        label: label.to_string(),
    }
}

fn note(text: String) -> Entry {
    Entry {
        role: Role::Note,
        text,
        time: assistant::now(),
        attachments: Vec::new(),
        tool: None,
        ok: None,
    }
}

fn workspace_filter() -> FileFilter {
    FileFilter {
        name: "Inpainter workspace".to_string(),
        extensions: vec![workspace::EXTENSION.to_string()],
    }
}

/// Matches the tabs to reopen with the tabs a restarted sub-application
/// reports: by file first, then the rest in order.
fn match_tabs(wanted: &[RestoreTab], reported: &[protocol::TabEntry]) -> Vec<Option<String>> {
    let same = |a: &str, b: &str| {
        a == b
            || matches!(
                (std::fs::canonicalize(a), std::fs::canonicalize(b)),
                (Ok(a), Ok(b)) if a == b
            )
    };
    let mut used = vec![false; reported.len()];
    let mut ids = vec![None; wanted.len()];
    for (index, tab) in wanted.iter().enumerate() {
        let Some(path) = &tab.path else {
            continue;
        };
        if let Some(found) = reported.iter().enumerate().position(|(at, entry)| {
            !used[at] && entry.path.as_deref().is_some_and(|known| same(known, path))
        }) {
            used[found] = true;
            ids[index] = Some(reported[found].id.clone());
        }
    }
    for id in ids.iter_mut().filter(|id| id.is_none()) {
        if let Some(found) = used.iter().position(|taken| !taken) {
            used[found] = true;
            *id = Some(reported[found].id.clone());
        }
    }
    ids
}

impl HostWindow {
    /// Every running sub-application's tabs, as the workspace's changes
    /// are judged.
    fn tab_keys(&self) -> Vec<TabKey> {
        let mut keys = Vec::new();
        for started in self.apps.iter().filter(|started| !started.running.exited()) {
            for tab in started.running.tabs().0 {
                keys.push(TabKey {
                    app: started.id.clone(),
                    tab: tab.id,
                    path: tab.path,
                });
            }
        }
        keys
    }

    fn selected_key(&self) -> Option<TabKey> {
        let started = self.apps.get(self.selected)?;
        let (tabs, active) = started.running.tabs();
        let active = active?;
        let tab = tabs.into_iter().find(|tab| tab.id == active)?;
        Some(TabKey {
            app: started.id.clone(),
            tab: tab.id,
            path: tab.path,
        })
    }

    fn rebaseline(&mut self) {
        self.flows.baseline = Baseline {
            tabs: self.tab_keys(),
            selected: self.selected_key(),
            conversation: self.chat.conversation.len(),
        };
        self.flows.moved = false;
    }

    /// The workspace has changes it has not saved: a tab opened or closed,
    /// a tab gained a file, the selection or a camera changed, or the
    /// conversation grew. A workspace still starting has none.
    pub(super) fn workspace_dirty(&self) -> bool {
        if !matches!(self.flows.settle, Settle::Done) {
            return false;
        }
        let base = &self.flows.baseline;
        self.flows.moved
            || self.tab_keys() != base.tabs
            || self.selected_key() != base.selected
            || self.chat.conversation.len() != base.conversation
    }

    /// The workspace as its file holds it. `kept` gives the files tabs were
    /// just kept as, before their sub-applications report them.
    pub(super) fn workspace_file(&self, kept: &HashMap<(usize, String), String>) -> WorkspaceFile {
        let mut tabs = Vec::new();
        let mut selected = None;
        for (index, started) in self.apps.iter().enumerate() {
            if started.running.exited() {
                continue;
            }
            let (entries, active) = started.running.tabs();
            for entry in entries {
                if index == self.selected && active.as_deref() == Some(entry.id.as_str()) {
                    selected = Some(tabs.len());
                }
                let camera = started
                    .running
                    .declared
                    .documents
                    .get(&entry.id)
                    .map(|display| View {
                        origin: display.camera.origin,
                        zoom: display.camera.zoom,
                    });
                let path = kept
                    .get(&(index, entry.id.clone()))
                    .cloned()
                    .or(entry.path);
                tabs.push(WorkspaceTab {
                    app: started.id.clone(),
                    path,
                    label: entry.label,
                    camera,
                });
            }
        }
        WorkspaceFile {
            version: workspace::VERSION,
            tabs,
            selected,
            conversation: self.chat.conversation.clone(),
        }
    }

    /// A row of the logo menu. While a request runs, only New Window goes.
    pub(super) fn logo(
        &mut self,
        choice: LogoChoice,
        ctx: &egui::Context,
        frame: &mut eframe::Frame,
    ) {
        if choice == LogoChoice::NewWindow {
            self.new_window();
            return;
        }
        if self.locked() || self.flows.busy() {
            return;
        }
        match choice {
            LogoChoice::NewWindow => {}
            LogoChoice::Open => self.begin(After::Pick, frame),
            LogoChoice::Recent(path) => self.begin(After::Open(path), frame),
            LogoChoice::Save => self.start_save(false, None),
            LogoChoice::SaveAs => self.start_save(true, None),
            LogoChoice::Clear => self.begin(After::Clear, frame),
            LogoChoice::Quit => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
        }
    }

    /// Another Inpainter with the same sub-applications and a fresh workspace.
    fn new_window(&self) {
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        let args: Vec<std::ffi::OsString> = std::env::args_os().skip(1).collect();
        if let Ok(mut child) = std::process::Command::new(exe).args(args).spawn() {
            // Collected when it exits, so it leaves nothing behind.
            std::thread::spawn(move || {
                let _ = child.wait();
            });
        }
    }

    /// Offers to save a changed workspace, then goes on.
    fn begin(&mut self, after: After, frame: &mut eframe::Frame) {
        if self.workspace_dirty() {
            self.flows.question = Some(Question::Save(after));
        } else {
            self.proceed(after, frame);
        }
    }

    fn proceed(&mut self, after: After, frame: &mut eframe::Frame) {
        match after {
            After::Quit => self.start_closing(Closing::Quit { closed: false }),
            After::Clear => self.start_closing(Closing::Clear),
            After::Pick => {
                let picked = if self.native_dialogs {
                    crate::dialogs::pick_open(frame, None, Some(&workspace_filter()))
                } else {
                    self.scripted_path()
                };
                if let Some(path) = picked {
                    self.proceed(After::Open(path), frame);
                }
            }
            After::Open(path) => match WorkspaceFile::read(&path) {
                Ok(file) => self.start_closing(Closing::Open(path, file)),
                Err(reason) => {
                    if !path.exists() {
                        self.settings.forget_recent(&path);
                    }
                    self.flows.question = Some(Question::Failed {
                        title: format!("Could not open “{}”", workspace::name(Some(&path))),
                        line: reason,
                    });
                }
            },
        }
    }

    /// Every sub-application resolves its unsaved work, as when the window
    /// closes. Each is asked again, even one that was ready before.
    fn start_closing(&mut self, closing: Closing) {
        for started in &mut self.apps {
            started.running.declared.quit_ready = false;
            started.running.send(&HostMessage::Quit);
        }
        self.flows.closing = Some(closing);
    }

    /// The person answered a sub-application's question. Its dismiss button
    /// during the quit flow cancels the flow: everything stays open.
    pub(super) fn note_answer(&mut self, ask: &Ask, button: &str) {
        if self.flows.closing.is_some() && ask.dismiss.as_deref() == Some(button) {
            self.flows.closing = None;
            for started in &mut self.apps {
                started.running.declared.quit_ready = false;
            }
        }
    }

    fn start_save(&mut self, choose: bool, then: Option<After>) {
        let mut queue = VecDeque::new();
        for (index, started) in self.apps.iter().enumerate() {
            if started.running.exited() {
                continue;
            }
            for tab in started.running.tabs().0 {
                if tab.saves && tab.path.is_none() {
                    queue.push_back((index, tab.id));
                }
            }
        }
        for started in &mut self.apps {
            started.running.declared.kept.clear();
        }
        self.flows.save = Some(SaveJob {
            choose: choose || self.flows.path.is_none(),
            queue,
            waiting: None,
            heard: Instant::now(),
            kept: HashMap::new(),
            then,
        });
    }

    /// Moves the save on: each tab keeps itself in turn, then the file is
    /// chosen and written.
    fn save_frame(&mut self, frame: &mut eframe::Frame) {
        let Some(mut job) = self.flows.save.take() else {
            return;
        };
        if let Some((app, tab)) = job.waiting.clone() {
            let Some(started) = self.apps.get_mut(app) else {
                return;
            };
            let answer = started
                .running
                .declared
                .kept
                .iter()
                .position(|(kept, _)| *kept == tab);
            match answer {
                Some(position) => {
                    let (_, path) = started.running.declared.kept.remove(position).unwrap_or_default();
                    match path {
                        Some(path) => {
                            job.kept.insert((app, tab), path);
                            job.waiting = None;
                        }
                        // The person cancelled the tab's own Save.
                        None => return,
                    }
                }
                None if started.running.exited() || started.running.not_responding() => return,
                None if started.running.declared.ask.is_some()
                    || !started.running.declared.files.is_empty() =>
                {
                    job.heard = Instant::now();
                    self.flows.save = Some(job);
                    return;
                }
                // The person may be in a file dialog the host opened; that
                // frame waits on the dialog, so time passes only outside it.
                None if job.heard.elapsed() >= NO_KEPT
                    && self
                        .flows
                        .dialog_closed
                        .is_none_or(|closed| closed.elapsed() >= NO_KEPT) =>
                {
                    return;
                }
                None => {
                    self.flows.save = Some(job);
                    return;
                }
            }
        }
        if let Some((app, tab)) = job.queue.pop_front() {
            if let Some(started) = self.apps.get_mut(app) {
                started.running.send(&HostMessage::Keep { tab: tab.clone() });
            }
            job.waiting = Some((app, tab));
            job.heard = Instant::now();
            self.flows.save = Some(job);
            return;
        }
        let target = if job.choose {
            let name = format!(
                "{}.{}",
                workspace::name(self.flows.path.as_deref()),
                workspace::EXTENSION
            );
            let picked = if self.native_dialogs {
                crate::dialogs::pick_save(frame, None, &name, Some(&workspace_filter()))
            } else {
                self.scripted_path()
            };
            picked.map(workspace::with_extension)
        } else {
            self.flows.path.clone()
        };
        let Some(target) = target else {
            return;
        };
        let file = self.workspace_file(&job.kept);
        match file.write(&target) {
            Ok(()) => {
                self.settings.add_recent(&target);
                self.flows.path = Some(target);
                self.rebaseline();
                if let Some(after) = job.then {
                    self.proceed(after, frame);
                }
            }
            Err(reason) => {
                self.flows.question = Some(Question::Failed {
                    title: format!("Could not save “{}”", workspace::name(Some(&target))),
                    line: reason,
                });
            }
        }
    }

    /// Shows the host's own question, when it has one. Returns whether it did.
    pub(super) fn show_question(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) -> bool {
        let ask = match &self.flows.question {
            None => return false,
            Some(Question::Save(_)) => Ask {
                id: "workspace-save".to_string(),
                title: "Save this workspace?".to_string(),
                lines: vec![workspace::name(self.flows.path.as_deref())],
                buttons: vec![
                    button("save", "Save"),
                    button("discard", "Discard"),
                    button("cancel", "Cancel"),
                ],
                dismiss: Some("cancel".to_string()),
            },
            Some(Question::Failed { title, line }) => Ask {
                id: "workspace-failed".to_string(),
                title: title.clone(),
                lines: vec![line.clone()],
                buttons: vec![button("ok", "OK")],
                dismiss: Some("ok".to_string()),
            },
        };
        if let Some(chosen) = crate::ask::show(ctx, QUESTION, &ask) {
            let question = self.flows.question.take();
            if let Some(Question::Save(after)) = question {
                match chosen.as_str() {
                    "save" => self.start_save(false, Some(after)),
                    "discard" => self.proceed(after, frame),
                    _ => {}
                }
            }
        }
        true
    }

    /// Runs every frame: the window's close, the workspace's start, and the
    /// save, quit, and restore flows in progress.
    pub(super) fn workspace_frame(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        self.settle_frame();
        self.close_frame(ctx, frame);
        self.save_frame(frame);
        self.closing_frame(ctx);
        self.restore_frame();
    }

    fn settle_frame(&mut self) {
        match self.flows.settle {
            Settle::Waiting => {
                let declared = self.apps.iter().all(|started| !started.running.pending());
                if declared && self.flows.restore.is_none() && self.flows.closing.is_none() {
                    self.flows.settle = Settle::Grace(Instant::now() + SETTLE_GRACE);
                    self.rebaseline();
                }
            }
            Settle::Grace(until) => {
                self.rebaseline();
                if Instant::now() >= until {
                    self.flows.settle = Settle::Done;
                }
            }
            Settle::Done => {}
        }
    }

    /// The window's close: a changed workspace is offered to save first,
    /// then each sub-application resolves its unsaved work. The window
    /// closes once every one is ready or has exited. A cancelled question
    /// leaves the window open; closing again asks again.
    fn close_frame(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        let requested = ctx.input(|input| input.viewport().close_requested());
        if !requested {
            return;
        }
        if self.locked() {
            self.assistant.send(Command::Stop);
        }
        let ready = self.apps_ready();
        match &self.flows.closing {
            Some(Closing::Quit { .. }) => {
                if !ready {
                    ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
                }
            }
            Some(_) => ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose),
            None => {
                ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
                if self.flows.question.is_none()
                    && self.flows.save.is_none()
                    && self.flows.restore.is_none()
                {
                    self.begin(After::Quit, frame);
                }
            }
        }
    }

    fn apps_ready(&self) -> bool {
        self.apps
            .iter()
            .all(|started| started.running.exited() || started.running.declared.quit_ready)
    }

    fn closing_frame(&mut self, ctx: &egui::Context) {
        if self.flows.closing.is_none() || !self.apps_ready() {
            return;
        }
        match self.flows.closing.take() {
            Some(Closing::Quit { closed }) => {
                if !closed {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
                self.flows.closing = Some(Closing::Quit { closed: true });
            }
            Some(Closing::Open(path, file)) => self.open_now(path, file),
            Some(Closing::Clear) => self.clear_now(),
            None => {}
        }
    }

    /// Stops every sub-application and starts these instead.
    fn restart(&mut self, specs: Vec<AppSpec>, restore: bool) {
        for started in std::mem::take(&mut self.apps) {
            started.running.shutdown();
        }
        self.apps = specs
            .into_iter()
            .map(|spec| {
                let running = match &spec.executable {
                    Some(executable) => {
                        Running::start(executable, crate::apps::data_dir(&spec.id), restore)
                    }
                    None => Running::not_started(),
                };
                running.attach(&self.ctx);
                Started {
                    id: spec.id,
                    name: spec.name,
                    executable: spec.executable,
                    running,
                }
            })
            .collect();
        self.selected = 0;
        self.viewport_sent = vec![false; self.apps.len()];
        self.shown = None;
        self.surface.reset();
        self.live.reset();
        self.panel_open = false;
        self.routing = Default::default();
        self.flows.settle = Settle::Waiting;
    }

    /// A fresh start: the sub-applications started at launch, each as at
    /// launch, and an empty conversation.
    fn clear_now(&mut self) {
        self.restart(self.launch.clone(), false);
        self.flows.path = None;
        self.chat.conversation.clear();
        self.assistant.send(Command::Clear);
    }

    /// Starts the sub-applications the workspace names, and only those, to
    /// restore, and asks each to reopen its tabs. A file that no longer
    /// exists, or a sub-application no longer installed, is left out, and a
    /// line in the conversation says which.
    fn open_now(&mut self, path: PathBuf, file: WorkspaceFile) {
        let installed = crate::apps::discover();
        let mut notes = Vec::new();
        let mut specs: Vec<AppSpec> = Vec::new();
        let mut apps: Vec<RestoreApp> = Vec::new();
        let mut selected = None;
        for (index, tab) in file.tabs.iter().enumerate() {
            // A sub-application this window already started is started from
            // the same program again; any other is found by its manifest.
            let running = self.apps.iter().map(|started| AppSpec {
                id: started.id.clone(),
                name: started.name.clone(),
                executable: started.executable.clone(),
            });
            let known = self
                .launch
                .iter()
                .cloned()
                .chain(running)
                .find(|spec| spec.id == tab.app && spec.executable.is_some())
                .or_else(|| {
                    installed
                        .iter()
                        .find(|app| app.manifest.id == tab.app)
                        .map(|app| AppSpec {
                            id: app.manifest.id.clone(),
                            name: app.manifest.name.clone(),
                            executable: Some(app.executable.clone()),
                        })
                });
            let at = match specs.iter().position(|spec| spec.id == tab.app) {
                Some(at) => Some(at),
                None => match known {
                    Some(spec) => {
                        specs.push(spec);
                        apps.push(RestoreApp {
                            tabs: Vec::new(),
                            opened: false,
                            ids: None,
                        });
                        Some(specs.len() - 1)
                    }
                    None => None,
                },
            };
            let Some(at) = at else {
                notes.push(note(format!(
                    "“{}” was left out: its application, {}, is not installed.",
                    tab.label, tab.app
                )));
                continue;
            };
            if let Some(file_path) = &tab.path
                && !Path::new(file_path).exists()
            {
                notes.push(note(format!(
                    "“{}” was left out: {file_path} no longer exists.",
                    tab.label
                )));
                continue;
            }
            if file.selected == Some(index) {
                selected = Some((at, apps[at].tabs.len()));
            }
            apps[at].tabs.push(RestoreTab {
                path: tab.path.clone(),
                camera: tab.camera,
            });
        }
        self.restart(specs, true);
        self.settings.add_recent(&path);
        self.flows.path = Some(path);
        self.chat.conversation.clear();
        let mut conversation = file.conversation;
        conversation.extend(notes);
        self.assistant.send(Command::Restore(conversation));
        self.flows.restore = Some(Restore {
            apps,
            selected: selected.or(Some((0, 0))),
            started: Instant::now(),
            mapped: false,
            cameras: Vec::new(),
        });
    }

    /// Moves a restore on: once a restarted sub-application has declared
    /// itself, it is asked to open each tab; once its tabs are reported,
    /// they are matched, and the selection and cameras are put back.
    fn restore_frame(&mut self) {
        let Some(mut job) = self.flows.restore.take() else {
            return;
        };
        let late = job.started.elapsed() >= RESTORE_WAIT;
        for (index, wanted) in job.apps.iter_mut().enumerate() {
            let Some(started) = self.apps.get_mut(index) else {
                wanted.opened = true;
                wanted.ids = Some(vec![None; wanted.tabs.len()]);
                continue;
            };
            if !wanted.opened && !started.running.pending() {
                for tab in &wanted.tabs {
                    started.running.send(&HostMessage::Open {
                        path: tab.path.clone(),
                    });
                }
                wanted.opened = true;
            }
            if wanted.opened && wanted.ids.is_none() {
                let reported = started.running.tabs().0;
                if reported.len() >= wanted.tabs.len() || started.running.exited() || late {
                    wanted.ids = Some(match_tabs(&wanted.tabs, &reported));
                }
            }
        }
        if !job.mapped && job.apps.iter().all(|wanted| wanted.ids.is_some()) {
            job.mapped = true;
            for (index, wanted) in job.apps.iter().enumerate() {
                let ids = wanted.ids.as_deref().unwrap_or_default();
                for (tab, id) in wanted.tabs.iter().zip(ids) {
                    if let (Some(camera), Some(id)) = (tab.camera, id) {
                        job.cameras.push((index, id.clone(), camera));
                    }
                }
            }
            if let Some((app, nth)) = job.selected
                && let Some(Some(id)) = job
                    .apps
                    .get(app)
                    .and_then(|wanted| wanted.ids.as_ref())
                    .and_then(|ids| ids.get(nth))
            {
                self.selected = app;
                let viewport = self.viewport;
                self.send(
                    app,
                    HostMessage::Command {
                        id: "select_tab".to_string(),
                        tab: Some(id.clone()),
                        arg: None,
                        node: None,
                        viewport,
                    },
                );
            }
        }
        if job.mapped {
            let mut waiting = Vec::new();
            for (app, tab, view) in std::mem::take(&mut job.cameras) {
                let Some(started) = self.apps.get_mut(app) else {
                    continue;
                };
                match started.running.declared.documents.get_mut(&tab) {
                    Some(display) => {
                        display.camera.origin = view.origin;
                        display.camera.zoom = view.zoom;
                        started.running.send(&HostMessage::Camera {
                            tab,
                            origin: view.origin,
                            zoom: view.zoom,
                        });
                    }
                    None if job.started.elapsed() < 2 * RESTORE_WAIT => {
                        waiting.push((app, tab, view));
                    }
                    None => {}
                }
            }
            job.cameras = waiting;
            if job.cameras.is_empty() {
                // Restored: what arrives now is the workspace as it was saved.
                self.flows.settle = Settle::Waiting;
                return;
            }
        }
        self.flows.restore = Some(job);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reported(id: &str, path: Option<&str>) -> protocol::TabEntry {
        protocol::TabEntry {
            id: id.to_string(),
            label: id.to_string(),
            dirty: false,
            close_waits: false,
            path: path.map(str::to_string),
            saves: true,
        }
    }

    fn wanted(path: Option<&str>) -> RestoreTab {
        RestoreTab {
            path: path.map(str::to_string),
            camera: None,
        }
    }

    /// Catches reopened tabs matched to the wrong file when the
    /// sub-application reports them in another order.
    #[test]
    fn reopened_tabs_match_by_file_then_in_order() {
        let ids = match_tabs(
            &[wanted(Some("/b")), wanted(None), wanted(Some("/a"))],
            &[
                reported("1", Some("/a")),
                reported("2", None),
                reported("3", Some("/b")),
            ],
        );
        assert_eq!(
            ids,
            vec![Some("3".to_string()), Some("2".to_string()), Some("1".to_string())]
        );
    }
}
