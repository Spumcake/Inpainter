//! The mission's assistant checks, run against real sub-application
//! processes and a scripted stand-in for OpenRouter, so they spend nothing.
//!
//! The stand-in sub-application below declares a skill that nothing in the
//! host or the assistant was written for. These checks need `cargo build`
//! first, because they start the built `template` program.

use super::{HostWindow, Started};
use crate::chat::ChatEvent;
use crate::process::Running;
use crate::tablet::Tablet;
use crate::workspace::ModelChoice;
use assistant::{Assistant, Config, Role};
use eframe::App;
use eframe::egui::{self, Pos2, Rect};
use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// A sub-application with one skill no source names: it stamps a glyph.
const QUILL: &str = r#"#!/bin/sh
echo '{"type":"hello","protocol":1}'
echo '{"type":"tab","id":"q1","label":"Quill Board"}'
echo '{"type":"contents","tab":"q1","kind":"grid"}'
echo '{"type":"end"}'
echo '{"type":"skills","skills":[{"id":"quill","name":"Quill","description":"Stamps one glyph on the board.","instructions":"Pass the glyph to stamp.","tools":[{"name":"stamp_glyph","description":"Stamp a glyph.","input":{"type":"object","properties":{"glyph":{"type":"string"}},"required":["glyph"]}}]}]}'
while IFS= read -r line; do
  case "$line" in
    *'"type":"ping"'*) echo '{"type":"pong"}' ;;
    *'"type":"shutdown"'*) exit 0 ;;
    *'"type":"quit"'*) echo '{"type":"quit_ready"}' ;;
    *'"type":"invoke"'*)
      call=$(printf '%s' "$line" | sed 's/.*"call":"\([^"]*\)".*/\1/')
      echo "{\"type\":\"result\",\"call\":\"$call\",\"ok\":true,\"output\":{\"stamped\":\"quill-mark-7\"}}" ;;
  esac
done
"#;

fn built(program: &str) -> PathBuf {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../target/debug")
        .join(program);
    assert!(path.exists(), "{} is missing: run `cargo build` first", path.display());
    path
}

fn quill_program(dir: &Path) -> PathBuf {
    let path = dir.join("quill");
    std::fs::write(&path, QUILL).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    path
}

/// A folder of the check's own, which it removes when done.
fn scratch(name: &str) -> PathBuf {
    let base = std::env::var_os("TMPDIR").map_or_else(std::env::temp_dir, PathBuf::from);
    let dir = base.join(format!("inpainter-checks-{}-{name}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A scripted OpenRouter: every chat request is recorded, and answered with
/// the next scripted reply.
struct StandIn {
    url: String,
    requests: Arc<Mutex<Vec<Value>>>,
    replies: Arc<Mutex<std::collections::VecDeque<Value>>>,
}

impl StandIn {
    fn start(replies: Vec<Value>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let seen = requests.clone();
        let replies = Arc::new(Mutex::new(replies.into_iter().collect::<std::collections::VecDeque<_>>()));
        let script = replies.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { return };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request_line = String::new();
                reader.read_line(&mut request_line).unwrap();
                let mut length = 0;
                loop {
                    let mut header = String::new();
                    reader.read_line(&mut header).unwrap();
                    if header.trim().is_empty() {
                        break;
                    }
                    if let Some((name, value)) = header.split_once(':')
                        && name.eq_ignore_ascii_case("content-length")
                    {
                        length = value.trim().parse().unwrap();
                    }
                }
                let mut body = vec![0; length];
                reader.read_exact(&mut body).unwrap();
                let reply = if request_line.starts_with("GET") {
                    json!({"data": []})
                } else {
                    seen.lock()
                        .unwrap()
                        .push(serde_json::from_slice(&body).unwrap());
                    script
                        .lock()
                        .unwrap()
                        .pop_front()
                        .unwrap_or_else(|| text_reply("Nothing more."))
                };
                let body = reply.to_string();
                let _ = write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                );
            }
        });
        Self {
            url,
            requests,
            replies,
        }
    }

    /// Replaces the replies still to come.
    fn script(&self, replies: Vec<Value>) {
        *self.replies.lock().unwrap() = replies.into_iter().collect();
    }

    fn requests(&self) -> Vec<Value> {
        self.requests.lock().unwrap().clone()
    }
}

