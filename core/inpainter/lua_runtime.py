from __future__ import annotations

from pathlib import Path
from typing import Any

from lupa import LuaRuntime

from inpainter.errors import CoreError


def transition(
    scripts_dir: Path,
    script: str,
    state: Any,
    event: dict[str, Any],
) -> dict[str, Any]:
    path = scripts_dir / script
    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise CoreError(f"missing lua script: {script}") from exc

    runtime = LuaRuntime(unpack_returned_tuples=True)
    try:
        runtime.execute(source)
    except Exception as exc:
        raise CoreError(f"failed to load lua script: {script}") from exc

    fn = runtime.globals()["transition"]
    if fn is None:
        raise CoreError(f"lua script has no transition function: {script}")

    try:
        result = fn(_to_lua(runtime, state), _to_lua(runtime, event))
    except Exception as exc:
        raise CoreError(f"lua transition failed: {script}") from exc

    converted = _from_lua(result)
    if converted is None:
        return {"state": state, "effects": [], "payload": {}}
    if not isinstance(converted, dict):
        raise CoreError(f"lua transition must return a table: {script}")
    return converted


def _to_lua(runtime: LuaRuntime, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        table = runtime.table()
        for key, item in value.items():
            table[key] = _to_lua(runtime, item)
        return table
    if isinstance(value, (list, tuple)):
        table = runtime.table()
        for index, item in enumerate(value, start=1):
            table[index] = _to_lua(runtime, item)
        return table
    return value


def _from_lua(value: Any) -> Any:
    lua_type = getattr(value, "__class__", type(value)).__name__
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if lua_type == "NoneType":
        return None
    try:
        items = dict(value)
    except TypeError:
        return value

    converted = {_from_lua(key): _from_lua(item) for key, item in items.items()}
    if not converted:
        return {}
    if all(isinstance(key, int) for key in converted):
        return [converted[index] for index in range(1, max(converted) + 1)]
    return converted
