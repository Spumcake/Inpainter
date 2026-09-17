"""Client-owned state. Policy modules are the sole owner of transitions."""
from pathlib import Path

from src.core import run_core
from src.errors import CoreError
from src.paths import policy_dir
from src.policy_host import run_transition
from src.schema import apply_defaults

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


def load_skill(skill_id: str) -> dict:
    skill = run_core(["skill", "show", "--id", skill_id])
    if not isinstance(skill, dict) or not skill.get("id"):
        raise CoreError(f"Cannot load skill {skill_id}")
    return skill


def launch():
    from src.app import ChatApp
    ChatApp().run()
