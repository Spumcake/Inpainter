from __future__ import annotations

from typing import Any

from inpainter.errors import CoreError
from inpainter.lua_runtime import transition

from studio_host.contract import EFFECTS, SCRIPTS
from studio_host.paths import scripts_dir
from studio_host.schema import apply_defaults

MAX_DELEGATE_DEPTH = 8


def initialize() -> dict[str, Any]:
    return apply_defaults("session", {})


def run_script(script: str, state: dict[str, Any], event: dict[str, Any], depth: int = 0) -> dict[str, Any]:
    if script not in SCRIPTS:
        raise CoreError(f"unknown lua script: {script}")
    if depth > MAX_DELEGATE_DEPTH:
        raise CoreError(f"lua delegate depth exceeded: {script}")

    def delegate(name: str, child_state: Any, child_event: Any) -> dict[str, Any]:
        next_state = child_state if isinstance(child_state, dict) else {}
        next_event = child_event if isinstance(child_event, dict) else {}
        return run_script(str(name), next_state, next_event, depth + 1)

    result = transition(scripts_dir(), script, state, event, helpers={"delegate": delegate})
    return normalize(result)


def normalize(result: dict[str, Any]) -> dict[str, Any]:
    state = result.get("state")
    if not isinstance(state, dict):
        raise CoreError("Client Lua must return session state")
    effects = _as_list(result.get("effects"))
    for effect in effects:
        if not isinstance(effect, dict) or effect.get("type") not in EFFECTS:
            raise CoreError(f"unsupported client effect: {effect}")
        if effect["type"] in ("ui.feed.show", "operation.invoke"):
            effect["messages"] = _as_message_list(effect.get("messages"))
        if effect["type"] == "ui.header":
            effect["actions"] = _as_list(effect.get("actions"))
    feed = state.get("feed")
    if not isinstance(feed, dict):
        feed = {"child": "idle-waiting", "messages": [], "request_id": 0}
        state["feed"] = feed
    feed["messages"] = _as_message_list(feed.get("messages"))
    feed["request_id"] = int(feed.get("request_id") or 0)
    if feed.get("child") not in ("idle-waiting", "chat-assistant"):
        feed["child"] = "idle-waiting"
    return {"state": state, "effects": effects}


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        if not value:
            return []
        if all(isinstance(key, int) for key in value):
            return [value[index] for index in range(1, max(value) + 1)]
    raise CoreError("Lua effects must be a list")


def _as_message_list(value: Any) -> list[Any]:
    if value is None or value == {}:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and all(isinstance(key, int) for key in value):
        return [value[index] for index in range(1, max(value) + 1)]
    raise CoreError("Conversation messages must be a list")
