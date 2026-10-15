# Simple Sketch — sub-application

Simple Sketch, the pressure-sensitive infinite-canvas sketching app, as an Inpainter sub-application.

## Rules for this sub-application

- It is its own program. Its crate depends on `protocol` and the shared `draw`, never on the host or on another sub-application.
- Everything the host shows for it is declared through the protocol: its tabs, menu rows, tools, properties, and the shared components it uses. Nothing about it is hard-coded in the host.
- It owns its document: how the work is arranged, how it is saved, and its undo. The host only previews a gesture and sends it when it ends; this program commits it and sends the whole document back.
- Its session, registry, store, and preferences are Simple Sketch 1.0.1's, moved whole. What its window drew is declared in `src/session/declare.rs`, and each action the host sends back runs the session call that window made, in `src/serve.rs`. Change those two files, not the moved session, when the window's parts change.
- It runs with no host, driven only through its standard input and standard output.
- It speaks the protocol defined in `protocol/` and nothing else. When it needs something the protocol cannot say, change the protocol, the host, and the scaffolding skill together. Do not work around the protocol.
- `manifest.json` registers it with the host. Its id, folder, crate, and program names are the same.
