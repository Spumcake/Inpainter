//! The host window. The title is always Inpainter. It runs every started
//! sub-application, shows all of their tabs, and draws the selected tab's
//! toolbar, menu, panel, and contents from what that tab's sub-application
//! declared. Its frame never waits on a sub-application.

use crate::canvas::{CANVAS, Surface};
use crate::doc::{Doc, Live};
use crate::panel::Sent;
use crate::process::Running;
use crate::tablet::Tablet;
use crate::tabs::{StripTab, TabEvent};
use crate::{ask, grid, icons, panel, tabs, toolbar, widgets};
use eframe::egui::{self, Color32, Event, Key, Rect};
use protocol::{Action, ContentsKind, FileKind, HostMessage, PanelSide};

/// The application id: the desktop file, icon, and file-type names on Linux.
pub const APP_ID: &str = "io.github.spumcake.Inpainter";

/// The window icon, for desktops that show one. Wayland desktops take the
/// icon from the launcher entry instead.
fn window_icon() -> egui::IconData {
    eframe::icon_data::from_png_bytes(include_bytes!("../assets/icon/128.png")).unwrap_or_default()
}

/// A started sub-application: the name its manifest gives, and its process.
pub struct Started {
    pub name: String,
    pub running: Running,
}

pub fn run(apps: Vec<Started>) -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Inpainter")
            // The desktop matches the window to its launcher entry and icon by
            // this id, which is the desktop file's name.
            .with_app_id(APP_ID)
            .with_icon(window_icon())
            .with_inner_size([1280.0, 800.0])
            .with_min_inner_size([640.0, 480.0]),
        persist_window: false,
        // Ink is painted as raw meshes, which egui does not feather.
        multisampling: 4,
        ..Default::default()
    };
    eframe::run_native(
        "Inpainter",
        options,
        Box::new(move |creation| Ok(Box::new(HostWindow::new(creation, apps)))),
    )
}

struct HostWindow {
    apps: Vec<Started>,
    /// The sub-application whose tab is shown.
    selected: usize,
    surface: Surface,
    live: Live,
    /// The tab drawn last frame, so a switch ends what was dragged on it.
    shown: Option<(usize, String)>,
    /// The panel of a tab that declares the panel but no properties.
    panel_open: bool,
    viewport: [f64; 2],
    /// Which sub-applications were told the contents area's size.
    viewport_sent: Vec<bool>,
    /// File dialogs open in the real window. Frame tests answer them instead.
    native_dialogs: bool,
    /// The window's close was pressed and sub-applications are resolving
    /// their unsaved work.
    quitting: bool,
    /// Ctrl/Cmd+C, X, or V already arrived as a copy, cut, or paste event.
    /// The key-up still comes through, and must not run the command again.
    copy_press: bool,
    cut_press: bool,
    paste_press: bool,
}

impl HostWindow {
    fn new(creation: &eframe::CreationContext<'_>, apps: Vec<Started>) -> Self {
        // Safety: `on_exit` disconnects before eframe closes the display.
        let tablet = unsafe { Tablet::connect(creation) };
        let mut window = Self::with_apps(&creation.egui_ctx, apps, tablet);
        window.native_dialogs = true;
        window
    }

    fn with_apps(ctx: &egui::Context, apps: Vec<Started>, tablet: Tablet) -> Self {
        toolbar::install_fonts(ctx);
        // The window's own chrome is light. The title bar is left to the
        // desktop: egui would otherwise copy its light theme onto the window,
        // and with no theme set, winit's Wayland frame reads the desktop's
        // color scheme while other platforms draw their own.
        ctx.options_mut(|options| options.sync_window_theme = false);
        ctx.set_theme(egui::Theme::Light);
        for app in &apps {
            app.running.attach(ctx);
        }
        let count = apps.len();
        Self {
            apps,
            selected: 0,
            surface: Surface::new(tablet),
            live: Live::default(),
            shown: None,
            panel_open: false,
            viewport: [0.0, 0.0],
            viewport_sent: vec![false; count],
            native_dialogs: false,
            quitting: false,
            copy_press: false,
            cut_press: false,
            paste_press: false,
        }
    }

