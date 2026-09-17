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

Re-running refreshes `runtime/` and `bootstrap/`, then initializes again without overwriting existing settings, registry, installs, or workspace files.

Add `~/.inpainter/bin` to `PATH` only if you want the command in a shell. The launcher uses the absolute path.
