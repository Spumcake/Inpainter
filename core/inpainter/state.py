from __future__ import annotations

import json
import os
from pathlib import Path

from inpainter.paths import core_state_dir

STATE_FILE = "state.json"


def load_state() -> str | None:
    path = _state_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    state = data.get("state")
    return state if isinstance(state, str) else None


def persist_state(state: str) -> None:
    directory = core_state_dir()
    directory.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        directory.chmod(0o700)
    path = directory / STATE_FILE
    path.write_text(json.dumps({"state": state}, separators=(",", ":")), encoding="utf-8")
    if os.name != "nt":
        path.chmod(0o600)


def _state_path() -> Path:
    return core_state_dir() / STATE_FILE