    /// The selected sub-application's shown tab id.
    fn active_tab(&self) -> Option<String> {
        self.apps.get(self.selected)?.running.tabs().1
    }

    /// The contents a tab shows. A tab a sub-application reported after its
    /// greeting shows what the greeting declared for its first tab.
    fn contents(&self, app: usize, tab: &str) -> Option<ContentsKind> {
        let declaration = self.apps.get(app)?.running.declaration();
        declaration
            .contents
            .iter()
            .find(|contents| contents.tab == tab)
            .or_else(|| declaration.contents.first())
            .map(|contents| contents.kind)
    }

    /// The properties panel is the host's, drawn only for a tab whose
    /// sub-application declares it. Only the right side has a reference.
    fn has_panel(&self, app: usize, tab: &str) -> bool {
        let Some(started) = self.apps.get(app) else {
            return false;
        };
        let declaration = started.running.declaration();
        declaration
            .panels
            .iter()
            .find(|panel| panel.tab == tab)
            .or_else(|| declaration.panels.first())
            .is_some_and(|panel| matches!(panel.side, PanelSide::Right))
    }

    fn send(&mut self, app: usize, message: HostMessage) {
        if let Some(started) = self.apps.get_mut(app) {
            started.running.send(&message);
        }
    }

    /// Runs a declared action of the selected sub-application. The drawing
    /// surface's own commands act on the tab's camera.
    fn run_action(&mut self, action: &Action) {
        let app = self.selected;
        let Some(tab) = self.active_tab() else {
            return;
        };
        if action.id == "window.maximize" {
            return;
        }
        let viewport = self.viewport;
        let mut out = Vec::new();
        {
            let Some(started) = self.apps.get_mut(app) else {
                return;
            };
            let declared = &mut started.running.declared;
            let canvas = declared.canvas.as_ref().filter(|canvas| canvas.tab == tab);
            match declared.documents.get_mut(&tab) {
                Some(display) => {
                    let mut doc = Doc {
                        tab: &tab,
                        display,
                        canvas,
                        out: &mut out,
                        live: &mut self.live,
                        viewport,
                    };
                    doc.run(action, None);
                }
                None => out.push(HostMessage::Command {
                    id: action.id.clone(),
                    tab: Some(tab.clone()),
                    arg: action.arg.clone(),
                    node: None,
                    viewport,
                }),
            }
        }
        for message in out {
            self.send(app, message);
        }
        self.send_camera();
    }

    /// The camera the drawing surface moved this frame, reported once.
    fn send_camera(&mut self) {
        if !self.live.moved {
            return;
        }
        self.live.moved = false;
        let app = self.selected;
        let Some(tab) = self.active_tab() else {
            return;
        };
        let Some(camera) = self
            .apps
            .get(app)
            .and_then(|started| started.running.declared.documents.get(&tab))
            .map(|display| display.camera)
        else {
            return;
        };
        self.send(
            app,
            HostMessage::Camera {
                tab,
                origin: camera.origin,
                zoom: camera.zoom,
            },
        );
    }

    /// The window's close: each sub-application resolves its unsaved work
    /// first. The window closes once every one is ready or has exited. A
    /// cancelled question leaves the window open; pressing close again asks again.
    fn note_window_close(&mut self, ctx: &egui::Context) {
        let requested = ctx.input(|input| input.viewport().close_requested());
        if requested {
            self.quitting = true;
            for started in &mut self.apps {
                if !started.running.declared.quit_ready {
                    started.running.send(&HostMessage::Quit);
                }
            }
        }
        if !self.quitting {
            return;
        }
        let ready = self
            .apps
            .iter()
            .all(|started| started.running.exited() || started.running.declared.quit_ready);
        if ready {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        } else if requested {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
        }
    }

    /// Opens the file dialogs sub-applications asked for, and answers them.
    fn resolve_dialogs(&mut self, frame: &mut eframe::Frame) {
        if !self.native_dialogs {
            return;
        }
        for app in 0..self.apps.len() {
            while let Some(request) = self.apps[app].running.declared.files.pop_front() {
                let folder = request.folder.as_deref().map(std::path::Path::new);
                let path = match request.kind {
                    FileKind::Open => {
                        crate::dialogs::pick_open(frame, folder, request.filter.as_ref())
                    }
                    FileKind::Save => crate::dialogs::pick_save(
                        frame,
                        folder,
                        request.name.as_deref().unwrap_or_default(),
                        request.filter.as_ref(),
                    ),
                };
                self.send(
                    app,
                    HostMessage::FileResult {
                        id: request.id,
                        path: path.map(|path| path.display().to_string()),
                    },
                );
            }
        }
    }

