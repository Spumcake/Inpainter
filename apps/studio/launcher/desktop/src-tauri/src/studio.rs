use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct StudioProcesses {
    pids: Mutex<Vec<u32>>,
}

impl StudioProcesses {
    fn track(&self, pid: u32) {
        self.pids.lock().unwrap_or_else(|err| err.into_inner()).push(pid);
    }

    pub fn terminate_all(&self) {
        let mut pids = self.pids.lock().unwrap_or_else(|err| err.into_inner());
        for pid in pids.drain(..) {
            terminate_process_group(pid);
        }
    }
}

pub fn terminate_all_for_app(app: &AppHandle) {
    if let Some(state) = app.try_state::<StudioProcesses>() {
        state.terminate_all();
    }
}

pub fn launch_studio_for_app(app: &AppHandle) -> Result<(), String> {
    let pid = spawn_studio()?;
    if let Some(state) = app.try_state::<StudioProcesses>() {
        state.track(pid);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn launch_studio(app: AppHandle) -> Result<(), String> {
    launch_studio_for_app(&app)
}

fn spawn_studio() -> Result<u32, String> {
    if let Ok(bin) = std::env::var("INPAINTER_STUDIO_BIN") {
        let path = PathBuf::from(bin);
        if !path.exists() {
            return Err(format!("INPAINTER_STUDIO_BIN does not exist: {}", path.display()));
        }
        return spawn_detached(Command::new(path));
    }

    let dir = resolve_studio_dir()?;
    let main_js = dir.join("out/main/index.js");
    let electron = electron_bin(&dir);

    if electron.is_file() && main_js.is_file() {
        let mut cmd = Command::new(electron);
        cmd.arg("--no-sandbox")
            .arg(&main_js)
            .current_dir(&dir)
            .env_remove("ELECTRON_RUN_AS_NODE");
        return spawn_detached(cmd);
    }

    if dir.join("package.json").is_file() {
        let mut cmd = Command::new(if cfg!(windows) { "pnpm.cmd" } else { "pnpm" });
        cmd.arg("dev").current_dir(&dir);
        return spawn_detached(cmd);
    }

    Err(format!(
        "could not start Inpainter Studio from {}",
        dir.display()
    ))
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

    let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../authoring/desktop");
    candidate.canonicalize().map_err(|err| {
        format!(
            "could not find Inpainter Studio at {}. Set INPAINTER_STUDIO_DIR. ({err})",
            candidate.display()
        )
    })
}

fn electron_bin(studio_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        studio_dir.join("node_modules/.bin/electron.cmd")
    } else {
        studio_dir.join("node_modules/.bin/electron")
    }
}

fn spawn_detached(mut cmd: Command) -> Result<u32, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

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

    let child = cmd
        .spawn()
        .map_err(|err| format!("failed to start Studio: {err}"))?;
    Ok(child.id())
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
