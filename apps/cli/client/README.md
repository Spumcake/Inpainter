# Inpainter terminal client

From this directory:

```sh
uv sync
uv run inpainter
```

Install core first with `./installer/install.sh` from the repository root. The client uses `~/.inpainter/bin/inpainter-core` when present.

The client stays open in one Textual application. Enter submits a message; Esc interrupts the local request; Ctrl+C or `/quit` exits. `/?` lists commands, `/new` clears the current conversation, `/skill provider/name` selects a compatible installed chat skill, and `/auth` rechecks sign-in. Conversation state is retained in memory for this run, not persisted across restarts.

Sign in through the existing launcher. The client uses the core's stored credentials and leaves the launcher unchanged.

The existing local services must be running:

- `operations/auth`: `pnpm dev` (port 8787).
- `operations/api`: `pnpm dev` (port 8788).
- `~/.inpainter/providers/openai`: `uv run python -m app.main` (port 3102).

Restart an already-running provider after updating its source to load conversation-history support. Provider credentials remain with the provider. `INPAINTER_API_URL` overrides the platform URL; `INPAINTER_SKILLS_DIR` overrides the built-in skill directory for a standalone installation.

## Ownership

- `../schema/session.json` supplies client state defaults.
- `../scripts/global.ts` owns boot, commands, working/idle state, completion, failure, and cancellation.
- `../scripts/layouts/chat-assistant.ts` compiles to the input/action contract used by the client.
- `src/session.py` retains the state returned by policy before effects execute.
- `src/app.py` renders Textual widgets and executes effects; `src/backend.py` runs cancellable structured core commands.
- Core `skill show` and `invoke` resolve skills and invoke the generic platform endpoint. The provider constructs vendor requests.

The structured operation is also available as `inpainter invoke --skill openai/discuss`, accepting a JSON parameter object on stdin. Cancellation stops the local subprocess and prevents stale responses from changing the session; it does not guarantee cancellation of already-submitted remote work.

## Verification

From the repository root, after `./installer/install.sh` and `pnpm --dir apps/cli/policy install`:

```sh
pnpm --dir core test
apps/cli/client/.venv/bin/python -m unittest discover -s apps/cli/client/tests -v
PYTHONPATH=$HOME/.inpainter/providers/openai apps/cli/client/.venv/bin/python -m unittest discover -s $HOME/.inpainter/providers/openai/tests -v
```

These include headless Textual input, multi-turn history, failure/retry, cancellation, stale-result rejection, authentication transitions, platform payloads, and provider history forwarding. They use controlled backends and do not spend model credits.
