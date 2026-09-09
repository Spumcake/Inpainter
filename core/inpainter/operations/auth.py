from __future__ import annotations

from urllib.parse import urlencode

from inpainter.api.auth_service import auth_base_url, exchange_code
from inpainter.api.supabase import refresh_session
from inpainter.errors import CoreError
from inpainter.pending import clear_pending, take_pending, write_pending
from inpainter.pkce import pkce_challenge, random_b64
from inpainter.policy import dispatch
from inpainter.session import (
    clear_session,
    load_session,
    now_secs,
    session_from_token_body,
    session_is_fresh,
    write_session,
)


def authorize_url(redirect_uri: str) -> dict:
    state = random_b64()
    verifier = random_b64()
    challenge = pkce_challenge(verifier)
    write_pending(state, verifier)
    query = urlencode(
        {
            "state": state,
            "challenge": challenge,
            "redirect_uri": redirect_uri,
            "_": str(now_secs()),
        }
    )
    return {
        "authorize_url": f"{auth_base_url()}/sign-in?{query}",
        "state": state,
    }


def exchange(code: str, state: str) -> dict:
    pending = take_pending(state)
    body = exchange_code(code, pending.verifier)
    write_session(session_from_token_body(body))
    return status()


def status() -> dict:
    return dispatch({"type": "auth.status", **auth_facts()})


def logout() -> dict:
    clear_pending()
    clear_session()
    return status()


def crash(error: str) -> dict:
    return dispatch({"type": "core.crash", "error": error})


def auth_facts() -> dict:
    session = load_session()
    if session is None:
        return {"authenticated": False, "expires_at": None, "error": None}
    if session_is_fresh(session):
        return {
            "authenticated": True,
            "expires_at": session.expires_at,
            "error": None,
        }
    try:
        refreshed = session_from_token_body(refresh_session(session.refresh_token))
        write_session(refreshed)
        return {
            "authenticated": True,
            "expires_at": refreshed.expires_at,
            "error": None,
        }
    except CoreError as exc:
        clear_session()
        return {"authenticated": False, "expires_at": None, "error": str(exc)}
