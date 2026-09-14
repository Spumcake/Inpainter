from __future__ import annotations
import asyncio
import time
from importlib.metadata import version
from rich.panel import Panel
from rich.text import Text
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import HorizontalGroup, VerticalGroup, VerticalScroll
from textual.css.query import NoMatches
from textual.widgets import Input, Static
from inpainter.operations.capabilities import load_skill
from src.session import Session
from src.backend import command

PREFIXES = {
    "user": ("❯ ", "bold #ffffff"),
    "assistant": ("• ", "bold"),
    "system": ("• ", "bold"),
}

class ChatApp(App):
    CSS = """
    Screen { background: #000000; color: #dddddd; }
    #identity { height: auto; margin: 0 1; display: none; }
    #conversation { height: 1fr; background: #000000; display: none; }
    #fatal { height: 1fr; width: 1fr; content-align: center middle; text-align: center; display: none; }
    #feed { height: auto; width: 1fr; margin: 1 1 0 1; background: #000000; }
    .message { height: auto; width: 1fr; margin: 0 0 1 0; }
    #status { height: auto; margin: 0 1 1 1; color: #aaaaaa; display: none; }
    #prompt-row { height: auto; width: 1fr; margin: 0 1; }
    #prompt-prefix { width: auto; height: 1; }
    Input { height: 1; width: 1fr; margin: 0; padding: 0; border: none; background: #000000; background-tint: 0%; }
    Input:focus { border: none; background: #000000; background-tint: 0%; }
    """
    BINDINGS = [Binding("escape", "interrupt", priority=True), Binding("ctrl+c", "quit_session", priority=True), Binding("ctrl+d", "quit_session", priority=True)]

    def __init__(self, backend=command):
        super().__init__()
        self.session = Session()
        self.backend = backend
        self.request_task = None
        self.auth_task = None
        self.working_since = None
        self.status_text = ""
        self.fatal_message = ""
        self.transcript = []

    def compose(self) -> ComposeResult:
        yield Static(id="identity")
        yield Static(id="fatal")
        with VerticalScroll(id="conversation"):
            yield VerticalGroup(id="feed")
            yield Static(id="status")
            with HorizontalGroup(id="prompt-row"):
                yield Static(Text("❯ ", style="bold #ffffff"), id="prompt-prefix")
                yield Input(placeholder=self.session.layout["input"]["placeholder"], id="prompt")

    def reveal_prompt(self) -> None:
        self.query_one("#conversation", VerticalScroll).scroll_end(animate=False)

    def refresh_visibility(self) -> None:
        phase = self.session.state.get("phase")
        open_session = phase in ("idle", "working")
        fatal = phase in ("blocked", "signed_out")
        self.query_one("#identity", Static).display = open_session
        self.query_one("#conversation", VerticalScroll).display = open_session
        self.query_one("#fatal", Static).display = fatal

    def on_mount(self):
        self.set_interval(0.2, self.update_clock)
        self.dispatch({"type":"app.boot"})
        if self.session.state.get("phase") in ("idle", "working"):
            self.query_one(Input).focus()

    def dispatch(self, event):
        for effect in self.session.dispatch(event):
            self.execute(effect)

    def execute(self, effect):
        kind = effect["type"]
        if kind == "ui.header":
            state, skill = self.session.state, self.session.skill
            if state.get("phase") in ("idle", "working"):
                text = Text(f"🖌 Inpainter (v{version('inpainter-cli')})\n\ndirectory: {state['directory']}\nskill: {skill['id']}/[{skill['model']}]")
            else:
                text = Text("[...]")
            self.query_one("#identity", Static).update(Panel(text, expand=False, border_style="dim"))
            prompt = self.query_one(Input)
            prompt.placeholder = self.session.layout["input"]["placeholder"]
            prompt.focus()
        elif kind == "ui.append":
            if effect["text"]:
                feed = self.query_one("#feed", VerticalGroup)
                prefix, style = PREFIXES[effect["role"]]
                line = Text()
                line.append(prefix, style=style)
                line.append(effect["text"])
                self.transcript.append((effect["role"], effect["text"]))
                feed.mount(Static(line, classes="message"))
                self.call_after_refresh(self.reveal_prompt)
        elif kind == "ui.clear":
            self.transcript.clear()
            self.query_one("#feed", VerticalGroup).remove_children()
        elif kind == "ui.fatal":
            self.fatal_message = str(effect.get("message") or "Unavailable.")
            self.query_one("#fatal", Static).update(Text(self.fatal_message))
        elif kind == "ui.status":
            self.status_text = effect["text"]
            self.working_since = time.monotonic() if effect["working"] else None
            self.update_clock()
        elif kind == "operation.auth":
            self.auth_task = asyncio.create_task(self.check_auth())
        elif kind == "layout.submit":
            self.request_task = asyncio.create_task(self.request(effect))
        elif kind == "operation.cancel":
            if self.request_task:
                self.request_task.cancel()
        elif kind == "skill.load":
            try:
                skill = load_skill(effect["skill"])
                layout = self.session.compile_layout(skill)
                self.session.skill, self.session.layout = skill, layout
                self.dispatch({"type":"skill.loaded", "skill":skill["id"]})
            except Exception as exc:
                self.dispatch({"type":"skill.failed", "error":str(exc)})
        elif kind == "ui.exit":
            self.exit()
        else:
            raise ValueError(f"Unsupported client effect: {kind}")
        self.refresh_visibility()

    async def check_auth(self):
        try:
            payload = await self.backend("auth", "status")
            self.dispatch({**payload, "type":"auth.completed"})
        except Exception as exc:
            self.dispatch({"type":"auth.failed", "error":str(exc)})

    async def request(self, effect):
        request_id = effect["request_id"]
        try:
            result = await self.backend(self.session.layout["submit"]["operation"], "--skill", self.session.state["skill"], params={"messages":effect["messages"], "message":effect["messages"][-1]["content"]})
            reply = result.get("reply")
            if not isinstance(reply, str) or not reply.strip():
                raise ValueError("The operation returned no reply")
            self.dispatch({"type":"request.completed", "request_id":request_id, "reply":reply})
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            self.dispatch({"type":"request.failed", "request_id":request_id, "error":str(exc)})

    def update_clock(self):
        text = self.status_text
        if self.working_since is not None:
            text = f"{text} ({int(time.monotonic()-self.working_since)}s) • esc to interrupt"
        try:
            status = self.query_one("#status", Static)
        except NoMatches:
            return
        status.update(Text(text))
        status.display = bool(text)

    def on_input_submitted(self, event: Input.Submitted):
        self.dispatch({"type":"input.submitted", "text":event.value})
        event.input.value = ""

    def action_interrupt(self):
        self.dispatch({"type":"request.cancel"})

    def action_quit_session(self):
        self.dispatch({"type":"app.quit"})

    async def on_unmount(self):
        tasks = [task for task in (self.request_task, self.auth_task) if task is not None]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
