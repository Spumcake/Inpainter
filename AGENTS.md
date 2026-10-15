# AGENTS.md — Inpainter

Inpainter is a desktop framework for creative work. One host program draws a shared shell, and each kind of work is a separate sub-application that the host starts and draws through one protocol. This repository holds the code. The product's mission and version documents live in the team repository, https://github.com/Spumcake/Inpainter-Team.

The stack is Rust, egui through eframe, and Iconoir icons.

## Layout

- `host/` — the `inpainter` program: the window, the shell's common UI (tab strip, menu button, toolbar), the shared components a sub-application can declare (the properties panel with its outliner, the grid, and the drawing surface), the questions and file dialogs a sub-application asks for, and finding and running sub-applications. It draws every toolbar item, menu row, panel row, and tab from what the selected tab's sub-application declared, and sends back the action each one carries. It never depends on a sub-application.
- `protocol/` — the contract between the host and sub-applications: the messages, one JSON object per line, the declarations, and the manifest.
- `draw/` — the shared document model of the drawing surface: documents, steps, ink, text, the camera, and gestures. The host draws and previews with it; a sub-application that owns such documents commits and records with it. It has no session, history, registry, store, or preferences.
- `apps/<id>/` — one sub-application per folder: its crate, its `manifest.json`, and its own `AGENTS.md`. It depends on `protocol`, and on `draw` when it uses the drawing surface, never on the host or another sub-application.
- `apps/template/` — the smallest correct sub-application. New ones are copied from it.
- `client/` — `sketch-client`, the no-host check: it drives `simple-sketch` through the protocol alone and compares every reply with an in-process session.

## Rules

- The host knows sub-applications only through their manifests and the protocol. Do not put a sub-application's name, label, tool, or rule in the host.
- Every sub-application runs with no host, driven only through the protocol.
- A change to the protocol updates the **scaffolding** skill in the same commit.

## Skills

Developer skills for working on this code are in `skills/`, one folder each with a `SKILL.md`. Read the one that matches the task before starting.

- `skills/scaffolding/` — when a task creates a new sub-application, or brings an existing program into Inpainter as one.

These are for agents developing Inpainter. They are not the assistant skills a sub-application declares to Inpainter's assistant through the protocol.

## Commands

From the repository root: `cargo build`, `cargo test`, and `cargo run -p inpainter`. `cargo run -p inpainter` builds only the host, so run `cargo build` first whenever a sub-application changed; the host starts the sub-application programs already built in `target/`. `cargo run -p inpainter -- --app <id>` chooses which sub-application the host starts; `--app` may be given more than once, and every one named runs in the same window. Without `--app`, it starts the first by id. `target/debug/sketch-client` runs the no-host check after a build. With `INPAINTER_TRACE=1`, the host writes every message to and from sub-applications to standard error.
