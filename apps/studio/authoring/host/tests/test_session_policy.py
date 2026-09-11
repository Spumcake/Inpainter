import unittest

from studio_host.runtime import initialize, run_script


def dispatch(state, event):
    return run_script("global.lua", state, event)


def boot(authenticated=True, **auth):
    state = initialize()
    state = dispatch(state, {"type": "app.boot"})["state"]
    result = dispatch(state, {"type": "auth.completed", "authenticated": authenticated, **auth})
    return result["state"], result["effects"]


def effect(effects, kind):
    return next(item for item in effects if item["type"] == kind)


class SessionPolicyTests(unittest.TestCase):
    def test_boot_shows_idle_waiting(self):
        state, effects = boot(True)
        self.assertEqual(state["phase"], "idle")
        self.assertEqual(state["feed"]["child"], "idle-waiting")
        self.assertEqual(effect(effects, "ui.feed.show")["child"], "idle-waiting")
        self.assertEqual(effect(effects, "ui.header")["title"], "Workspace")
        self.assertTrue(effect(effects, "ui.feed.show")["submit_available"])

    def test_signed_out_keeps_idle_and_rejects_submit(self):
        state, effects = boot(False)
        self.assertEqual(state["phase"], "signed_out")
        self.assertEqual(effect(effects, "ui.feed.show")["child"], "idle-waiting")
        self.assertFalse(effect(effects, "ui.feed.show")["submit_available"])
        result = dispatch(state, {"type": "input.submitted", "text": "Hello"})
        self.assertEqual(result["state"]["phase"], "signed_out")
        self.assertEqual(result["state"]["feed"]["child"], "idle-waiting")
        self.assertFalse(result["state"]["feed"]["messages"])

    def test_submit_switches_to_chat_and_invokes(self):
        state, _ = boot(True)
        result = dispatch(state, {"type": "input.submitted", "text": "Hello"})
        state, effects = result["state"], result["effects"]
        self.assertEqual(state["phase"], "working")
        self.assertEqual(state["feed"]["child"], "chat-assistant")
        self.assertEqual(state["feed"]["messages"][0]["content"], "Hello")
        self.assertEqual(effect(effects, "ui.feed.show")["child"], "chat-assistant")
        invoke = effect(effects, "operation.invoke")
        self.assertEqual(invoke["request_id"], state["feed"]["request_id"])
        self.assertEqual(invoke["skill"], "openai/discuss")
        self.assertEqual(invoke["messages"][0]["content"], "Hello")

    def test_completion_appends_assistant_and_keeps_chat(self):
        state, _ = boot(True)
        state = dispatch(state, {"type": "input.submitted", "text": "Hello"})["state"]
        request_id = state["feed"]["request_id"]
        result = dispatch(state, {"type": "request.completed", "request_id": request_id, "reply": "Hi there"})
        state = result["state"]
        self.assertEqual(state["phase"], "idle")
        self.assertEqual(state["feed"]["child"], "chat-assistant")
        self.assertEqual([item["role"] for item in state["feed"]["messages"]], ["user", "assistant"])
        self.assertEqual(state["feed"]["messages"][1]["content"], "Hi there")

    def test_stale_completion_ignored(self):
        state, _ = boot(True)
        state = dispatch(state, {"type": "input.submitted", "text": "Hello"})["state"]
        old = state["feed"]["request_id"]
        state = dispatch(state, {"type": "request.cancel"})["state"]
        result = dispatch(state, {"type": "request.completed", "request_id": old, "reply": "late"})
        self.assertEqual(result["state"]["phase"], "idle")
        self.assertFalse(any(item.get("role") == "assistant" for item in result["state"]["feed"]["messages"]))

    def test_failure_and_retry_keeps_conversation(self):
        state, _ = boot(True)
        state = dispatch(state, {"type": "input.submitted", "text": "Hello"})["state"]
        request_id = state["feed"]["request_id"]
        state = dispatch(state, {"type": "request.failed", "request_id": request_id, "error": "service unavailable"})["state"]
        self.assertEqual(state["phase"], "idle")
        self.assertEqual(state["feed"]["child"], "chat-assistant")
        self.assertEqual(state["feed"]["messages"][-1]["role"], "system")
        result = dispatch(state, {"type": "input.submitted", "text": "Try again"})
        self.assertEqual(result["state"]["phase"], "working")
        self.assertEqual(result["state"]["feed"]["messages"][-1]["content"], "Try again")
        self.assertEqual(
            [item["role"] for item in effect(result["effects"], "operation.invoke")["messages"]],
            ["user"],
        )

    def test_second_request_includes_history(self):
        state, _ = boot(True)
        state = dispatch(state, {"type": "input.submitted", "text": "Hello"})["state"]
        state = dispatch(state, {"type": "request.completed", "request_id": state["feed"]["request_id"], "reply": "Hi"})["state"]
        result = dispatch(state, {"type": "input.submitted", "text": "Follow up"})
        roles = [item["role"] for item in effect(result["effects"], "operation.invoke")["messages"]]
        self.assertEqual(roles, ["user", "assistant", "user"])

    def test_new_conversation_returns_to_idle_waiting(self):
        state, _ = boot(True)
        state = dispatch(state, {"type": "input.submitted", "text": "Hello"})["state"]
        state = dispatch(state, {"type": "request.completed", "request_id": state["feed"]["request_id"], "reply": "Hi"})["state"]
        result = dispatch(state, {"type": "header.action", "action": "conversation.new"})
        self.assertEqual(result["state"]["feed"]["child"], "idle-waiting")
        self.assertFalse(result["state"]["feed"]["messages"])
        self.assertEqual(effect(result["effects"], "ui.feed.show")["child"], "idle-waiting")
        self.assertTrue(any(item["type"] == "operation.cancel" for item in result["effects"]))
