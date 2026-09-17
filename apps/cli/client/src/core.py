"""Resolve and run the TypeScript core command interface."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

from src.errors import CoreError
from src.paths import client_root


def inpainter_home() -> Path:
    env = os.environ.get("INPAINTER_HOME")
    if env:
        return Path(env)
    return Path.home() / ".inpainter"


def core_project() -> Path:
    env = os.environ.get("INPAINTER_CORE_DIR")
    if env:
        path = Path(env)
        if (path / "package.json").is_file():
            return path
        raise CoreError(f"INPAINTER_CORE_DIR does not look like Inpainter core: {path}")
    current = client_root().resolve()
    for candidate in [current, *current.parents]:
        path = candidate / "core"
        if (path / "package.json").is_file():
            return path
    raise CoreError("Could not find Inpainter core. Set INPAINTER_CORE_DIR or INPAINTER_CORE_BIN.")


def installed_core_bin() -> Path | None:
    path = inpainter_home() / "bin" / "inpainter-core"
    if path.exists():
        return path
    return None


def core_command() -> list[str]:
    env_bin = os.environ.get("INPAINTER_CORE_BIN")
    if env_bin:
        path = Path(env_bin)
        if not path.exists():
            raise CoreError(f"INPAINTER_CORE_BIN does not exist: {path}")
        return [str(path)]
    installed = installed_core_bin()
    if installed:
        return [str(installed)]
    project = core_project()
    tsx = project / "node_modules" / ".bin" / ("tsx.cmd" if os.name == "nt" else "tsx")
    entry = project / "src" / "cli.ts"
    if not tsx.exists() or not entry.exists():
        raise CoreError(
            f"Inpainter core is not installed at {project}. Run installer/install.sh or pnpm install in core/."
        )
    return [str(tsx), str(entry)]


def uses_checkout_core() -> bool:
    return not os.environ.get("INPAINTER_CORE_BIN") and installed_core_bin() is None


def run_core(args: list[str], params: dict | None = None) -> dict:
    command = core_command()
    project = core_project() if uses_checkout_core() else None
    env = os.environ.copy()
    env.setdefault("INPAINTER_HOME", str(inpainter_home()))
    completed = subprocess.run(
        [*command, *args],
        input=json.dumps(params) if params is not None else None,
        capture_output=True,
        text=True,
        cwd=str(project) if project else None,
        env=env,
        check=False,
    )
    stdout = completed.stdout.strip()
    try:
        body = json.loads(stdout) if stdout else {}
    except json.JSONDecodeError as exc:
        detail = completed.stderr.strip()[-500:] or stdout[-500:]
        raise CoreError(f"Core returned no valid JSON response: {detail}") from exc
    if not isinstance(body, dict):
        raise CoreError("Core returned an invalid response")
    if completed.returncode or body.get("error"):
        raise CoreError(str(body.get("error") or "Core operation failed"))
    return body
