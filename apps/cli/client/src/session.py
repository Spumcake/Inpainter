"""Client-owned state. Lua is the sole owner of its transitions."""
from inpainter.lua_runtime import transition
from inpainter.operations.capabilities import load_skill
from src.schema import apply_defaults
from src.paths import scripts_dir, layouts_dir

class Session:
    def __init__(self):
        self.state = apply_defaults("session", {})
        self.skill = load_skill(self.state["skill"])
        self.layout = self.compile_layout(self.skill)

    @staticmethod
    def compile_layout(skill):
        from pathlib import Path
        name = skill["layout"]
        if Path(name).name != name:
            raise ValueError("Invalid layout name")
        return transition(layouts_dir(), name + ".lua", None, {"type":"schema"})["payload"]

    def dispatch(self, event):
        result = transition(scripts_dir(), "global.lua", self.state, event)
        if not isinstance(result.get("state"), dict):
            raise ValueError("Client Lua must return session state")
        self.state = result["state"]
        return result.get("effects") or []


def launch():
    from src.app import ChatApp
    ChatApp().run()
