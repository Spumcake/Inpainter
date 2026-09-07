use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

const AUTH_SESSION_EVENT: &str = "auth-session";
const DEFAULT_AUTH_URL: &str = "http://127.0.0.1:8787";
const SUPABASE_URL: &str = "https://zhfgxembfkkrltimhzdw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY: &str =
    "sb_publishable_GZUhE3UoMBHrOOI6Z3x2NQ_QkBCPZFD";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);
const ACCESS_SKEW_SECS: u64 = 30;

// Interim token persistence. OS keychain / Secret Service is follow-up debt.
const SESSION_FILE: &str = "session.bin";
const SESSION_KEY_FILE: &str = "session.key";

#[derive(Clone, Serialize)]
pub struct AuthSessionPayload {
    pub authenticated: bool,
}

#[derive(Clone, Serialize, Deserialize)]
struct StoredSession {
    access_token: String,
    refresh_token: String,
    expires_at: u64,
}

struct PendingSignIn {
    state: String,
    verifier: String,
}

pub struct AuthState {
    session: Mutex<Option<StoredSession>>,
    pending: Mutex<Option<PendingSignIn>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            pending: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn get_auth_session(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<AuthSessionPayload, String> {
    let current = {
        let guard = state
            .session
            .lock()
            .map_err(|_| "auth session lock poisoned".to_string())?;
        guard.clone()
    };

    if let Some(session) = current {
        if session_is_fresh(&session) {
            return Ok(AuthSessionPayload {
                authenticated: true,
            });
        }
        if let Ok(refreshed) = refresh_session(&session.refresh_token) {
            persist_session(&app, &state, refreshed)?;
            return Ok(AuthSessionPayload {
                authenticated: true,
            });
        }
        clear_session(&app, &state)?;
        return Ok(AuthSessionPayload {
            authenticated: false,
        });
    }

    if let Some(stored) = load_session(&app)? {
        if session_is_fresh(&stored) {
            persist_session(&app, &state, stored)?;
            return Ok(AuthSessionPayload {
                authenticated: true,
            });
        }
        match refresh_session(&stored.refresh_token) {
            Ok(refreshed) => {
                persist_session(&app, &state, refreshed)?;
                Ok(AuthSessionPayload {
                    authenticated: true,
                })
            }
            Err(_) => {
                clear_session(&app, &state)?;
                Ok(AuthSessionPayload {
                    authenticated: false,
                })
            }
        }
    } else {
        Ok(AuthSessionPayload {
            authenticated: false,
        })
    }
}

#[tauri::command]
pub fn sign_in(app: AppHandle, state: State<'_, AuthState>) -> Result<AuthSessionPayload, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|err| format!("failed to bind loopback callback: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("failed to read loopback address: {err}"))?
        .port();

    let redirect_uri = format!("http://127.0.0.1:{port}/auth/callback");
    let oauth_state = random_b64(32);
    let verifier = random_b64(32);
    let challenge = pkce_challenge(&verifier);

    {
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "auth session lock poisoned".to_string())?;
        *pending = Some(PendingSignIn {
            state: oauth_state.clone(),
            verifier: verifier.clone(),
        });
    }

    let mut authorize = reqwest::Url::parse(&format!("{}/sign-in", auth_base_url()))
        .map_err(|err| format!("invalid auth url: {err}"))?;
    authorize
        .query_pairs_mut()
        .append_pair("state", &oauth_state)
        .append_pair("challenge", &challenge)
        .append_pair("redirect_uri", &redirect_uri);

    open_url_in_browser(authorize.as_str())?;

    let (code, returned_state) = accept_callback(listener)?;

    let pending = {
        let mut guard = state
            .pending
            .lock()
            .map_err(|_| "auth session lock poisoned".to_string())?;
        guard.take()
    }
    .ok_or_else(|| "no sign-in is in progress".to_string())?;

    if returned_state != pending.state {
        return Err("sign-in state mismatch".to_string());
    }

    let tokens = exchange_code(&code, &pending.verifier)?;
    persist_session(&app, &state, tokens)?;
    emit_session(&app, true);
    Ok(AuthSessionPayload {
        authenticated: true,
    })
}

pub fn load_session_on_boot(app: &AppHandle) {
    if let Ok(Some(session)) = load_session(app) {
        if let Some(state) = app.try_state::<AuthState>() {
            if let Ok(mut guard) = state.session.lock() {
                *guard = Some(session);
            }
        }
    }
}

fn auth_base_url() -> String {
    std::env::var("INPAINTER_AUTH_URL").unwrap_or_else(|_| DEFAULT_AUTH_URL.to_string())
}

fn session_is_fresh(session: &StoredSession) -> bool {
    now_secs().saturating_add(ACCESS_SKEW_SECS) < session.expires_at
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn persist_session(
    app: &AppHandle,
    state: &AuthState,
    session: StoredSession,
) -> Result<(), String> {
    write_session_file(app, &session)?;
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "auth session lock poisoned".to_string())?;
    *guard = Some(session);
    Ok(())
}

fn clear_session(app: &AppHandle, state: &AuthState) -> Result<(), String> {
    if let Ok(mut guard) = state.session.lock() {
        *guard = None;
    }
    if let Ok(dir) = auth_dir(app) {
        let _ = fs::remove_file(dir.join(SESSION_FILE));
    }
    Ok(())
}

fn emit_session(app: &AppHandle, authenticated: bool) {
    if let Err(err) = app.emit(
        AUTH_SESSION_EVENT,
        AuthSessionPayload { authenticated },
    ) {
        eprintln!("[inpainter] failed to emit auth-session: {err}");
    }
}

fn exchange_code(code: &str, verifier: &str) -> Result<StoredSession, String> {
    let client = reqwest::blocking::Client::new();
    let response = client
        .post(format!("{}/exchange", auth_base_url()))
        .json(&serde_json::json!({ "code": code, "verifier": verifier }))
        .send()
        .map_err(|err| format!("exchange request failed: {err}"))?;
    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|err| format!("exchange response was not json: {err}"))?;
    if !status.is_success() {
        let message = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("token exchange failed");
        return Err(message.to_string());
    }
    session_from_token_body(&body)
}

