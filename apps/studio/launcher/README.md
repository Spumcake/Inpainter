# Inpainter launcher

The launcher is the desktop shell that signs you in, keeps machine-level settings, and hands a workspace to Studio. It is a Tauri app: the native host is in `client/`, and the UI is in `frontend/`.

Install Inpainter core first:

```sh
./installer/install.sh
```

Then install both launcher packages and start the native app from `client/`:

```sh
pnpm --dir frontend install
pnpm --dir client install
cd client
pnpm dev
```

`pnpm dev` runs Tauri, which compiles the Rust host and starts the Vite frontend on port 3210. You need Node, pnpm, and a working Rust toolchain. On Linux, the usual Tauri WebKitGTK packages must be installed as well.

If Vite comes up but Cargo then fails to read plugin permissions from `apps/studio/launcher/desktop/src-tauri/target/...`, that is leftover build cache from when this folder was named `desktop/`. Cargo still has the old absolute paths in `client/src-tauri/target`. Delete that directory and start again:

```sh
rm -rf src-tauri/target
pnpm dev
```

The first rebuild after that is slower. The missing file is not a source problem.

Press Sign in and finish in the browser. After a successful session (or a restored one), the launcher starts Studio and hides itself in the tray.

The launcher calls `~/.inpainter/bin/inpainter-core` by absolute path in production builds. `pnpm dev` (a debug build) uses the checkout `core/` command instead, while still passing `INPAINTER_HOME` so settings, installs, and workspaces come from `~/.inpainter`. Set `INPAINTER_DEV=1` to force source core, or `INPAINTER_DEV=0` to force the installed binary. `INPAINTER_CORE_BIN` still wins when set. `INPAINTER_CORE_DIR` selects which checkout. When the launcher starts Studio, it forwards those variables so authoring uses the same core. `INPAINTER_STUDIO_DIR` and `INPAINTER_STUDIO_BIN` still override Studio; `INPAINTER_REPO_ROOT` still overrides git-root discovery for Studio.

`pnpm dev` also starts the local auth worker at `http://127.0.0.1:8787` if it is not already running, so Sign in works without a separate terminal. Auth logs go to `~/.inpainter/logs/auth-dev.log`. Set `INPAINTER_AUTH_URL` to a non-loopback origin to skip that spawn. `INPAINTER_AUTH_DIR` overrides the `operations/auth` checkout.
