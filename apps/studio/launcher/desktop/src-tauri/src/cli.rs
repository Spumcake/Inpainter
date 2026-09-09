use std::path::PathBuf;
use std::process::Command;

pub fn run(args: &[&str]) -> Result<serde_json::Value, String> {
    let output = spawn(args)?;
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

fn spawn(args: &[&str]) -> Result<std::process::Output, String> {
    if let Ok(bin) = std::env::var("INPAINTER_CORE_BIN") {
        let path = PathBuf::from(bin);
        if !path.exists() {
            return Err(format!(
                "INPAINTER_CORE_BIN does not exist: {}",
                path.display()
            ));
        }
        return Command::new(path)
            .args(args)
            .output()
            .map_err(|err| format!("failed to run Inpainter core: {err}"));
    }

    let project = resolve_core_project()?;
    Command::new(if cfg!(windows) { "uv.exe" } else { "uv" })
        .arg("run")
        .arg("--project")
        .arg(&project)
        .arg("inpainter-core")
        .args(args)
        .output()
        .map_err(|err| format!("failed to run Inpainter core: {err}"))
}

fn resolve_core_project() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("INPAINTER_CORE_DIR") {
        let path = PathBuf::from(dir);
        if path.join("pyproject.toml").is_file() {
            return Ok(path);
        }
        return Err(format!(
            "INPAINTER_CORE_DIR does not look like Inpainter core: {}",
            path.display()
        ));
    }

    let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../../core");
    candidate.canonicalize().map_err(|err| {
        format!(
            "could not find Inpainter core at {}. Set INPAINTER_CORE_DIR or INPAINTER_CORE_BIN. ({err})",
            candidate.display()
        )
    })
}
