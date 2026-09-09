"""Async adapter to the shared, structured core command interface."""
import asyncio
import json
import sys

async def command(*args, params=None):
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "inpainter", *args,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await process.communicate(json.dumps(params).encode() if params is not None else None)
    except asyncio.CancelledError:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    try:
        body = json.loads(stdout)
    except ValueError as exc:
        raise RuntimeError("Core returned no valid JSON response: " + stderr.decode(errors="replace")[-500:]) from exc
    if process.returncode or body.get("error"):
        raise RuntimeError(str(body.get("error") or "Core operation failed"))
    return body
