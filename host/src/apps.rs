//! Finding sub-applications. Each one is registered by its manifest,
//! `apps/<id>/manifest.json`, and its program sits beside the host's
//! executable. The host knows sub-applications only through these files.

use protocol::Manifest;
use std::path::{Path, PathBuf};

/// A sub-application whose manifest is valid and whose program exists.
pub struct App {
    pub manifest: Manifest,
    pub executable: PathBuf,
}

/// Folders that hold one folder per sub-application, in search order:
/// `apps` beside the host's executable, then, in a development build, the
/// workspace's own `apps` folder.
fn roots(exe_dir: &Path) -> Vec<PathBuf> {
    #[allow(unused_mut)]
    let mut roots = vec![exe_dir.join("apps")];
    #[cfg(debug_assertions)]
    roots.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("../apps"));
    roots
}

/// Every registered sub-application, ordered by id. An id found again in a
/// later folder is skipped. A manifest that does not parse, or whose program
/// is missing, is reported on stderr and skipped.
pub fn discover() -> Vec<App> {
    let Ok(exe) = std::env::current_exe() else {
        return Vec::new();
    };
    let Some(exe_dir) = exe.parent() else {
        return Vec::new();
    };
    let mut apps: Vec<App> = Vec::new();
    for root in roots(exe_dir) {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        let mut folders: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.is_dir())
            .collect();
        folders.sort();
        for folder in folders {
            let path = folder.join(protocol::MANIFEST_FILE);
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            let manifest = match protocol::parse_manifest(&text) {
                Ok(manifest) => manifest,
                Err(error) => {
                    eprintln!("inpainter: {}: {error}", path.display());
                    continue;
                }
            };
            if apps.iter().any(|app| app.manifest.id == manifest.id) {
                continue;
            }
            let executable = exe_dir.join(&manifest.executable);
            if !executable.is_file() {
                eprintln!(
                    "inpainter: {}: no program at {}",
                    manifest.id,
                    executable.display()
                );
                continue;
            }
            apps.push(App {
                manifest,
                executable,
            });
        }
    }
    apps.sort_by(|a, b| a.manifest.id.cmp(&b.manifest.id));
    apps
}

/// The sub-application to start: the one `--app <id>` names, or, with no
/// `--app`, the first by id. An unknown id starts nothing.
pub fn choose(apps: Vec<App>, requested: Option<&str>) -> Option<App> {
    match requested {
        Some(id) => {
            let found = apps.into_iter().find(|app| app.manifest.id == id);
            if found.is_none() {
                eprintln!("inpainter: no sub-application with id {id:?}");
            }
            found
        }
        None => apps.into_iter().next(),
    }
}

/// The value of `--app <id>` on the host's command line, if any.
pub fn requested() -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--app" {
            return args.next();
        }
    }
    None
}
