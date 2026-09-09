from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.discuss import discuss
from app.errors import ProviderError, invalid_request

PACKAGE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(PACKAGE_DIR / ".env")

app = FastAPI(title="openai")


class InvokeRequest(BaseModel):
    params: dict[str, Any] = Field(default_factory=dict)


@app.exception_handler(ProviderError)
async def provider_error_handler(_request: Request, exc: ProviderError) -> JSONResponse:
    return JSONResponse(status_code=exc.http_status, content=exc.to_dict())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "openai"}


@app.post("/invoke")
async def invoke(body: InvokeRequest) -> dict[str, str]:
    if not isinstance(body.params, dict):
        raise invalid_request("params must be an object")
    reply = await discuss(body.params)
    return {"reply": reply}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "3102"))
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)
