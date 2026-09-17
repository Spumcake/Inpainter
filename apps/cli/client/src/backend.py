"""Async adapter to the shared, structured core command interface."""
import asyncio
import json
import os

from src.core import core_command, uses_checkout_core, core_project, inpainter_home

async def command(*args, params=None):
    cmd = core_command()
    cwd = str(core_project()) if uses_checkout_core() else None
    env = os.environ.copy()
    env.setdefault("INPAINTER_HOME", str(inpainter_home()))
    process = await asyncio.create_subprocess_exec(
        *cmd, *args,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=env,
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
