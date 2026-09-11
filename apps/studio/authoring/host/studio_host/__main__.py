from __future__ import annotations

import json
import sys

from studio_host.runtime import initialize, run_script


def main() -> None:
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        request = json.loads(line)
        ident = request.get("id")
        try:
            body = handle(request)
            write({"id": ident, "ok": True, **body})
        except Exception as exc:
            write({"id": ident, "ok": False, "error": str(exc)})


def handle(request: dict) -> dict:
    op = request.get("op")
    if op == "init":
        return {"state": initialize()}
    if op == "transition":
        state = request.get("state")
        event = request.get("event")
        if not isinstance(state, dict) or not isinstance(event, dict):
            raise ValueError("transition requires state and event objects")
        return run_script("global.lua", state, event)
    raise ValueError(f"unknown host operation: {op}")


def write(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