fn refresh_session(refresh_token: &str) -> Result<StoredSession, String> {
    let client = reqwest::blocking::Client::new();
    let response = client
        .post(format!("{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token"))
        .header("apikey", SUPABASE_PUBLISHABLE_KEY)
        .header("Authorization", format!("Bearer {SUPABASE_PUBLISHABLE_KEY}"))
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .map_err(|err| format!("refresh request failed: {err}"))?;
    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|err| format!("refresh response was not json: {err}"))?;
    if !status.is_success() {
        return Err("refresh failed".to_string());
    }
    session_from_token_body(&body)
}

fn session_from_token_body(body: &serde_json::Value) -> Result<StoredSession, String> {
    let access_token = body
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing access_token".to_string())?
        .to_string();
    let refresh_token = body
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing refresh_token".to_string())?
        .to_string();
    let expires_in = body
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(3600);
    Ok(StoredSession {
        access_token,
        refresh_token,
        expires_at: now_secs().saturating_add(expires_in),
    })
}

fn accept_callback(listener: TcpListener) -> Result<(String, String), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(listener.accept());
    });
    let (mut stream, addr) = rx
        .recv_timeout(CALLBACK_TIMEOUT)
        .map_err(|_| "timed out waiting for the browser to return".to_string())?
        .map_err(|err| format!("waiting for browser return failed: {err}"))?;
    if !addr.ip().is_loopback() {
        return Err("callback rejected: not loopback".to_string());
    }
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    let mut buf = [0u8; 4096];
    let n = stream
        .read(&mut buf)
        .map_err(|err| format!("failed to read callback: {err}"))?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");
    let (pathname, query) = path.split_once('?').unwrap_or((path, ""));
    if pathname != "/auth/callback" {
        let _ = write_http(
            &mut stream,
            404,
            "text/plain",
            "not found",
        );
        return Err("unexpected callback path".to_string());
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
        &mut stream,
        200,
        "text/html; charset=utf-8",
        "<!DOCTYPE html><html><body style=\"font-family:sans-serif;background:#151515;color:#fff;display:grid;place-items:center;height:100vh;margin:0\"><p>You can return to Inpainter.</p></body></html>",
    )?;

    match (code, state) {
        (Some(code), Some(state)) if !code.is_empty() && !state.is_empty() => Ok((code, state)),
        _ => Err("callback missing code or state".to_string()),
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

fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn random_b64(len: usize) -> String {
    let mut bytes = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn auth_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))?
        .join("auth");
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create auth dir: {err}"))?;
    Ok(dir)
}

fn load_session(app: &AppHandle) -> Result<Option<StoredSession>, String> {
    let dir = auth_dir(app)?;
    let path = dir.join(SESSION_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|err| format!("failed to read session: {err}"))?;
    let key = load_or_create_key(&dir)?;
    let plain = decrypt(&key, &bytes)?;
    let session = serde_json::from_slice(&plain)
        .map_err(|err| format!("failed to parse session: {err}"))?;
    Ok(Some(session))
}

fn write_session_file(app: &AppHandle, session: &StoredSession) -> Result<(), String> {
    let dir = auth_dir(app)?;
    let key = load_or_create_key(&dir)?;
    let plain = serde_json::to_vec(session).map_err(|err| format!("failed to encode session: {err}"))?;
    let bytes = encrypt(&key, &plain)?;
    write_restricted(&dir.join(SESSION_FILE), &bytes)
}

fn load_or_create_key(dir: &Path) -> Result<[u8; 32], String> {
    let path = dir.join(SESSION_KEY_FILE);
    if path.exists() {
        let bytes = fs::read(&path).map_err(|err| format!("failed to read session key: {err}"))?;
        let mut key = [0u8; 32];
        if bytes.len() != 32 {
            return Err("session key has unexpected length".to_string());
        }
        key.copy_from_slice(&bytes);
        return Ok(key);
    }
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    write_restricted(&path, &key)?;
    Ok(key)
}

fn encrypt(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plain)
        .map_err(|_| "failed to encrypt session".to_string())?;
    let mut out = Vec::with_capacity(12 + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt(key: &[u8; 32], bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() < 13 {
        return Err("session file is truncated".to_string());
    }
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt(Nonce::from_slice(&bytes[..12]), &bytes[12..])
        .map_err(|_| "failed to decrypt session".to_string())
}

fn write_restricted(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|err| format!("failed to write {}: {err}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|err| format!("failed to restrict {}: {err}", path.display()))?;
    }
    Ok(())
}
