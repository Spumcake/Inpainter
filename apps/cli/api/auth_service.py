from __future__ import annotations

import os

import httpx

from core.errors import CliError

DEFAULT_AUTH_URL = "http://127.0.0.1:8787"


def auth_base_url() -> str:
    return os.environ.get("INPAINTER_AUTH_URL", DEFAULT_AUTH_URL).rstrip("/")


def exchange_code(code: str, verifier: str) -> dict:
    try:
        response = httpx.post(
            f"{auth_base_url()}/exchange",
            json={"code": code, "verifier": verifier},
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise CliError(f"exchange request failed: {exc}") from exc

    try:
        body = response.json()
    except ValueError as exc:
        raise CliError("exchange response was not json") from exc

    if not response.is_success:
        message = body.get("error") if isinstance(body, dict) else None
        raise CliError(message if isinstance(message, str) else "token exchange failed")
    if not isinstance(body, dict):
        raise CliError("exchange response was not json")
    return body
