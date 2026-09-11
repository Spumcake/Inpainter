import json
import subprocess
import sys
import unittest
from pathlib import Path

HOST = Path(__file__).resolve().parents[1]


class HostProtocolTests(unittest.TestCase):
    def test_init_boot_submit_cancel_and_stale_reply(self):
        process = subprocess.Popen(
            [sys.executable, "-u", "-m", "studio_host"],
            cwd=HOST,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        def stop() -> None:
            if process.poll() is None:
                process.stdin.close()
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
            process.stdout.close()
            process.stderr.close()

        self.addCleanup(stop)

        def request(payload):
            process.stdin.write(json.dumps(payload) + "\n")
            process.stdin.flush()
            line = process.stdout.readline()
            body = json.loads(line)
            self.assertTrue(body["ok"], body)
            return body

        initial = request({"id": 1, "op": "init"})
        boot = request({"id": 2, "op": "transition", "state": initial["state"], "event": {"type": "app.boot"}})
        self.assertTrue(any(item["type"] == "operation.auth" for item in boot["effects"]))
        ready = request({
            "id": 3,
            "op": "transition",
            "state": boot["state"],
            "event": {"type": "auth.completed", "authenticated": True},
        })
        self.assertEqual(next(item["child"] for item in ready["effects"] if item["type"] == "ui.feed.show"), "idle-waiting")
        working = request({
            "id": 4,
            "op": "transition",
            "state": ready["state"],
            "event": {"type": "input.submitted", "text": "Hello"},
        })
        self.assertEqual(working["state"]["feed"]["child"], "chat-assistant")
        request_id = working["state"]["feed"]["request_id"]
        cancelled = request({
            "id": 5,
            "op": "transition",
            "state": working["state"],
            "event": {"type": "request.cancel"},
        })
        stale = request({
            "id": 6,
            "op": "transition",
            "state": cancelled["state"],
            "event": {"type": "request.completed", "request_id": request_id, "reply": "late"},
        })
        self.assertEqual(stale["state"]["phase"], "idle")
        self.assertFalse(any(item.get("role") == "assistant" for item in stale["state"]["feed"]["messages"]))
