from __future__ import annotations

from typing import Any


class ProviderError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool,
        retry_after: int | None = None,
        http_status: int = 502,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.retry_after = retry_after
        self.http_status = http_status

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
            "retry_after": self.retry_after,
        }


def invalid_request(message: str) -> ProviderError:
    return ProviderError("invalid_request", message, retryable=False, http_status=400)


def auth_error(message: str) -> ProviderError:
    return ProviderError("auth", message, retryable=False, http_status=401)


def rate_limit(message: str, retry_after: int | None = 60) -> ProviderError:
    return ProviderError(
        "rate_limit",
        message,
        retryable=True,
        retry_after=retry_after or 60,
        http_status=429,
    )


def timeout_error(message: str) -> ProviderError:
    return ProviderError("timeout", message, retryable=True, http_status=504)


def unavailable(message: str, retry_after: int | None = 5) -> ProviderError:
    return ProviderError(
        "unavailable",
        message,
        retryable=True,
        retry_after=retry_after,
        http_status=503,
    )


def upstream(message: str) -> ProviderError:
    return ProviderError("upstream", message, retryable=False, http_status=502)


def parse_retry_after(headers: Any) -> int | None:
    raw = None
    if headers is not None:
        raw = headers.get("retry-after") or headers.get("Retry-After")
    if raw is None:
        return None
    try:
        return max(1, int(float(raw)))
    except (TypeError, ValueError):
        return None


def classify_openai_http(status: int, body: dict[str, Any], headers: Any) -> ProviderError:
    err = body.get("error") if isinstance(body.get("error"), dict) else {}
    message = str(err.get("message") or body.get("message") or f"OpenAI HTTP {status}")
    err_type = str(err.get("type") or err.get("code") or "").lower()
    retry_after = parse_retry_after(headers)

    if status in (401, 403) or "auth" in err_type or "invalid_api_key" in err_type:
        return auth_error(message)
    if status == 429 or "rate" in err_type:
        return rate_limit(message, retry_after)
    if status == 400 or "invalid" in err_type or "content_policy" in err_type:
        return invalid_request(message)
    if status >= 500:
        return unavailable(message, retry_after or 5)
    return upstream(message)
