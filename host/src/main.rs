mod apps;
mod ask;
mod canvas;
mod dialogs;
mod doc;
mod grid;
mod icons;
mod outliner;
mod panel;
mod process;
mod tablet;
mod tabs;
mod toolbar;
mod widgets;
mod window;

fn main() -> eframe::Result<()> {
    let requested = apps::requested();
    let started = apps::choose(apps::discover(), &requested)
        .into_iter()
        .map(|app| window::Started {
            running: process::Running::start(&app.executable, apps::data_dir(&app.manifest.id)),
            name: app.manifest.name,
        })
        .collect();
    window::run(started)
}
