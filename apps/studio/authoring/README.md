# Inpainter Studio

Studio is the desktop authoring window. Its Electron app lives in `client/`. From that directory, install dependencies and start it:

```sh
cd client
pnpm install
pnpm dev
```

An Electron window titled Inpainter Studio should open. The usual path is to sign in with the launcher first, then let the launcher start Studio for you. Opening Studio directly still works for development; it uses the same stored session.

Studio talks to Inpainter core through `~/.inpainter/bin/inpainter-core` when packaged. `pnpm dev` uses the checkout `core/` command and still reads application home from `INPAINTER_HOME` or `~/.inpainter`. Set `INPAINTER_DEV=1` to force source core, or `INPAINTER_DEV=0` to force the installed binary. `INPAINTER_CORE_BIN` still wins when set. Until core is reachable and the session is signed in, Studio shows a single status message instead of the working UI.
