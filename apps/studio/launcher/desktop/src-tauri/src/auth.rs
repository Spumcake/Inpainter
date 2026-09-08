use std::io::{ErrorKind, Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::cli;

const AUTH_SESSION_EVENT: &str = "auth-session";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone, Serialize)]
pub struct AuthSessionPayload {
    pub authenticated: bool,
}

struct PendingSignIn {
    state: String,
    cancel: mpsc::Sender<()>,
}

pub struct AuthState {
    authenticated: Mutex<bool>,
    pending: Mutex<Option<PendingSignIn>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            authenticated: Mutex::new(false),
            pending: Mutex::new(None),
        }
    }
}

impl AuthState {
    pub fn is_authenticated(&self) -> bool {
        self.authenticated
            .lock()
            .ok()
            .map(|guard| *guard)
            .unwrap_or(false)
    }

    pub fn set_authenticated_flag(&self, authenticated: bool) {
        set_authenticated(self, authenticated);
    }
}

#[tauri::command]
pub fn get_auth_session(state: State<'_, AuthState>) -> Result<AuthSessionPayload, String> {
    let payload = session_from_cli()?;
    set_authenticated(&state, payload.authenticated);
    Ok(payload)
}

#[tauri::command]
pub async fn sign_in(app: AppHandle) -> Result<AuthSessionPayload, String> {
    tauri::async_runtime::spawn_blocking(move || sign_in_blocking(app))
        .await
        .map_err(|err| format!("sign-in task failed: {err}"))?
}

fn sign_in_blocking(app: AppHandle) -> Result<AuthSessionPayload, String> {
    let state = app.state::<AuthState>();
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|err| format!("failed to bind loopback callback: {err}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|err| format!("failed to configure callback listener: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("failed to read loopback address: {err}"))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{port}/auth/callback");
    let started = cli::run(&["auth", "authorize-url", "--redirect-uri", &redirect_uri])?;
    let authorize_url = started
        .get("authorize_url")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "CLI did not return authorize_url".to_string())?
        .to_string();
    let oauth_state = started
        .get("state")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "CLI did not return state".to_string())?
        .to_string();
    let (cancel_tx, cancel_rx) = mpsc::channel();

    {
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "auth session lock poisoned".to_string())?;
        if let Some(previous) = pending.take() {
            let _ = previous.cancel.send(());
        }
        *pending = Some(PendingSignIn {
            state: oauth_state.clone(),
            cancel: cancel_tx,
        });
    }

    open_url_in_browser(&authorize_url)?;

    let (code, returned_state) = accept_callback(listener, cancel_rx)?;

    let pending = {
        let mut guard = state
            .pending
            .lock()
            .map_err(|_| "auth session lock poisoned".to_string())?;
        guard.take()
    }
    .ok_or_else(|| "no sign-in is in progress".to_string())?;

    if returned_state != pending.state || returned_state != oauth_state {
        return Err("sign-in state mismatch".to_string());
    }

    let exchanged = cli::run(&["auth", "exchange", "--code", &code, "--state", &returned_state])?;
    let authenticated = exchanged
        .get("authenticated")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if !authenticated {
        return Err("token exchange did not produce a session".to_string());
    }

    set_authenticated(&state, true);
    // Do not emit here: the frontend is still awaiting this invoke. Emitting
    // back into the webview from the same in-flight command can deadlock.
    Ok(AuthSessionPayload { authenticated: true })
}

pub fn load_session_on_boot(app: &AppHandle) {
    if let Ok(payload) = session_from_cli() {
        if let Some(state) = app.try_state::<AuthState>() {
            set_authenticated(&state, payload.authenticated);
        }
    }
}

pub fn sign_out(app: &AppHandle) -> Result<(), String> {
    let state = app
        .try_state::<AuthState>()
        .ok_or_else(|| "auth state is unavailable".to_string())?;
    cancel_pending(&state);
    cli::run(&["auth", "logout"])?;
    set_authenticated(&state, false);
    emit_session(app, false);
    Ok(())
}

