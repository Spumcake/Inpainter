from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from inpainter.errors import CoreError
from inpainter.paths import auth_dir

ACCESS_SKEW_SECS = 30
SESSION_FILE = "session.enc"
SESSION_KEY_FILE = "session.key"


@dataclass
class StoredSession:
    access_token: str
    refresh_token: str
    expires_at: int


def now_secs() -> int:
    return int(__import__("time").time())


def session_is_fresh(session: StoredSession) -> bool:
    return now_secs() + ACCESS_SKEW_SECS < session.expires_at


def ensure_auth_dir() -> Path:
    directory = auth_dir()
    directory.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        directory.chmod(0o700)
    return directory


def load_session() -> StoredSession | None:
    directory = ensure_auth_dir()
    path = directory / SESSION_FILE
    if not path.exists():
        return None
    try:
        plain = _decrypt(_load_or_create_key(directory), path.read_bytes())
        data = json.loads(plain.decode("utf-8"))
        return StoredSession(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=int(data["expires_at"]),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError, CoreError):
        return None


def write_session(session: StoredSession) -> None:
    directory = ensure_auth_dir()
    key = _load_or_create_key(directory)
    plain = json.dumps(asdict(session), separators=(",", ":")).encode("utf-8")
    _write_restricted(directory / SESSION_FILE, _encrypt(key, plain))


def clear_session() -> None:
    path = auth_dir() / SESSION_FILE
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def session_from_token_body(body: dict) -> StoredSession:
    access_token = body.get("access_token")
    refresh_token = body.get("refresh_token")
    if not isinstance(access_token, str) or not access_token:
        raise CoreError("missing access_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise CoreError("missing refresh_token")
    expires_in = body.get("expires_in", 3600)
    if not isinstance(expires_in, int):
        try:
            expires_in = int(expires_in)
        except (TypeError, ValueError):
            expires_in = 3600
    return StoredSession(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=now_secs() + expires_in,
    )


def _load_or_create_key(directory: Path) -> bytes:
    path = directory / SESSION_KEY_FILE
    if path.exists():
        key = path.read_bytes()
        if len(key) != 32:
            raise CoreError("session key has unexpected length")
        return key
    key = os.urandom(32)
    _write_restricted(path, key)
    return key


def _encrypt(key: bytes, plain: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, plain, None)


def _decrypt(key: bytes, blob: bytes) -> bytes:
    if len(blob) < 13:
        raise CoreError("session file is truncated")
    try:
        return AESGCM(key).decrypt(blob[:12], blob[12:], None)
    except Exception as exc:
        raise CoreError("failed to decrypt session") from exc


def _write_restricted(path: Path, data: bytes) -> None:
    path.write_bytes(data)
    if os.name != "nt":
        path.chmod(0o600)
