"""Stdio client for the local CLI policy package."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from src.errors import CoreError


def run_transition(package: Path, script: str, state: Any, event: dict[str, Any]) -> dict[str, Any]:
    body = _request(package, {"op": "transition", "script": script, "state": state, "event": event})
    return {
        "state": body.get("state"),
        "effects": body.get("effects") or [],
        "payload": body.get("payload") or {},
    }


def _request(package: Path, payload: dict[str, Any]) -> dict[str, Any]:
    command = _command(package)
    try:
        completed = subprocess.run(
            command,
            input=json.dumps({"id": 1, **payload}) + "\n",
            capture_output=True,
            text=True,
            cwd=str(package),
            check=False,
        )
    except OSError as exc:
        raise CoreError(f"failed to start policy runtime: {exc}") from exc
    if not completed.stdout.strip():
        detail = completed.stderr.strip()[-500:] or "policy runtime returned no output"
        raise CoreError(detail)
    try:
        body = json.loads(completed.stdout.splitlines()[-1])
    except json.JSONDecodeError as exc:
        raise CoreError("policy runtime returned invalid JSON") from exc
    if not body.get("ok"):
        raise CoreError(str(body.get("error") or "policy transition failed"))
    return body


def _command(package: Path) -> list[str]:
    entry = package / "src" / "cli.ts"
    tsx = package / "node_modules" / ".bin" / "tsx"
    if not tsx.exists() or not entry.exists():
        raise CoreError(f"policy runtime is not installed: {package}")
    return [str(tsx), str(entry)]
