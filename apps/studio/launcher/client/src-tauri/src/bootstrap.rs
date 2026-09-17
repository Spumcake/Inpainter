use crate::cli;
use crate::home::AppHome;

/// Ensures application home through the installed core command.
/// Core creates missing directories and default files without overwriting user data.
pub fn initialize_on_boot() -> Result<AppHome, String> {
    let home = AppHome::resolve()?;
    cli::run(&["home", "init"]).map_err(|err| {
        format!(
            "failed to initialize application home at {}: {err}",
            home.root().display()
        )
    })?;
    eprintln!(
        "[inpainter] application home ready at {}",
        home.root().display()
    );
    Ok(home)
}
