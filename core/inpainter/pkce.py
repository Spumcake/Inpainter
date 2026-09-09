import base64
import hashlib
import secrets


def random_b64(nbytes: int = 32) -> str:
    return _b64url(secrets.token_bytes(nbytes))


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return _b64url(digest)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")