fn text_reply(text: &str) -> Value {
    json!({"choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]})
}

fn call_reply(name: &str, arguments: Value) -> Value {
    json!({"choices": [{"message": {"role": "assistant", "content": null, "tool_calls": [
        {"id": "t1", "type": "function", "function": {"name": name, "arguments": arguments.to_string()}}
    ]}, "finish_reason": "tool_calls"}]})
}

/// The real window, its frames run by hand, with the assistant pointed at
/// the stand-in.
struct Window {
    ctx: egui::Context,
    app: HostWindow,
    frame: eframe::Frame,
}

impl Window {
    fn new(apps: Vec<Started>, stand_in: &StandIn) -> Self {
        let ctx = egui::Context::default();
        let mut app = HostWindow::with_apps(&ctx, apps, Tablet::none());
        let wake_ctx = ctx.clone();
        app.assistant = Assistant::spawn(Config {
            base_url: stand_in.url.clone(),
            api_key: Some(String::from("stand-in")),
            wake: Arc::new(move || wake_ctx.request_repaint()),
        });
        app.chat.model = Some(ModelChoice {
            id: String::from("stand-in/model"),
            name: String::from("Stand-in"),
        });
        let mut window = Self {
            ctx,
            app,
            frame: eframe::Frame::_new_kittest(),
        };
        // Every application here declares skills just after its greeting.
        window.until(|app| {
            app.apps
                .iter()
                .all(|started| !started.running.pending() && !started.running.declared.skills.is_empty())
        });
        window
    }

    fn step(&mut self) {
        let input = egui::RawInput {
            screen_rect: Some(Rect::from_min_size(Pos2::ZERO, egui::vec2(1280.0, 800.0))),
            ..Default::default()
        };
        let Self { ctx, app, frame } = self;
        let mut output = ctx.run_ui(input, |ui| app.ui(ui, frame));
        output.textures_delta.clear();
    }

    fn until(&mut self, done: impl Fn(&HostWindow) -> bool) {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(20) {
            for started in &mut self.app.apps {
                started.running.poll();
            }
            self.step();
            if done(&self.app) {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let state: Vec<String> = self
            .app
            .apps
            .iter()
            .map(|started| {
                format!(
                    "{} pending={} exited={} tabs={:?} quit_ready={} ask={:?}",
                    started.id,
                    started.running.pending(),
                    started.running.exited(),
                    started.running.tabs(),
                    started.running.declared.quit_ready,
                    started.running.declared.ask.as_ref().map(|ask| &ask.title),
                )
            })
            .collect();
        panic!(
            "the window never got there: workspace {:?}, question {:?}, {} entries, {state:#?}",
            self.app.flows.path,
            self.app.flows.question_shown(),
            self.app.chat.conversation.len()
        );
    }

    /// Types `text` in the chat and sends it, as the person does.
    fn ask(&mut self, text: &str) {
        self.app.chat.input = text.to_string();
        let ctx = self.ctx.clone();
        let Self { app, frame, .. } = self;
        let before = app.chat.conversation.len();
        app.chat_event(ChatEvent::Send, &ctx, frame);
        // A short request can start and end between two frames, so wait for
        // its reply rather than for the working state.
        self.until(move |app| {
            !app.chat.working
                && app.chat.conversation[before..]
                    .iter()
                    .any(|entry| matches!(entry.role, Role::Assistant | Role::Note))
        });
    }

    fn select(&mut self, app_id: &str) {
        let index = self
            .app
            .apps
            .iter()
            .position(|started| started.id == app_id)
            .unwrap();
        self.app.selected = index;
        self.step();
    }
}

fn start(id: &str, name: &str, program: &Path) -> Started {
    Started {
        id: id.to_string(),
        name: name.to_string(),
        executable: Some(program.to_path_buf()),
        running: Running::start(program, None, false),
    }
}

fn offered(request: &Value) -> Vec<String> {
    let mut names: Vec<String> = request["tools"]
        .as_array()
        .map(|tools| {
            tools
                .iter()
                .map(|tool| tool["function"]["name"].as_str().unwrap().to_string())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

fn declared(app: &HostWindow) -> Vec<String> {
    let mut names: Vec<String> = app
        .apps
        .iter()
        .flat_map(|started| {
            started.running.declared.skills.iter().flat_map(move |skill| {
                skill
                    .tools
                    .iter()
                    .map(move |tool| protocol::tool_key(&started.id, &skill.id, &tool.name))
            })
        })
        .collect();
    names.sort();
    names
}

/// Catches an assistant whose knowledge of an application is written into
/// its prompts or code: a skill nothing was written for is offered, chosen,
/// routed to its own process, and its answer reaches the model.
#[test]
fn an_unknown_skill_is_offered_routed_and_answered() {
    let dir = scratch("unknown-skill");
    let quill = quill_program(&dir);
    let stand_in = StandIn::start(vec![
        call_reply("quillwork__quill__stamp_glyph", json!({"tab": "q1", "glyph": "*"})),
        text_reply("Stamped."),
    ]);
    let mut window = Window::new(
        vec![
            start("template", "Template", &built("template")),
            start("quillwork", "Quillwork", &quill),
        ],
        &stand_in,
    );
    window.select("template");
    window.ask("Stamp a star on the quill board.");

    let requests = stand_in.requests();
    assert_eq!(requests.len(), 2, "the model was asked twice: {requests:#?}");
    // Exactly the declared tools of every running application, no more.
    assert_eq!(offered(&requests[0]), declared(&window.app));
    assert!(offered(&requests[0]).contains(&"quillwork__quill__stamp_glyph".to_string()));
    // The quill program's own answer is what the model read next.
    assert!(
        requests[1].to_string().contains("quill-mark-7"),
        "the result never reached the model"
    );
    let last = window.app.chat.conversation.last().unwrap();
    assert_eq!((last.role, last.text.as_str()), (Role::Assistant, "Stamped."));
    let _ = std::fs::remove_dir_all(dir);
}

/// Catches a host that offers tools by an application's id: a stand-in
/// registered as `simple-sketch` is offered with its own skill only.
#[test]
fn a_stand_in_under_a_known_id_offers_only_its_own_skill() {
    let dir = scratch("known-id");
    let quill = quill_program(&dir);
    let stand_in = StandIn::start(vec![text_reply("Nothing to do.")]);
    let mut window = Window::new(vec![start("simple-sketch", "Simple Sketch", &quill)], &stand_in);
    window.ask("What can you do?");
    let requests = stand_in.requests();
    assert_eq!(offered(&requests[0]), vec!["simple-sketch__quill__stamp_glyph".to_string()]);
    let _ = std::fs::remove_dir_all(dir);
}

/// The marks the host draws for a tab: what Simple Sketch last sent it.
fn marks(app: &HostWindow, tab: &str) -> usize {
    app.apps[0].running.declared.documents[tab].sketch.scene(None).len()
}

/// Catches an assistant that works on its own copy, or a host that keeps a
/// history: the assistant's two shapes arrive as Simple Sketch's documents,
/// and one undo, sent as the person's own, takes the whole request back.
#[test]
fn the_assistants_work_is_simple_sketchs_and_one_undo_takes_it_back() {
    let stand_in = StandIn::start(Vec::new());
    let mut window = Window::new(
        vec![start("simple-sketch", "Simple Sketch", &built("simple-sketch"))],
        &stand_in,
    );
    let tab = window.app.apps[0].running.tabs().1.expect("a sketch is open");
    window.until(|app| app.apps[0].running.declared.documents.contains_key(&tab));
    let before = marks(&window.app, &tab);
    stand_in.script(vec![
        call_reply(
            "simple-sketch__draw__add_shape",
            json!({"tab": tab, "kind": "ellipse", "from": [0, 0], "to": [100, 100]}),
        ),
        call_reply(
            "simple-sketch__draw__add_shape",
            json!({"tab": tab, "kind": "rectangle", "from": [140, 0], "to": [240, 100]}),
        ),
        text_reply("Done."),
    ]);
    window.ask("Create a circle and a square next to each other.");
    let after = marks(&window.app, &tab);
    assert!(after >= before + 2, "the shapes never reached the host: {before} then {after}");
    let requests = stand_in.requests();
    assert!(requests[1].to_string().contains("\\\"ok\\\":true"), "the ellipse failed");

    // The person's undo, as the toolbar sends it.
    let index = 0;
    window.app.send(
        index,
        protocol::HostMessage::Command {
            id: String::from("undo"),
            tab: Some(tab.clone()),
            arg: None,
            node: None,
            viewport: [1280.0, 800.0],
        },
    );
    let expected = before;
    window.until(move |app| marks(app, &tab) == expected);
}

impl Window {
    /// Answers the save dialogs the sub-applications asked for, as the
    /// person would, with `path`.
    fn answer_saves(&mut self, path: &Path) {
        for app in 0..self.app.apps.len() {
            while let Some(request) = self.app.apps[app].running.declared.files.pop_front() {
                self.app.send(
                    app,
                    protocol::HostMessage::FileResult {
                        id: request.id,
                        path: Some(path.display().to_string()),
                    },
                );
            }
        }
    }

    fn logo(&mut self, choice: crate::chat::LogoChoice) {
        let ctx = self.ctx.clone();
        let Self { app, frame, .. } = self;
        app.logo(choice, &ctx, frame);
        self.step();
    }
}

/// Changes a saved sketch with no window: a separate Simple Sketch opens
/// it, adds a line, and saves it.
fn change_on_its_own(sketch: &Path) {
    use std::process::{Command as Program, Stdio};
    let mut child = Program::new(built("simple-sketch"))
        .arg(protocol::RESTORE_FLAG)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    let mut say = |message: protocol::HostMessage| {
        input
            .write_all(protocol::encode_host_message(&message).as_bytes())
            .unwrap();
        input.flush().unwrap();
    };
    let mut wait = |found: &dyn Fn(&protocol::AppMessage) -> bool| -> protocol::AppMessage {
        for line in lines.by_ref() {
            let message = protocol::parse_app_message(&line.unwrap()).unwrap();
            if found(&message) {
                return message;
            }
        }
        panic!("Simple Sketch stopped before answering");
    };
    wait(&|message| matches!(message, protocol::AppMessage::End));
    say(protocol::HostMessage::Open {
        path: Some(sketch.display().to_string()),
    });
    let protocol::AppMessage::Tabs(tabs) =
        wait(&|message| matches!(message, protocol::AppMessage::Tabs(tabs) if !tabs.tabs.is_empty()))
    else {
        unreachable!()
    };
    let tab = tabs.active.clone();
    say(protocol::HostMessage::Invoke {
        call: String::from("c1"),
        tab: tab.clone(),
        tool: String::from("simple-sketch__draw__add_shape"),
        input: json!({"kind": "line", "from": [0, 200], "to": [240, 200]}),
        group: String::from("g1"),
    });
    let protocol::AppMessage::ToolResult(result) =
        wait(&|message| matches!(message, protocol::AppMessage::ToolResult(_)))
    else {
        unreachable!()
    };
    assert!(result.ok, "the line was refused: {:?}", result.output);
    say(protocol::HostMessage::Command {
        id: String::from("save"),
        tab: Some(tab),
        arg: None,
        node: None,
        viewport: [1280.0, 800.0],
    });
    wait(&|message| {
        matches!(message, protocol::AppMessage::Tabs(tabs) if tabs.tabs.iter().all(|tab| !tab.dirty))
    });
    say(protocol::HostMessage::Shutdown);
    child.wait().unwrap();
}

/// The mission's workspace test. Catches a workspace that keeps its own copy
/// of the work, or one that works for only one sub-application: a workspace
/// saved with a Simple Sketch tab and a Template tab reopens both, in order,
/// with the same tab selected and the same conversation, and the sketch as
/// it was saved on its own since.
#[test]
fn a_workspace_reopens_its_tabs_and_chat_and_holds_no_work() {
    let dir = scratch("workspace");
    // Restarted sub-applications keep their files here, not in the person's
    // data folder. No other check reads this variable.
    unsafe { std::env::set_var("XDG_DATA_HOME", dir.join("data")) };
    let stand_in = StandIn::start(Vec::new());
    let mut window = Window::new(
        vec![
            start("simple-sketch", "Simple Sketch", &built("simple-sketch")),
            start("template", "Template", &built("template")),
        ],
        &stand_in,
    );
    let tab = window.app.apps[0].running.tabs().1.expect("a sketch is open");
    window.until(|app| app.apps[0].running.declared.documents.contains_key(&tab));
    stand_in.script(vec![
        call_reply(
            "simple-sketch__draw__add_shape",
            json!({"tab": tab, "kind": "ellipse", "from": [0, 0], "to": [100, 100]}),
        ),
        text_reply("Done."),
    ]);
    window.ask("Draw a circle.");
    let drawn = marks(&window.app, &tab);
    window.select("template");
    let conversation = window.app.chat.conversation.clone();

    // Save Workspace As: Simple Sketch saves the untitled sketch with its own
    // Save first, then the host writes the workspace.
    let sketch = dir.join("circle.smx");
    let workspace = dir.join("both.inpainter");
    window.app.scripted_paths.push_back(workspace.clone());
    window.logo(crate::chat::LogoChoice::SaveAs);
    let start_time = Instant::now();
    while !workspace.exists() {
        assert!(start_time.elapsed() < Duration::from_secs(20), "the workspace was never written");
        window.answer_saves(&sketch);
        for started in &mut window.app.apps {
            started.running.poll();
        }
        window.step();
        std::thread::sleep(Duration::from_millis(10));
    }
    let text = std::fs::read_to_string(&workspace).unwrap();
    let file = crate::workspace::WorkspaceFile::parse(&text).unwrap();
    let apps: Vec<&str> = file.tabs.iter().map(|tab| tab.app.as_str()).collect();
    assert_eq!(apps, ["simple-sketch", "template"]);
    assert_eq!(file.tabs[0].path.as_deref(), Some(sketch.display().to_string().as_str()));
    assert_eq!(file.tabs[1].path, None);
    assert_eq!(file.selected, Some(1));
    // No part of the sketch: none of the saved file's own keys, besides the
    // view, which the workspace keeps for each tab as its own state.
    let saved: Value = serde_json::from_str(&std::fs::read_to_string(&sketch).unwrap()).unwrap();
    let keys = saved.as_object().expect("a sketch file is an object").keys();
    for key in keys.filter(|key| key.as_str() != "camera") {
        assert!(!text.contains(&format!("\"{key}\"")), "the workspace holds {key:?}:\n{text}");
    }

    change_on_its_own(&sketch);

    window.logo(crate::chat::LogoChoice::Recent(workspace.clone()));
    window.until(|app| {
        app.flows.path.is_some()
            && app.apps.len() == 2
            && app.apps.iter().all(|started| started.running.tabs().1.is_some())
            && app.chat.conversation.len() >= 3
    });
    let ids: Vec<&str> = window.app.apps.iter().map(|started| started.id.as_str()).collect();
    assert_eq!(ids, ["simple-sketch", "template"]);
    assert_eq!(window.app.apps[window.app.selected].id, "template");
    assert_eq!(window.app.chat.conversation, conversation);
    let reopened = window.app.apps[0].running.tabs().1.unwrap();
    window.until(|app| app.apps[0].running.declared.documents.contains_key(&reopened));
    assert_eq!(
        marks(&window.app, &reopened),
        drawn + 1,
        "the reopened sketch is not the one saved on its own since"
    );
    let _ = std::fs::remove_dir_all(dir);
}