    /// The one question shown: the selected sub-application's first.
    fn show_asks(&mut self, ctx: &egui::Context) {
        let order: Vec<usize> = std::iter::once(self.selected)
            .chain((0..self.apps.len()).filter(|app| *app != self.selected))
            .collect();
        for app in order {
            let Some(question) = self.apps[app].running.declared.ask.clone() else {
                continue;
            };
            if let Some(button) = ask::show(ctx, app, &question) {
                self.apps[app].running.declared.ask = None;
                self.send(
                    app,
                    HostMessage::Answer {
                        id: question.id,
                        button,
                    },
                );
            }
            return;
        }
    }

    /// Shortcuts the selected sub-application declared, and the window's
    /// clipboard events. Escape ends what the drawing surface is doing.
    fn handle_keys(&mut self, ctx: &egui::Context, editing_text: bool) -> Vec<Action> {
        let Some(started) = self.apps.get(self.selected) else {
            return Vec::new();
        };
        let keys = started.running.declared.keys.clone();
        // A name, the size field, or text being typed owns these keys.
        // The press is still noted, so the key-up after editing ends does not
        // copy the objects.
        let editing = ctx.text_edit_focused() || editing_text;
        let frame = ctx.input(clipboard_frame);
        let mut clipboard = Vec::new();
        take_clipboard(
            &mut clipboard,
            keys.copy.as_ref(),
            frame.copy,
            frame.copy_up,
            &mut self.copy_press,
            !editing,
        );
        take_clipboard(
            &mut clipboard,
            keys.cut.as_ref(),
            frame.cut,
            frame.cut_up,
            &mut self.cut_press,
            !editing,
        );
        take_clipboard(
            &mut clipboard,
            keys.paste.as_ref(),
            frame.paste,
            frame.paste_up,
            &mut self.paste_press,
            !editing,
        );
        if editing {
            return Vec::new();
        }
        let shift = ctx.input(|input| input.modifiers.shift);
        let mut actions = clipboard.clone();
        let pressed: Vec<Action> = ctx.input(|input| {
            keys.bindings
                .iter()
                .filter(|binding| icons::chord_pressed(input, &binding.chord))
                .map(|binding| binding.action.clone())
                .collect()
        });
        for action in pressed {
            // The window never delivers the key-down for these three. When a
            // frame does, the clipboard path above already ran them.
            if clipboard.iter().any(|done| done.id == action.id) {
                continue;
            }
            if action.id == "window.maximize" {
                let maximized = ctx.input(|input| input.viewport().maximized.unwrap_or(false));
                ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
                continue;
            }
            // A command with no argument of its own is sent with Shift, so a
            // nudge can step farther.
            let action = if action.arg.is_none() {
                action.with_value(serde_json::json!(shift))
            } else {
                action
            };
            actions.push(action);
        }
        // Undo, redo, and nudge wait while a selection is dragged.
        if self.surface.transforming() {
            actions.clear();
        }
        actions
    }
}

impl eframe::App for HostWindow {
    fn raw_input_hook(&mut self, ctx: &egui::Context, raw_input: &mut egui::RawInput) {
        self.surface.tablet.feed(ctx, raw_input);
    }

    fn on_exit(&mut self) {
        self.surface.tablet.disconnect();
        for started in std::mem::take(&mut self.apps) {
            started.running.shutdown();
        }
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        CANVAS.to_normalized_gamma_f32()
    }

    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let mut pending = false;
        for started in &mut self.apps {
            started.running.poll();
            pending |= started.running.pending();
        }
        if pending {
            ctx.request_repaint();
        }
        // Pings go out every second, and a missing answer shows a notice.
        ctx.request_repaint_after(std::time::Duration::from_millis(500));
        self.note_window_close(&ctx);
        self.resolve_dialogs(frame);

