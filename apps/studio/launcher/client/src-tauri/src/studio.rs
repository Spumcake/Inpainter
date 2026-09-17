use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, ErrorKind, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::home::AppHome;
use crate::paths;

const READY_TIMEOUT: Duration = Duration::from_secs(90);
const OPEN_TIMEOUT: Duration = Duration::from_secs(90);
const QUIT_WAIT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct StudioHost {
    inner: Mutex<Option<HostHandle>>,
}

struct HostHandle {
    child: Child,
    pid: u32,
    stdin: Option<ChildStdin>,
    tcp: Option<TcpStream>,
    rx: mpsc::Receiver<Value>,
    alive: Arc<AtomicBool>,
}

impl StudioHost {
    pub fn shutdown(&self) {
        let mut inner = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        if let Some(host) = inner.take() {
            host.shutdown();
        }
    }

    pub fn open_workspace(
        &self,
        workspace_id: String,
        workspace_path: String,
    ) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap_or_else(|err| err.into_inner());
        if inner.as_mut().is_some_and(HostHandle::is_alive) {
            return inner
                .as_mut()
                .expect("host present after is_alive")
                .open(workspace_id, workspace_path);
        }
        if let Some(dead) = inner.take() {
            dead.kill();
        }
        let mut host = spawn_host()?;
        let result = host.open(workspace_id, workspace_path);
        *inner = Some(host);
        result
    }
}

pub fn shutdown_host_for_app(app: &AppHandle) {
    if let Some(state) = app.try_state::<StudioHost>() {
        state.shutdown();
    }
}

#[tauri::command]
pub async fn open_workspace(
    app: AppHandle,
    workspace_id: String,
    workspace_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(host) = app.try_state::<StudioHost>() else {
            return Err("Studio host is not available".to_string());
        };
        host.open_workspace(workspace_id, workspace_path)
    })
    .await
    .map_err(|err| format!("open workspace task failed: {err}"))?
}

impl HostHandle {
    fn is_alive(&mut self) -> bool {
        if !self.alive.load(Ordering::SeqCst) {
            return false;
        }
        match self.child.try_wait() {
            Ok(Some(_)) => {
                self.alive.store(false, Ordering::SeqCst);
                false
            }
            Ok(None) => true,
            Err(_) => false,
        }
    }

    fn open(&mut self, workspace_id: String, workspace_path: String) -> Result<(), String> {
        self.send(&serde_json::json!({
            "cmd": "open",
            "workspaceId": workspace_id,
            "workspacePath": workspace_path,
        }))?;
        wait_for_ok(&self.rx, OPEN_TIMEOUT)
    }

    fn send(&mut self, command: &Value) -> Result<(), String> {
        let mut line = serde_json::to_string(command)
            .map_err(|err| format!("failed to encode Studio command: {err}"))?;
        line.push('\n');
        let bytes = line.as_bytes();
        if let Some(tcp) = &mut self.tcp {
            if let Err(err) = tcp.write_all(bytes).and_then(|_| tcp.flush()) {
                self.alive.store(false, Ordering::SeqCst);
                return Err(format!("failed to send command to Studio: {err}"));
            }
            return Ok(());
        }
        if let Some(stdin) = &mut self.stdin {
            if let Err(err) = stdin.write_all(bytes).and_then(|_| stdin.flush()) {
                self.alive.store(false, Ordering::SeqCst);
                return Err(format!("failed to send command to Studio: {err}"));
            }
            return Ok(());
        }
        Err("Studio host has no control channel".to_string())
    }

    fn shutdown(mut self) {
        let _ = self.send(&serde_json::json!({ "cmd": "quit" }));
        let started = Instant::now();
        while started.elapsed() < QUIT_WAIT {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => thread::sleep(Duration::from_millis(50)),
                Err(_) => break,
            }
        }
        self.kill();
    }

    fn kill(mut self) {
        self.alive.store(false, Ordering::SeqCst);
        terminate_process_group(self.pid);
        let _ = self.child.kill();
    }
}

