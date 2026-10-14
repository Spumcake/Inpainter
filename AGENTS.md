# AGENTS.md — Inpainter

Inpainter is a desktop framework for creative work. One host program draws a shared shell, and each kind of work is a separate sub-application that the host starts and draws through one protocol. This repository holds the code. The product's mission and version documents live in the team repository, https://github.com/Spumcake/Inpainter-Team.

The stack is Rust, egui through eframe, and Iconoir icons.

## Layout

- `host/` — the `inpainter` program: the window, the shell's common UI (tab strip, menu button, toolbar), the shared components a sub-application can declare (the properties panel and the grid), and finding and running sub-applications. It never depends on a sub-application.
- `protocol/` — the contract between the host and sub-applications: the messages, one JSON object per line, and the manifest. It is the only crate both sides share.
- `apps/<id>/` — one sub-application per folder: its crate, its `manifest.json`, and its own `AGENTS.md`. It depends on `protocol` only, never on the host or another sub-application.
- `apps/template/` — the smallest correct sub-application. New ones are copied from it.

## Rules

- The host knows sub-applications only through their manifests and the protocol. Do not put a sub-application's name, label, tool, or rule in the host.
- Every sub-application runs with no host, driven only through the protocol.
- A change to the protocol updates the **scaffolding** skill in the same commit.

## Skills

Developer skills for working on this code are in `skills/`, one folder each with a `SKILL.md`. Read the one that matches the task before starting.

- `skills/scaffolding/` — when a task creates a new sub-application, or brings an existing program into Inpainter as one.

These are for agents developing Inpainter. They are not the assistant skills a sub-application declares to Inpainter's assistant through the protocol.

## Commands

From the repository root: `cargo build`, `cargo test`, and `cargo run -p inpainter`. With more than one sub-application, `cargo run -p inpainter -- --app <id>` chooses which one the host starts. Without `--app`, it starts the first by id.