        let app = self.selected.min(self.apps.len().saturating_sub(1));
        self.selected = app;
        let tab = self.active_tab();
        let shown = tab.clone().map(|tab| (app, tab));
        if shown != self.shown {
            self.surface.reset();
            self.live.reset();
            self.shown = shown;
        }

        // Read before the tab bar runs: a click outside the menu closes it there.
        let dismissing = egui::Popup::is_any_open(&ctx);
        let mut visuals = egui::Visuals::light();
        visuals.panel_fill = Color32::WHITE;
        ctx.set_visuals(visuals);

        let mut chosen: Vec<Action> = Vec::new();
        let mut sent: Vec<Sent> = Vec::new();
        egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                let strip = self.strip();
                let (menu, plus_tip) = match self.apps.get(app) {
                    Some(started) => (
                        started.running.declared.menu.clone(),
                        started
                            .running
                            .declared
                            .tabs
                            .as_ref()
                            .filter(|tabs| tabs.new_tab.is_some())
                            .map(|tabs| tabs.new_tab_tip.clone()),
                    ),
                    None => (Vec::new(), None),
                };
                for event in tabs::show(ui, &strip, &menu, plus_tip.as_deref()) {
                    match event {
                        TabEvent::Menu(action) => chosen.push(action),
                        TabEvent::Select { app, tab } => {
                            self.selected = app;
                            self.send(
                                app,
                                HostMessage::Command {
                                    id: "select_tab".to_string(),
                                    tab: Some(tab),
                                    arg: None,
                                    node: None,
                                    viewport: self.viewport,
                                },
                            );
                        }
                        TabEvent::Close { app, tab } => self.send(
                            app,
                            HostMessage::Command {
                                id: "close_tab".to_string(),
                                tab: Some(tab),
                                arg: None,
                                node: None,
                                viewport: self.viewport,
                            },
                        ),
                        TabEvent::Plus => {
                            if let Some(action) = self.apps.get(app).and_then(|started| {
                                started.running.declared.tabs.as_ref()?.new_tab.clone()
                            }) {
                                chosen.push(action);
                            }
                        }
                    }
                }
                let toolbar = self
                    .apps
                    .get(app)
                    .and_then(|started| started.running.declared.toolbar.clone());
                chosen.extend(toolbar::show(ui, toolbar.as_ref()));

                let full = ui.available_rect_before_wrap();
                let Some(tab) = tab.clone() else {
                    ui.painter().rect_filled(full, 0.0, CANVAS);
                    return;
                };
                let properties = self
                    .apps
                    .get(app)
                    .and_then(|started| started.running.declared.properties.clone());
                // A tab without a declared panel has no panel tab, and F4
                // does nothing there.
                let has_panel = self.has_panel(app, &tab);
                let editing_text = self.editing_text(app, &tab);
                // F4 can open the panel. Split after the keys so that frame
                // gives the panel its width and narrows the contents.
                chosen.extend(self.handle_keys(&ctx, editing_text));
                if properties.is_none() {
                    if !has_panel {
                        self.panel_open = false;
                    }
                    if has_panel && ui.input(icons::panel_shortcut_pressed) {
                        self.panel_open = !self.panel_open;
                    }
                }
                let open = has_panel
                    && properties
                        .as_ref()
                        .map_or(self.panel_open, |properties| properties.open);
                let panel_w = if open { panel::WIDTH } else { 0.0 };
                let right = if panel_w == 0.0 {
                    full.right()
                } else {
                    (full.right() - panel_w).max(full.left())
                };
                let rect = Rect::from_min_max(full.min, egui::pos2(right, full.bottom()));
                self.viewport = [f64::from(rect.width()), f64::from(rect.height())];
                if self.viewport[0] > 1.0
                    && self.viewport[1] > 1.0
                    && !self.viewport_sent.get(app).copied().unwrap_or(true)
                {
                    self.viewport_sent[app] = true;
                    let viewport = self.viewport;
                    self.send(app, HostMessage::Viewport { viewport });
                }