pub fn refresh_auth_status() -> Result<bool, String> {
    Ok(session_from_cli()?.authenticated)
}

fn session_from_cli() -> Result<AuthSessionPayload, String> {
    let body = cli::run(&["auth", "status"])?;
    Ok(AuthSessionPayload {
        authenticated: body
            .get("authenticated")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
    })
}

fn set_authenticated(state: &AuthState, authenticated: bool) {
    if let Ok(mut guard) = state.authenticated.lock() {
        *guard = authenticated;
    }
}

fn cancel_pending(state: &AuthState) {
    if let Ok(mut pending) = state.pending.lock() {
        if let Some(previous) = pending.take() {
            let _ = previous.cancel.send(());
        }
    }
}

fn emit_session(app: &AppHandle, authenticated: bool) {
    if let Err(err) = app.emit(
        AUTH_SESSION_EVENT,
        AuthSessionPayload { authenticated },
    ) {
        eprintln!("[inpainter] failed to emit auth-session: {err}");
    }
}

fn accept_callback(
    listener: TcpListener,
    cancel: mpsc::Receiver<()>,
) -> Result<(String, String), String> {
    let started = SystemTime::now();
    loop {
        if cancel.try_recv().is_ok() {
            return Err("sign-in cancelled".to_string());
        }
        if started.elapsed().unwrap_or_default() >= CALLBACK_TIMEOUT {
            return Err("timed out waiting for the browser to return".to_string());
        }

        match listener.accept() {
            Ok((mut stream, addr)) => {
                if !addr.ip().is_loopback() {
                    continue;
                }
                match read_callback(&mut stream) {
                    Ok(tokens) => return Ok(tokens),
                    Err(CallbackRead::Ignore) => continue,
                    Err(CallbackRead::Failed(err)) => return Err(err),
                }
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(err) => {
                return Err(format!("waiting for browser return failed: {err}"));
            }
        }
    }
}

enum CallbackRead {
    Ignore,
    Failed(String),
}

fn read_callback(stream: &mut std::net::TcpStream) -> Result<(String, String), CallbackRead> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(0) | Err(_) => return Err(CallbackRead::Ignore),
        Ok(n) => n,
    };
    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");
    let (pathname, query) = path.split_once('?').unwrap_or((path, ""));
    if pathname != "/auth/callback" {
        let _ = write_http(stream, 404, "text/plain", "not found");
        return Err(CallbackRead::Ignore);
    }

    let mut code = None;
    let mut state = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        match key {
            "code" => code = Some(url_decode(value)),
            "state" => state = Some(url_decode(value)),
            _ => {}
        }
    }

    write_http(
        stream,
        200,
        "text/html; charset=utf-8",
        "<!DOCTYPE html><html><body style=\"font-family:sans-serif;background:#151515;color:#fff;display:grid;place-items:center;height:100vh;margin:0\"><p>Signed in. You can close this tab.</p><script>window.close();</script></body></html>",
    )
    .map_err(CallbackRead::Failed)?;

    match (code, state) {
        (Some(code), Some(state)) if !code.is_empty() && !state.is_empty() => Ok((code, state)),
        _ => Err(CallbackRead::Failed("callback missing code or state".to_string())),
    }
}

fn write_http(
    stream: &mut std::net::TcpStream,
    status: u16,
    content_type: &str,
    body: &str,
) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Error",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|err| format!("failed to write callback response: {err}"))
}

fn url_decode(value: &str) -> String {
    let mut out = String::new();
    let bytes = value.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = &value[i + 1..i + 3];
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    out.push(byte as char);
                    i += 3;
                    continue;
                }
                out.push('%');
                i += 1;
            }
            b'+' => {
                out.push(' ');
                i += 1;
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}

fn open_url_in_browser(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL is empty".into());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|err| format!("failed to open browser: {err}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|err| format!("failed to open browser: {err}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn()
            .map_err(|err| format!("failed to open browser: {err}"))?;
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        return Err("opening a browser is not supported on this platform".into());
    }

    Ok(())
}
