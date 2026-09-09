# Changelog

## 2026-09-09 — Lua framework proof of concept and interactive CLI

Established separate shared-core and client scopes for the Lua scripting framework. Schemas supply payload defaults, Lua decides state transitions and effects, and Python executes operations. The terminal client now stays open for real conversations instead of stopping after a startup message.

### What we did

- Moved shared Python functionality into `core/inpainter`, including authentication, schema loading, Lua execution, core state storage, and structured operations exposed through `inpainter-core`.
- Created the CLI client under `apps/cli/client`, with client schemas and Lua scripts alongside it. Client session state is retained in memory and committed before effects execute.
- Built a Textual interface with a project/skill header, message feed, prompt input, working timer, cancellation, and help, new-conversation, skill-selection, and authentication commands.
- Added generic skill invocation through the platform API and an OpenAI discussion provider; conversation history and skill instructions are forwarded by the provider.
- Separated signed-out authentication status from core health and handled request failures without closing the client.
- Updated the launcher command adapter to use the shared core and moved Studio authoring source from `desktop` to `client`. Studio scripting remains a future implementation; its scripts are placeholders.
- Added architecture documentation and client run instructions.

### Verification and current limits

- Passed 10 automated tests covering interactive input, retained history, cancellation, stale responses, failure/retry, authentication, platform payloads, and provider history forwarding.
- Verified a live CLI request through the running platform and provider, displaying the model reply and returning to idle.
- Conversation history currently lasts for the client process. Cancellation stops the local request but does not guarantee remote cancellation.
- Existing provider processes need restarting to load updated history handling. The launcher still requires `INPAINTER_STUDIO_DIR` pointing to `apps/studio/authoring/client` because its default Studio path references the old directory.

## 2026-09-08 — CLI-owned session, Studio after sign-in

The launcher was still the place that kept the Supabase session. That would not scale: Studio, the CLI, and later MCP all need the same signed-in user. Session now lives with the CLI, the same way `gh` or `aws` keep credentials in a file and every command reads it.

After a successful sign-in (or a restored session), the launcher opens Inpainter Studio instead of stopping on "Success."

### What we did

- Stood up `apps/cli` as a uv-managed Python tool with `inpainter auth authorize-url`, `exchange`, `status`, and `logout`
- Stored the encrypted session at `~/.config/spumcake/inpainter/auth/` so the CLI, not Tauri, is the source of truth
- Rewrote the launcher to spawn that CLI for PKCE, token exchange, refresh, and logout, keeping only the browser open and the localhost callback in Rust
- Launched the Electron Studio app after a real session, and hid the launcher window while it stays in the tray
- Added a single-instance lock on Studio so a second launch focuses the existing window

## 2026-09-07 — Launcher sign-in

We wanted a real sign-in, not a fake one. Launch Inpainter, press Sign in, log in through the browser with an account that already exists, come back to the app, and see Success. No new-account signup. Just proof that the desktop app and Supabase can share the same user.

### What we did

- Wrote the identity architecture and the sign-in brief so the target was clear before any code
- Created the Supabase project, turned on Auth, and added a guest account we could actually log in with
- Put the project URL, publishable key, and guest login in local credentials (the secret key stayed off the machine’s product tree)
- Re-authenticated GitHub so the empty `Spumcake/Inpainter` repo could receive a first push
- Initialized git, ignored `.project/`, and pushed the first commit
- Built a small first-party auth service (now at `operations/auth`) that shows a sign-in page, talks to Supabase, and hands the desktop a one-time code instead of raw tokens
- Wired the launcher’s Sign in button to open the system browser, listen on localhost, exchange that code, and store the session
- Removed the splash / sign-in / success timer so Success only appears after a real session
- Added a launcher CI check on GitHub
- Clicked through the live flow and confirmed Success
- Moved the auth service out of `apps/web` (reserved for the web app) into `operations/auth`
