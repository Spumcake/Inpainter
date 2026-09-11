"""Studio header/feed/chat event and effect names for this slice."""

EVENTS = {
    "app.boot",
    "app.quit",
    "auth.completed",
    "auth.failed",
    "header.action",
    "input.submitted",
    "request.cancel",
    "request.completed",
    "request.failed",
    "conversation.new",
    "present",
}

EFFECTS = {
    "ui.header",
    "ui.feed.show",
    "ui.append",
    "ui.clear",
    "ui.status",
    "ui.exit",
    "operation.auth",
    "operation.invoke",
    "operation.cancel",
}

SCRIPTS = {
    "global.lua",
    "header.lua",
    "feed.lua",
    "feed/idle-waiting.lua",
    "feed/chat-assistant.lua",
}
