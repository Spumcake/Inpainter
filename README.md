# Inpainter

From this directory, with Rust 1.95, build the host and its sub-applications:

```
cargo build
```

The programs land in `target/debug`.

Open the window:

```
cargo run -p inpainter
```

The host finds each sub-application by its `apps/<id>/manifest.json` and starts the first by id, or the one named with `cargo run -p inpainter -- --app <id>`. Today the only sub-application is the template.

The window is titled Inpainter. It has a Template tab, an empty toolbar, a grid, and a panel tab on the right. The menu button, the plus, and the tab's close mark do nothing. The panel tab opens and closes an empty column.

To add a sub-application, follow `skills/scaffolding/SKILL.md`.
