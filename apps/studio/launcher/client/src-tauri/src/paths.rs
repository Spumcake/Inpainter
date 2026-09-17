use std::path::{Path, PathBuf};

const CORE_DIR: &str = "core";
const STUDIO_CLIENT_DIR: &str = "apps/studio/authoring/client";
const AUTH_DIR: &str = "operations/auth";

fn git_marker(root: &Path) -> PathBuf {
    root.join(".git")
}

pub fn find_repo_root(from: &Path) -> Result<PathBuf, String> {
    if let Ok(root) = std::env::var("INPAINTER_REPO_ROOT") {
        let path = PathBuf::from(root);
        validate_repo_root(&path)?;
        return path
            .canonicalize()
            .map_err(|err| format!("could not canonicalize INPAINTER_REPO_ROOT: {err}"));
    }

    let mut current = from.to_path_buf();
    if !current.is_dir() {
        current = current
            .parent()
            .ok_or_else(|| format!("could not walk up from {}", from.display()))?
            .to_path_buf();
    }

    loop {
        if git_marker(&current).exists() {
            return current.canonicalize().map_err(|err| {
                format!(
                    "could not canonicalize repo root {}: {err}",
                    current.display()
                )
            });
        }
        if !current.pop() {
            break;
        }
    }

    Err(format!(
        "could not find .git by walking up from {}. Set INPAINTER_REPO_ROOT.",
        from.display()
    ))
}

fn validate_repo_root(root: &Path) -> Result<(), String> {
    if !git_marker(root).exists() {
        return Err(format!(".git is missing at {}", git_marker(root).display()));
    }
    Ok(())
}

fn repo_root() -> Result<PathBuf, String> {
    find_repo_root(Path::new(env!("CARGO_MANIFEST_DIR")))
}

fn resolve_under(relative: &str) -> Result<PathBuf, String> {
    let root = repo_root()?;
    let candidate = root.join(relative);
    candidate.canonicalize().map_err(|err| {
        format!(
            "could not resolve {relative} at {}. ({err})",
            candidate.display()
        )
    })
}

pub fn resolve_core_project() -> Result<PathBuf, String> {
    let path = resolve_under(CORE_DIR)?;
    if !path.join("package.json").is_file() {
        return Err(format!(
            "core path does not look like Inpainter core: {}",
            path.display()
        ));
    }
    Ok(path)
}

pub fn resolve_studio_dir() -> Result<PathBuf, String> {
    let path = resolve_under(STUDIO_CLIENT_DIR)?;
    if !path.join("package.json").is_file() {
        return Err(format!(
            "studio client does not look like Studio: {}",
            path.display()
        ));
    }
    Ok(path)
}

pub fn resolve_auth_dir() -> Result<PathBuf, String> {
    let path = resolve_under(AUTH_DIR)?;
    if !path.join("package.json").is_file() {
        return Err(format!(
            "auth service does not look like Inpainter auth: {}",
            path.display()
        ));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_repo_root_from_launcher_crate() {
        let root = find_repo_root(Path::new(env!("CARGO_MANIFEST_DIR"))).expect("repo root");
        assert!(git_marker(&root).exists());
        assert!(root.join("core").join("package.json").is_file());
    }

    #[test]
    fn resolves_layout_paths() {
        resolve_core_project().expect("core");
        resolve_studio_dir().expect("studio");
        resolve_auth_dir().expect("auth");
    }
}
