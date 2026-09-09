from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from inpainter.errors import CoreError
from inpainter.paths import schema_dir


def load_schema(name: str) -> dict[str, Any]:
    path = schema_dir() / f"{name}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CoreError(f"missing schema: {name}") from exc
    except json.JSONDecodeError as exc:
        raise CoreError(f"unreadable schema: {name}") from exc
    if not isinstance(data, dict):
        raise CoreError(f"schema is not an object: {name}")
    return data


def apply_defaults(name: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    schema = load_schema(name)
    incoming = payload or {}
    result: dict[str, Any] = {}
    properties = schema.get("properties")
    if not isinstance(properties, dict):
        return dict(incoming)
    for key, spec in properties.items():
        if not isinstance(spec, dict):
            continue
        if key in incoming:
            result[key] = incoming[key]
        else:
            result[key] = spec.get("default")
    return result


def schema_path(name: str) -> Path:
    return schema_dir() / f"{name}.json"
