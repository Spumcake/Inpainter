"""Skill resolution and generic platform invocation; no vendor protocol here."""
from __future__ import annotations
import json
import os
from pathlib import Path
import httpx
from inpainter.errors import CoreError


def skill_root() -> Path:
    return Path(os.environ.get("INPAINTER_SKILLS_DIR", Path(__file__).resolve().parents[3] / "skills"))


def load_skill(skill_id: str) -> dict:
    root = skill_root().resolve()
    path = (root / f"{skill_id}.json").resolve()
    if not path.is_relative_to(root):
        raise CoreError("invalid skill path")
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError) as exc:
        raise CoreError(f"Cannot load skill {skill_id}") from exc
    if not isinstance(data, dict) or not all(isinstance(data.get(k), str) and data[k] for k in ("id", "endpoint", "layout", "model")):
        raise CoreError(f"Incomplete skill: {skill_id}")
    prompt = path.with_suffix(".md")
    data["instructions"] = prompt.read_text() if prompt.exists() else ""
    return data


def invoke(skill_id: str, params: dict) -> dict:
    skill = load_skill(skill_id)
    payload = {**params, "model": skill["model"], "instructions": skill["instructions"]}
    url = os.environ.get("INPAINTER_API_URL", "http://127.0.0.1:8788").rstrip("/")
    try:
        response = httpx.post(f"{url}/v1/invoke", json={"endpoint": skill["endpoint"], "params": payload}, timeout=120)
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CoreError(f"Platform request failed ({url}): {exc}") from exc
    if not isinstance(body, dict):
        raise CoreError("Platform returned an invalid response")
    if response.is_error or body.get("error"):
        raise CoreError(str(body.get("error") or f"Platform returned HTTP {response.status_code}"))
    return body
