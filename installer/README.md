# Inpainter installer

Installs core and shipped setup resources into `~/.inpainter` (or `INPAINTER_HOME`). Node, pnpm, and uv must already be on this machine.

From the repository:

```sh
./installer/install.sh
```

The script places:

- `runtime/` — core package and `policy-runtime`
- `bin/inpainter-core` — command wrapper
- `bootstrap/` — shipped defaults
- `installs/` — included skills, created if missing
- `providers/openai/` — OpenAI provider with its own uv environment
- then runs `inpainter-core home init` to seed missing `config/` files and the Local workspace

Installed core includes `document`, `folder`, `asset`, and `document session` commands. See `ARCHITECTURE.md` for command lifetime and a short usage example.

Re-running stages a new runtime, validates it, then switches it in. The wrapper records an absolute Node path so GUI clients do not depend on `PATH`. Existing `config/` files are kept; leftover root-level `settings.json` and `launcher.json` are copied into `config/` if those files are not already there.

Add `~/.inpainter/bin` to `PATH` only if you want the command in a shell. The launcher uses the absolute path.
