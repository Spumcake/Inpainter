use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::home::AppHome;
use crate::paths;

pub fn run(args: &[&str]) -> Result<serde_json::Value, String> {
    run_with_stdin(args, None)
}

pub fn run_with_stdin(args: &[&str], stdin: Option<&str>) -> Result<serde_json::Value, String> {
    let output = spawn(args, stdin)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed = if stdout.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_str(&stdout).map_err(|err| {
            format!("core did not return JSON: {err}: {stdout}")
        })?
    };

    if !output.status.success() {
        let message = parsed
            .get("error")
            .and_then(|value| value.as_str())
            .unwrap_or("core command failed");
        return Err(message.to_string());
    }

    Ok(parsed)
}

pub fn apply_client_env(command: &mut Command) -> Result<(), String> {
    let home = AppHome::resolve()?;
    command.env("INPAINTER_HOME", home.root());
    command.env("INPAINTER_AUTH_URL", auth_base_url());
    if use_source_core() {
        command.env("INPAINTER_DEV", "1");
        if let Ok(project) = resolve_core_project() {
            command.env("INPAINTER_CORE_DIR", project);
        }
    }
    Ok(())
}

fn spawn(args: &[&str], stdin: Option<&str>) -> Result<std::process::Output, String> {
    let home = AppHome::resolve()?;
    if let Ok(bin) = std::env::var("INPAINTER_CORE_BIN") {
        let path = PathBuf::from(bin);
        if !path.exists() {
            return Err(format!(
                "INPAINTER_CORE_BIN does not exist: {}",
                path.display()
            ));
        }
        let mut command = command_with_home(Command::new(path), &home);
        command.args(args);
        return output_with_stdin(command, stdin);
    }

    if use_source_core() {
        return spawn_source_core(&home, args, stdin);
    }

    let installed = home.core_bin();
    if installed.exists() {
        let mut command = command_with_home(Command::new(&installed), &home);
        command.args(args);
        return output_with_stdin(command, stdin);
    }

    spawn_source_core(&home, args, stdin)
}

fn spawn_source_core(
    home: &AppHome,
    args: &[&str],
    stdin: Option<&str>,
) -> Result<std::process::Output, String> {
    let project = resolve_core_project()?;
    let tsx = tsx_bin(&project);
    let entry = project.join("src").join("cli.ts");
    if !tsx.exists() || !entry.exists() {
        return Err(format!(
            "Inpainter core source is not ready at {}. Run pnpm install in core/.",
            project.display()
        ));
    }
    let mut command = command_with_home(Command::new(tsx), home);
    command.arg(entry).args(args).current_dir(&project);
    output_with_stdin(command, stdin)
}

fn output_with_stdin(
    mut command: Command,
    stdin: Option<&str>,
) -> Result<std::process::Output, String> {
    if let Some(input) = stdin {
        command.stdin(Stdio::piped());
        let mut child = command
            .spawn()
            .map_err(|err| format!("failed to run Inpainter core: {err}"))?;
        if let Some(mut handle) = child.stdin.take() {
            handle
                .write_all(input.as_bytes())
                .map_err(|err| format!("failed to write Inpainter core input: {err}"))?;
        }
        return child
            .wait_with_output()
            .map_err(|err| format!("failed to run Inpainter core: {err}"));
    }
    command
        .output()
        .map_err(|err| format!("failed to run Inpainter core: {err}"))
}

fn command_with_home(mut command: Command, home: &AppHome) -> Command {
    command.env("INPAINTER_HOME", home.root());
    command.env("INPAINTER_AUTH_URL", auth_base_url());
    command
}

pub fn auth_base_url() -> String {
    std::env::var("INPAINTER_AUTH_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:8787".to_string())
}

fn tsx_bin(project: &Path) -> PathBuf {
    let bin_dir = project.join("node_modules").join(".bin");
    if cfg!(windows) {
        bin_dir.join("tsx.cmd")
    } else {
        bin_dir.join("tsx")
    }
}

pub(crate) fn use_source_core() -> bool {
    use_source_core_with(std::env::var("INPAINTER_DEV").ok().as_deref(), cfg!(debug_assertions))
}

fn use_source_core_with(dev: Option<&str>, debug_build: bool) -> bool {
    match dev.map(|value| value.trim().to_ascii_lowercase()) {
        Some(value) if matches!(value.as_str(), "0" | "false" | "no") => false,
        Some(value) if matches!(value.as_str(), "1" | "true" | "yes") => true,
        _ => debug_build,
    }
}

fn resolve_core_project() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("INPAINTER_CORE_DIR") {
        let path = PathBuf::from(dir);
        if path.join("package.json").is_file() {
            return Ok(path);
        }
        return Err(format!(
            "INPAINTER_CORE_DIR does not look like Inpainter core: {}",
            path.display()
        ));
    }

    paths::resolve_core_project().map_err(|err| {
        format!("{err} Set INPAINTER_CORE_DIR or INPAINTER_CORE_BIN, or install to ~/.inpainter.")
    })
}

#[cfg(test)]
mod tests {
    use super::use_source_core_with;

    #[test]
    fn debug_builds_use_source_core_by_default() {
        assert!(use_source_core_with(None, true));
        assert!(!use_source_core_with(None, false));
    }

    #[test]
    fn inpainter_dev_overrides_build_mode() {
        assert!(!use_source_core_with(Some("0"), true));
        assert!(use_source_core_with(Some("1"), false));
        assert!(use_source_core_with(Some("true"), false));
        assert!(!use_source_core_with(Some("false"), true));
    }
}
