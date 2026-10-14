mod grid;
mod icons;
mod panel;
mod process;
mod tabs;
mod toolbar;
mod widgets;
mod window;

fn main() -> eframe::Result<()> {
    let child = process::Running::start();
    window::run(child)
}
