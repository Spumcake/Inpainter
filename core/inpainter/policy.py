from __future__ import annotations

from typing import Any

from inpainter.paths import policy_dir
from inpainter.schema import apply_defaults
from inpainter.state import load_state, persist_state
from inpainter.ts_policy import run_transition


def transition(state: Any, event: dict[str, Any]) -> dict[str, Any]:
    return run_transition(policy_dir(), "global", state, event)


def dispatch(event: dict[str, Any]) -> dict[str, Any]:
    current = load_state()
    result = transition(current, event)
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
