# Inpainter CLI

The terminal client lives in `client/`. Install core, then open the client from that directory after installing its Python environment with uv.

```sh
./installer/install.sh
cd apps/cli/client
uv sync
uv run inpainter
```

That starts a Textual app in the current terminal. Press Enter to send a message, Esc to interrupt the local request, and Ctrl+C or `/quit` to leave. Type `/?` for the command list.

Sign in first through the desktop launcher. The CLI reads the same stored credentials and leaves the launcher unchanged. For a live conversation, the local auth, API, and provider services also need to be running; those details are in `client/README.md`.
