from __future__ import annotations

import os
from typing import Any

import httpx

from app.errors import (
    auth_error,
    classify_openai_http,
    invalid_request,
    timeout_error,
    unavailable,
    upstream,
)

OPENAI_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.6"
HTTP_TIMEOUT_SECONDS = 120.0


def load_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise auth_error("OPENAI_API_KEY is not configured")
    return key


def extract_reply(data: dict[str, Any]) -> str:
    output = data.get("output")
    if not isinstance(output, list):
        return ""

    parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if isinstance(content, str) and content.strip():
            parts.append(content.strip())
            continue
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return " ".join(parts).strip()


async def discuss(params: dict[str, Any]) -> str:
    message = params.get("message")
    if not isinstance(message, str) or not message.strip():
        raise invalid_request("message is required")

    model = params.get("model")
    if not isinstance(model, str) or not model.strip():
        model = DEFAULT_MODEL

    messages = params.get("messages")
    if messages is not None:
        if not isinstance(messages, list) or not messages or any(
            not isinstance(item, dict) or item.get("role") not in ("user", "assistant")
            or not isinstance(item.get("content"), str) for item in messages
        ):
            raise invalid_request("messages must contain user/assistant text messages")
    request_body = {"model": model, "input": messages if messages is not None else message.strip()}
    if params.get("instructions"):
        request_body["instructions"] = params["instructions"]
    api_key = load_api_key()
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                OPENAI_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
    except httpx.TimeoutException as exc:
        raise timeout_error(f"OpenAI request timed out: {exc}") from exc
    except httpx.RequestError as exc:
        raise unavailable(f"OpenAI request failed: {exc}") from exc

    try:
        data = response.json()
    except Exception:
        data = {"message": response.text}
    if not isinstance(data, dict):
        data = {"message": str(data)}

    if response.status_code >= 400 or data.get("error"):
        raise classify_openai_http(response.status_code, data, response.headers)

    reply = extract_reply(data)
    if not reply:
        raise upstream("OpenAI API returned no text")
    return reply
