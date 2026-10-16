mod apps;
mod ask;
mod canvas;
mod chat;
mod dialogs;
mod doc;
mod grid;
mod icons;
mod outliner;
mod panel;
mod process;
mod route;
mod tablet;
mod tabs;
mod toolbar;
mod widgets;
mod window;
mod workspace;

fn main() -> eframe::Result<()> {
    let requested = apps::requested();
    let started = apps::choose(apps::discover(), &requested)
        .into_iter()
        .map(|app| window::Started {
            running: process::Running::start(
                &app.executable,
                apps::data_dir(&app.manifest.id),
                false,
            ),
            id: app.manifest.id,
            name: app.manifest.name,
            executable: Some(app.executable),
        })
        .collect();
    window::run(started)
}