                match self.contents(app, &tab) {
                    Some(ContentsKind::Canvas) => self.show_canvas(ui, app, &tab, rect, dismissing),
                    Some(ContentsKind::Grid) => {
                        let painter = ui.painter().with_clip_rect(rect);
                        painter.rect_filled(rect, 0.0, CANVAS);
                        // As `Camera::centered` sets a new sketch: origin in
                        // the middle of the area, zoom 1.
                        let origin = [-self.viewport[0] / 2.0, -self.viewport[1] / 2.0];
                        grid::paint_grid(&painter, rect, origin, 1.0);
                    }
                    None => {
                        ui.painter()
                            .with_clip_rect(rect)
                            .rect_filled(rect, 0.0, CANVAS);
                    }
                }
                self.paint_status(ui, app, rect);

                // A menu's Properties can open the panel after this frame was
                // split with no room for it. It then waits for the next frame,
                // which gives it its width.
                if open && panel_w > 0.0 {
                    let panel_rect =
                        Rect::from_min_max(egui::pos2(rect.right(), full.top()), full.max);
                    sent.extend(panel::show(ui, properties.as_ref(), panel_rect));
                } else if open {
                    ui.ctx().request_repaint();
                }
                if has_panel {
                    let tip = properties
                        .as_ref()
                        .map_or_else(icons::panel_tip, |properties| properties.tip.clone());
                    if panel::toggle_tab(ui.ctx(), open, &tip, rect.right(), full.top()) {
                        match &properties {
                            Some(properties) => chosen.push(properties.toggle.clone()),
                            None => self.panel_open = !self.panel_open,
                        }
                    }
                }
            });

        for action in chosen {
            self.run_action(&action);
        }
        for item in sent {
            match item {
                Sent::Run(action) => self.run_action(&action),
                Sent::Property {
                    prop,
                    value,
                    preview,
                } => {
                    let value = serde_json::to_value(value).unwrap_or_default();
                    self.send(
                        app,
                        HostMessage::Property {
                            prop,
                            value,
                            preview,
                        },
                    );
                }
            }
        }
        self.send_camera();
        self.show_asks(&ctx);
    }
}

impl HostWindow {
    /// Every running sub-application's tabs, in the order their programs
    /// started, then in the order each reports them.
    fn strip(&self) -> Vec<StripTab> {
        let mut strip = Vec::new();
        for (index, started) in self.apps.iter().enumerate() {
            let (tabs, active) = started.running.tabs();
            for tab in tabs {
                strip.push(StripTab {
                    app: index,
                    active: index == self.selected && active.as_deref() == Some(tab.id.as_str()),
                    id: tab.id,
                    label: tab.label,
                    close_waits: tab.close_waits,
                    unsaved: tab.dirty,
                });
            }
        }
        strip
    }

    fn editing_text(&self, app: usize, tab: &str) -> bool {
        self.apps
            .get(app)
            .and_then(|started| started.running.declared.canvas.as_ref())
            .filter(|canvas| canvas.tab == tab)
            .is_some_and(|canvas| canvas.caret.is_some())
    }

    /// The drawing surface for the tab's display copy.
    fn show_canvas(
        &mut self,
        ui: &mut egui::Ui,
        app: usize,
        tab: &str,
        rect: Rect,
        dismissing: bool,
    ) {
        let viewport = self.viewport;
        let mut out = Vec::new();
        let escape = ui.input(|input| input.key_pressed(Key::Escape));
        {
            let Some(started) = self.apps.get_mut(app) else {
                return;
            };
            let declared = &mut started.running.declared;
            let canvas = declared.canvas.as_ref().filter(|canvas| canvas.tab == tab);
            let Some(display) = declared.documents.get_mut(tab) else {
                let painter = ui.painter().with_clip_rect(rect);
                painter.rect_filled(rect, 0.0, CANVAS);
                return;
            };
            let mut doc = Doc {
                tab,
                display,
                canvas,
                out: &mut out,
                live: &mut self.live,
                viewport,
            };
            self.surface.commit_text_on_outside_press(ui, &mut doc);
            if escape && !ui.ctx().text_edit_focused() || escape && doc.text_editing() {
                self.surface.escape(&mut doc);
            }
            self.surface.show(ui, &mut doc, rect, dismissing);
        }
        for message in out {
            self.send(app, message);
        }
    }

