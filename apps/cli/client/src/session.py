"""Client-owned state. Policy modules are the sole owner of transitions."""
from pathlib import Path

from inpainter.operations.capabilities import load_skill
from inpainter.ts_policy import run_transition
from src.schema import apply_defaults
from src.paths import policy_dir

class Session:
    def __init__(self):
        self.state = apply_defaults("session", {})
        self.skill = load_skill(self.state["skill"])
        self.layout = self.compile_layout(self.skill)

    @staticmethod
    def compile_layout(skill):
        name = skill["layout"]
        if Path(name).name != name:
            raise ValueError("Invalid layout name")
        return run_transition(policy_dir(), f"layouts/{name}", None, {"type": "schema"})["payload"]

    def dispatch(self, event):
        result = run_transition(policy_dir(), "global", self.state, event)
        if not isinstance(result.get("state"), dict):
            raise ValueError("Client policy must return session state")
        self.state = result["state"]
        return result.get("effects") or []


def launch():
    from src.app import ChatApp
    ChatApp().run()
