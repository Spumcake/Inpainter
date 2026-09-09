from __future__ import annotations

from typing import Any

from inpainter.lua_runtime import transition
from inpainter.paths import scripts_dir
from inpainter.schema import apply_defaults
from inpainter.state import load_state, persist_state


def dispatch(event: dict[str, Any]) -> dict[str, Any]:
    current = load_state()
    result = transition(scripts_dir(), "global.lua", current, event)
    next_state = result.get("state")
    if not isinstance(next_state, str) or not next_state:
        next_state = current or "unknown"
    persist_state(next_state)
    payload = result.get("payload")
    if not isinstance(payload, dict):
        payload = {}
    reported = apply_defaults("status", payload)
    reported["state"] = next_state
    return reported
