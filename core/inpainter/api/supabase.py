from __future__ import annotations

import os

import httpx

from inpainter.errors import CoreError

DEFAULT_SUPABASE_URL = "https://zhfgxembfkkrltimhzdw.supabase.co"
DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_GZUhE3UoMBHrOOI6Z3x2NQ_QkBCPZFD"


def supabase_url() -> str:
    return os.environ.get("INPAINTER_SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/")


def supabase_publishable_key() -> str:
    return os.environ.get(
        "INPAINTER_SUPABASE_PUBLISHABLE_KEY",
        DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    )


def refresh_session(refresh_token: str) -> dict:
    key = supabase_publishable_key()
    try:
        response = httpx.post(
            f"{supabase_url()}/auth/v1/token?grant_type=refresh_token",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
            },
            json={"refresh_token": refresh_token},
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise CoreError(f"refresh request failed: {exc}") from exc

    try:
        body = response.json()
    except ValueError as exc:
        raise CoreError("refresh response was not json") from exc

    if not response.is_success:
        raise CoreError("refresh failed")
    if not isinstance(body, dict):
        raise CoreError("refresh response was not json")
    return body