fn spawn_host() -> Result<HostHandle, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|err| format!("failed to bind Studio host listener: {err}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|err| format!("failed to configure Studio host listener: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("failed to read Studio host address: {err}"))?
        .port();
    let control = format!("127.0.0.1:{port}");

    let mut log = open_host_log()?;
    let _ = writeln!(
        log,
        "\n--- studio host spawn {} ---",
        chrono::Local::now().to_rfc3339()
    );

    let mut cmd = studio_command()?;
    crate::cli::apply_client_env(&mut cmd)?;
    cmd.env("INPAINTER_STUDIO_HOST", "1")
        .env("INPAINTER_HOST_CONTROL", &control)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(
            log.try_clone()
                .map_err(|err| format!("failed to clone Studio host log: {err}"))?,
        ));
    apply_process_group(&mut cmd);

    let mut child = cmd
        .spawn()
        .map_err(|err| format!("failed to start Studio: {err}"))?;
    let pid = child.id();
    let stdin = child.stdin.take();
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_process_group(pid);
            let _ = child.kill();
            return Err("Studio host stdout is not available".to_string());
        }
    };

    let (tx, rx) = mpsc::channel();
    let alive = Arc::new(AtomicBool::new(true));

    {
        let tx = tx.clone();
        thread::spawn(move || {
            read_stdout_lines(stdout, tx, log);
        });
    }

    let (tcp_tx, tcp_rx) = mpsc::channel();
    thread::spawn(move || accept_control_connection(listener, tcp_tx));

    let started = Instant::now();
    let mut tcp = None;
    loop {
        if started.elapsed() >= READY_TIMEOUT {
            terminate_process_group(pid);
            let _ = child.kill();
            return Err("timed out waiting for Studio host".to_string());
        }
        if let Err(err) = ensure_child_running(&mut child, pid) {
            return Err(err);
        }
        if tcp.is_none() {
            if let Ok(stream) = tcp_rx.try_recv() {
                match attach_tcp_reader(stream, tx.clone(), alive.clone()) {
                    Ok(stream) => tcp = Some(stream),
                    Err(err) => {
                        terminate_process_group(pid);
                        let _ = child.kill();
                        return Err(err);
                    }
                }
            }
        }
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(value) if is_ready(&value) => {
                if tcp.is_none() {
                    thread::sleep(Duration::from_millis(200));
                    if let Ok(stream) = tcp_rx.try_recv() {
                        match attach_tcp_reader(stream, tx.clone(), alive.clone()) {
                            Ok(stream) => tcp = Some(stream),
                            Err(err) => {
                                terminate_process_group(pid);
                                let _ = child.kill();
                                return Err(err);
                            }
                        }
                    }
                }
                // Prefer the TCP control channel. A JSON line on pnpm/vite stdout
                // can look like a ready handshake before Electron has connected.
                if tcp.is_some() || started.elapsed() + Duration::from_secs(2) >= READY_TIMEOUT {
                    return Ok(HostHandle {
                        child,
                        pid,
                        stdin,
                        tcp,
                        rx,
                        alive,
                    });
                }
            }
            Ok(_) => {}
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                terminate_process_group(pid);
                let _ = child.kill();
                return Err("Studio host closed before it became ready".to_string());
            }
        }
    }
}

fn ensure_child_running(child: &mut Child, pid: u32) -> Result<(), String> {
    match child.try_wait() {
        Ok(Some(status)) => Err(format!(
            "Studio host exited before it became ready ({status})"
        )),
        Ok(None) => Ok(()),
        Err(err) => {
            terminate_process_group(pid);
            Err(format!("failed to poll Studio host: {err}"))
        }
    }
}

fn attach_tcp_reader(
    stream: TcpStream,
    tx: Sender<Value>,
    alive: Arc<AtomicBool>,
) -> Result<TcpStream, String> {
    let _ = stream.set_nodelay(true);
    let reader = stream
        .try_clone()
        .map_err(|err| format!("failed to clone Studio control stream: {err}"))?;
    thread::spawn(move || {
        read_json_lines(reader, tx);
        alive.store(false, Ordering::SeqCst);
    });
    Ok(stream)
}