    /// The approved notices: the sub-application has exited, or is not
    /// responding. The rest of the window stays usable under them.
    fn paint_status(&self, ui: &egui::Ui, app: usize, rect: Rect) {
        let Some(started) = self.apps.get(app) else {
            return;
        };
        let running = &started.running;
        let (text, ring) = if running.exited() && !running.pending() && self.has_started(app) {
            (format!("{} has exited.", started.name), false)
        } else if running.not_responding() {
            (format!("{} is not responding.", started.name), true)
        } else {
            return;
        };
        let painter = ui.painter().with_clip_rect(rect);
        let font = egui::FontId::proportional(17.0);
        let galley = painter.layout_no_wrap(text, font, widgets::MUTED);
        let ring_w = if ring { 30.0 } else { 0.0 };
        let left = rect.center().x - (galley.size().x + ring_w) / 2.0;
        let top = rect.center().y - galley.size().y / 2.0;
        if ring {
            painter.circle_stroke(
                egui::pos2(left + 9.0, rect.center().y),
                8.0,
                egui::Stroke::new(2.0, widgets::MUTED),
            );
        }
        painter.galley(egui::pos2(left + ring_w, top), galley, widgets::MUTED);
    }

    /// A sub-application that declared itself and then exited, as opposed to
    /// none started at all.
    fn has_started(&self, app: usize) -> bool {
        self.apps
            .get(app)
            .is_some_and(|started| !started.running.declaration().tabs.is_empty())
    }
}

struct ClipboardFrame {
    copy: bool,
    cut: bool,
    paste: bool,
    copy_up: bool,
    cut_up: bool,
    paste_up: bool,
}

fn clipboard_frame(input: &egui::InputState) -> ClipboardFrame {
    let mut frame = ClipboardFrame {
        copy: false,
        cut: false,
        paste: false,
        copy_up: false,
        cut_up: false,
        paste_up: false,
    };
    for event in &input.events {
        match event {
            Event::Copy => frame.copy = true,
            Event::Cut => frame.cut = true,
            Event::Paste(_) => frame.paste = true,
            Event::Key {
                key,
                pressed: false,
                modifiers,
                ..
            } if modifiers.command => match key {
                Key::C => frame.copy_up = true,
                Key::X => frame.cut_up = true,
                Key::V => frame.paste_up = true,
                _ => {}
            },
            _ => {}
        }
    }
    frame
}

