use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::Manager;

use crate::cli;
use crate::home::AppHome;
use crate::paths;

const READY_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_AUTH_HOST: &str = "127.0.0.1";
const DEFAULT_AUTH_PORT: u16 = 8787;

pub struct DevAuth {
    child: Mutex<Option<(Child, u32)>>,
}

impl Default for DevAuth {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl DevAuth {
    pub fn ensure(&self) -> Result<(), String> {
        if !cli::use_source_core() {
            return Ok(());
        }
        let url = cli::auth_base_url();
        if !is_local_dev_auth(&url) {
            eprintln!("[inpainter] INPAINTER_AUTH_URL is {url}; not starting local auth");
            return Ok(());
        }
        if health_ok(&url) {
            eprintln!("[inpainter] local auth already running at {url}");
            return Ok(());
        }

        let dir = resolve_auth_dir()?;
        let mut log = open_auth_log()?;
        let _ = writeln!(
            log,
            "\n--- auth dev spawn {} ---",
            chrono::Local::now().to_rfc3339()
        );

        let mut cmd = auth_command(&dir)?;
        cmd.current_dir(&dir)
            .stdin(Stdio::null())
            .stdout(Stdio::from(
                log.try_clone()
                    .map_err(|err| format!("failed to clone auth log: {err}"))?,
            ))
            .stderr(Stdio::from(log));
        apply_process_group(&mut cmd);

        let child = cmd
            .spawn()
            .map_err(|err| format!("failed to start local auth: {err}"))?;
        let pid = child.id();
        {
            let mut guard = self
                .child
                .lock()
                .map_err(|_| "auth process lock poisoned".to_string())?;
            *guard = Some((child, pid));
        }

        wait_until_ready(&url, pid)?;
        eprintln!("[inpainter] local auth ready at {url}");
        Ok(())
    }

    pub fn shutdown(&self) {
        let Some((mut child, pid)) = self.child.lock().ok().and_then(|mut guard| guard.take())
        else {
            return;
        };
        terminate_process_group(pid);
        let _ = child.kill();
        let _ = child.wait();
    }
}

pub fn shutdown_auth_for_app(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<DevAuth>() {
        state.shutdown();
    }
}

fn resolve_auth_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("INPAINTER_AUTH_DIR") {
        let path = PathBuf::from(dir);
        if path.join("package.json").is_file() {
            return Ok(path);
        }
        return Err(format!(
            "INPAINTER_AUTH_DIR does not look like Inpainter auth: {}",
            path.display()
        ));
    }
    paths::resolve_auth_dir().map_err(|err| format!("{err} Set INPAINTER_AUTH_DIR."))
}

fn auth_command(dir: &std::path::Path) -> Result<Command, String> {
    let wrangler = if cfg!(windows) {
        dir.join("node_modules/.bin/wrangler.cmd")
    } else {
        dir.join("node_modules/.bin/wrangler")
    };
    if wrangler.is_file() {
        let mut cmd = Command::new(wrangler);
        cmd.args(["dev", "--port", &DEFAULT_AUTH_PORT.to_string()]);
        return Ok(cmd);
    }
    if dir.join("package.json").is_file() {
        let mut cmd = Command::new(if cfg!(windows) { "pnpm.cmd" } else { "pnpm" });
        cmd.arg("dev");
        return Ok(cmd);
    }
    Err(format!(
        "local auth is not installed at {}. Run pnpm install in operations/auth.",
        dir.display()
    ))
}

fn is_local_dev_auth(url: &str) -> bool {
    let normalized = url.to_ascii_lowercase();
    normalized.contains("127.0.0.1:8787") || normalized.contains("localhost:8787")
}

fn health_ok(_url: &str) -> bool {
    let mut stream = match TcpStream::connect((DEFAULT_AUTH_HOST, DEFAULT_AUTH_PORT)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut body = String::new();
    let _ = stream.read_to_string(&mut body);
    body.contains("200") || body.contains("\"ok\":true") || body.contains("\"ok\": true")
}

fn wait_until_ready(url: &str, pid: u32) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < READY_TIMEOUT {
        if health_ok(url) {
            return Ok(());
        }
        if !process_alive(pid) {
            return Err(format!(
                "local auth exited before it became ready. See {}",
                auth_log_path()?.display()
            ));
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(format!(
        "timed out waiting for local auth at {url}. See {}",
        auth_log_path()?.display()
    ))
}

fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, 0) == 0
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        true
    }
}

fn auth_log_path() -> Result<PathBuf, String> {
    Ok(AppHome::resolve()?.logs_dir().join("auth-dev.log"))
}

fn open_auth_log() -> Result<File, String> {
    let path = auth_log_path()?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("failed to create {}: {err}", dir.display()))?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|err| format!("failed to open auth log: {err}"))
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

#[cfg(test)]
mod tests {
    use super::is_local_dev_auth;

    #[test]
    fn recognizes_loopback_auth() {
        assert!(is_local_dev_auth("http://127.0.0.1:8787"));
        assert!(is_local_dev_auth("http://localhost:8787/"));
        assert!(!is_local_dev_auth("https://auth.inpainter.app"));
    }
}