fn accept_control_connection(listener: TcpListener, tx: Sender<TcpStream>) {
    let started = Instant::now();
    loop {
        if started.elapsed() >= READY_TIMEOUT {
            return;
        }
        match listener.accept() {
            Ok((stream, addr)) => {
                if addr.ip().is_loopback() {
                    let _ = tx.send(stream);
                    return;
                }
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return,
        }
    }
}

fn wait_for_ok(rx: &mpsc::Receiver<Value>, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    loop {
        if started.elapsed() >= timeout {
            return Err("timed out waiting for Studio to open the workspace".to_string());
        }
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(value) => {
                if let Some(ok) = value.get("ok").and_then(Value::as_bool) {
                    if ok {
                        return Ok(());
                    }
                    let error = value
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("Studio failed to open the workspace");
                    return Err(error.to_string());
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err("Studio host closed".to_string());
            }
        }
    }
}

fn is_ready(value: &Value) -> bool {
    value.get("status").and_then(Value::as_str) == Some("ready")
}

fn read_json_lines<R: std::io::Read>(reader: R, tx: Sender<Value>) {
    let reader = BufReader::new(reader);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(line) {
            if tx.send(value).is_err() {
                break;
            }
        }
    }
}

fn read_stdout_lines<R: std::io::Read>(reader: R, tx: Sender<Value>, mut log: File) {
    let reader = BufReader::new(reader);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if let Ok(value) = serde_json::from_str::<Value>(line.trim()) {
            if tx.send(value).is_err() {
                break;
            }
        } else {
            let _ = writeln!(log, "{line}");
        }
    }
}

fn studio_command() -> Result<Command, String> {
    if let Ok(bin) = std::env::var("INPAINTER_STUDIO_BIN") {
        let path = PathBuf::from(bin);
        if !path.exists() {
            return Err(format!(
                "INPAINTER_STUDIO_BIN does not exist: {}",
                path.display()
            ));
        }
        return Ok(Command::new(path));
    }

    let dir = resolve_studio_dir()?;
    if use_compiled_studio() {
        let main_js = dir.join("out/main/index.js");
        let renderer_html = dir.join("out/renderer/index.html");
        let electron = electron_bin(&dir);

        if electron.is_file() && main_js.is_file() && renderer_html.is_file() {
            let mut cmd = Command::new(electron);
            cmd.arg("--no-sandbox")
                .arg(&main_js)
                .current_dir(&dir)
                .env_remove("ELECTRON_RUN_AS_NODE");
            return Ok(cmd);
        }
    }

    if dir.join("package.json").is_file() {
        let mut cmd = Command::new(if cfg!(windows) { "pnpm.cmd" } else { "pnpm" });
        cmd.arg("dev").current_dir(&dir);
        return Ok(cmd);
    }

    Err(format!(
        "could not start Inpainter Studio from {}",
        dir.display()
    ))
}

fn use_compiled_studio() -> bool {
    !cfg!(debug_assertions)
}

fn open_host_log() -> Result<File, String> {
    let dir = AppHome::resolve()?.logs_dir();
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create {}: {err}", dir.display()))?;
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("studio-host.log"))
        .map_err(|err| format!("failed to open Studio host log: {err}"))
}

fn resolve_studio_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("INPAINTER_STUDIO_DIR") {
        let path = PathBuf::from(dir);
        if path.join("package.json").is_file() {
            return Ok(path);
        }
        return Err(format!(
            "INPAINTER_STUDIO_DIR does not look like Studio: {}",
            path.display()
        ));
    }

    paths::resolve_studio_dir().map_err(|err| format!("{err} Set INPAINTER_STUDIO_DIR."))
}

fn electron_bin(studio_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        studio_dir.join("node_modules/.bin/electron.cmd")
    } else {
        studio_dir.join("node_modules/.bin/electron")
    }
}

fn apply_process_group(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const DETACHED_PROCESS: u32 = 0x00000008;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
    }
}

fn terminate_process_group(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }

    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}
