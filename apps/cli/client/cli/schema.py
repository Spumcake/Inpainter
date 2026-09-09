from __future__ import annotations

import json
from typing import Any

from inpainter.errors import CoreError

from cli.paths import schema_dir


def apply_defaults(name: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    path = schema_dir() / f"{name}.json"
    try:
        schema = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CoreError(f"missing client schema: {name}") from exc
    except json.JSONDecodeError as exc:
        raise CoreError(f"unreadable client schema: {name}") from exc
    incoming = payload or {}
    if not isinstance(schema, dict):
        return dict(incoming)
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return dict(incoming)
    result: dict[str, Any] = {}
    for key, spec in properties.items():
        if not isinstance(spec, dict):
            continue
        if key in incoming:
            result[key] = incoming[key]
        else:
            result[key] = spec.get("default")
    return result
