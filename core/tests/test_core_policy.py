from __future__ import annotations

import unittest

from inpainter.policy import transition
from inpainter.schema import apply_defaults


class CorePolicyTests(unittest.TestCase):
    def test_signed_out_core_is_still_healthy(self) -> None:
        result = transition(
            None,
            {
                "type": "auth.status",
                "authenticated": False,
                "expires_at": None,
                "error": None,
            },
        )
        self.assertEqual(result["state"], "healthy")
        payload = apply_defaults("status", result["payload"])
        self.assertFalse(payload["authenticated"])
        self.assertFalse(payload["crashed"])

    def test_authenticated_status_is_healthy(self) -> None:
        result = transition(
            "unhealthy",
            {
                "type": "auth.status",
                "authenticated": True,
                "expires_at": 1_800_000_000,
                "error": None,
            },
        )
        self.assertEqual(result["state"], "healthy")
        payload = apply_defaults("status", result["payload"])
        self.assertTrue(payload["authenticated"])
        self.assertEqual(payload["expires_at"], 1_800_000_000)

    def test_crash_event_is_crashed(self) -> None:
        result = transition(
            "healthy",
            {"type": "core.crash", "error": "boom"},
        )
        self.assertEqual(result["state"], "crashed")
        payload = apply_defaults("status", result["payload"])
        self.assertTrue(payload["crashed"])
        self.assertEqual(payload["error"], "boom")


if __name__ == "__main__":
    unittest.main()