/// egui-winit replaces Ctrl/Cmd+C, X, and V with copy, cut, and paste
/// events and drops the key-down, so the chord check never sees them.
/// Paste is left out entirely when the operating-system clipboard is
/// empty. The key-up still arrives. Run the declared action from the
/// event, or from that key-up when the event never came. `run` is false
/// while a text field owns the keys.
fn take_clipboard(
    actions: &mut Vec<Action>,
    action: Option<&Action>,
    press: bool,
    release: bool,
    seen: &mut bool,
    run: bool,
) {
    let Some(action) = action else {
        return;
    };
    if press {
        *seen = true;
        if run {
            actions.push(action.clone());
        }
    }
    if release {
        let already = *seen;
        *seen = false;
        if run && !already {
            actions.push(action.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{HostWindow, Started};
    use crate::process::Running;
    use crate::tablet::Tablet;
    use eframe::App;
    use eframe::egui::{self, Event, Key, PointerButton, Pos2, Rect};

    const SCREEN: egui::Vec2 = egui::vec2(1280.0, 800.0);

    /// Runs whole frames of the host window with synthetic pointer input.
    struct Harness {
        ctx: egui::Context,
        app: HostWindow,
        frame: eframe::Frame,
        /// Every command the frames sent to the native window.
        window_commands: Vec<egui::ViewportCommand>,
    }

    impl Harness {
        fn new() -> Self {
            let ctx = egui::Context::default();
            let started = Started {
                name: "Template".to_string(),
                running: Running::declared(template()),
            };
            let app = HostWindow::with_apps(&ctx, vec![started], Tablet::none());
            let mut harness = Self {
                ctx,
                app,
                frame: eframe::Frame::_new_kittest(),
                window_commands: Vec::new(),
            };
            harness.step(Vec::new());
            harness.step(Vec::new());
            harness
        }

        fn step(&mut self, events: Vec<Event>) {
            let input = egui::RawInput {
                screen_rect: Some(Rect::from_min_size(Pos2::ZERO, SCREEN)),
                events,
                ..Default::default()
            };
            let Self {
                ctx,
                app,
                frame,
                window_commands,
            } = self;
            let mut output = ctx.run_ui(input, |ui| app.ui(ui, frame));
            // Nothing renders here, so the texture uploads are dropped.
            output.textures_delta.clear();
            for viewport in output.viewport_output.into_values() {
                window_commands.extend(viewport.commands);
            }
        }

        /// Moves to `from`, presses, drags to `to`, and releases, a frame each.
        fn drag(&mut self, from: Pos2, to: Pos2) {
            self.step(vec![Event::PointerMoved(from)]);
            self.step(vec![button(from, true)]);
            self.step(vec![Event::PointerMoved(to)]);
            self.step(vec![button(to, false)]);
            self.step(Vec::new());
        }
    }

    /// What the template declares: one tab, the grid, and the panel on the right.
    fn template() -> Vec<protocol::AppMessage> {
        use protocol::{AppMessage, ContentsKind, PanelSide};
        vec![
            AppMessage::Hello {
                protocol: protocol::PROTOCOL_VERSION,
            },
            AppMessage::Tab {
                id: "template".into(),
                label: "Template".into(),
            },
            AppMessage::Contents {
                tab: "template".into(),
                kind: ContentsKind::Grid,
            },
            AppMessage::Panel {
                tab: "template".into(),
                side: PanelSide::Right,
            },
            AppMessage::End,
        ]
    }

    fn button(pos: Pos2, pressed: bool) -> Event {
        Event::PointerButton {
            pos,
            button: PointerButton::Primary,
            pressed,
            modifiers: egui::Modifiers::NONE,
        }
    }

    fn click(harness: &mut Harness, at: Pos2) {
        harness.step(vec![Event::PointerMoved(at)]);
        harness.step(vec![button(at, true)]);
        harness.step(vec![button(at, false)]);
        harness.step(Vec::new());
    }

    /// The panel tab's center: 18 points below the canvas top, which is under
    /// the 40-point tab bar and the 50-point toolbar, and 11 points in from
    /// the canvas's right edge.
    fn tab_center(canvas_right: f32) -> Pos2 {
        Pos2::new(canvas_right - 11.0, 40.0 + 50.0 + 18.0 + 20.0)
    }

    fn key_press(key: Key) -> Event {
        Event::Key {
            key,
            physical_key: None,
            pressed: true,
            repeat: false,
            modifiers: egui::Modifiers::NONE,
        }
    }

    #[test]
    fn the_title_bar_is_left_to_the_desktop_theme() {
        let mut harness = Harness::new();
        harness.drag(Pos2::new(400.0, 400.0), Pos2::new(480.0, 440.0));
        let themed = harness
            .window_commands
            .iter()
            .any(|command| matches!(command, egui::ViewportCommand::SetTheme(_)));
        assert!(!themed, "a frame set the window theme");
    }

    #[test]
    fn the_panel_tab_toggles_the_panel_without_drawing() {
        let mut harness = Harness::new();
        assert!(!harness.app.panel_open);
        harness.drag(
            tab_center(SCREEN.x) - egui::vec2(6.0, 12.0),
            tab_center(SCREEN.x) + egui::vec2(6.0, 12.0),
        );

        click(&mut harness, tab_center(SCREEN.x));
        assert!(harness.app.panel_open);

        click(&mut harness, tab_center(SCREEN.x - crate::panel::WIDTH));
        assert!(!harness.app.panel_open);
    }

    #[test]
    fn f4_opens_the_panel_and_narrows_the_canvas() {
        let mut harness = Harness::new();
        let wide = harness.app.viewport[0];
        assert!(!harness.app.panel_open);
        assert!(wide > 1000.0, "canvas width {wide}");

        harness.step(vec![key_press(Key::F4)]);
        assert!(harness.app.panel_open);
        let narrow = harness.app.viewport[0];
        assert!(
            narrow < wide - 200.0,
            "open panel left the canvas at {narrow}, from {wide}"
        );

        harness.step(vec![key_press(Key::F4)]);
        assert!(!harness.app.panel_open);
        assert!((harness.app.viewport[0] - wide).abs() < 1.0);
    }
}
