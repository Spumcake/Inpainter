from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from core.errors import CliError
from core.paths import auth_dir
from core.session import ensure_auth_dir, now_secs

PENDING_FILE = "pending.json"
PENDING_TTL_SECS = 10 * 60


@dataclass
class PendingSignIn:
    state: str
    verifier: str
    expires_at: int


def write_pending(state: str, verifier: str) -> None:
    directory = ensure_auth_dir()
    pending = PendingSignIn(
        state=state,
        verifier=verifier,
        expires_at=now_secs() + PENDING_TTL_SECS,
    )
    path = directory / PENDING_FILE
    path.write_text(json.dumps(asdict(pending), separators=(",", ":")), encoding="utf-8")
    if os.name != "nt":
        path.chmod(0o600)


def take_pending(state: str) -> PendingSignIn:
    path = auth_dir() / PENDING_FILE
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CliError("no sign-in is in progress") from exc
    except json.JSONDecodeError as exc:
        _remove(path)
        raise CliError("pending sign-in is unreadable") from exc

    try:
        pending = PendingSignIn(
            state=str(data["state"]),
            verifier=str(data["verifier"]),
            expires_at=int(data["expires_at"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        _remove(path)
        raise CliError("pending sign-in is invalid") from exc

    if pending.expires_at <= now_secs():
        _remove(path)
        raise CliError("pending sign-in expired")
    if pending.state != state:
        raise CliError("sign-in state mismatch")
    _remove(path)
    return pending


def clear_pending() -> None:
    _remove(auth_dir() / PENDING_FILE)


def _remove(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass
