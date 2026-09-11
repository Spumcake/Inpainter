-- Feed owner. Chooses the active child script and delegates entry events.
local function child_script(state)
    if state.feed.child == "chat-assistant" then
        return "feed/chat-assistant.lua"
    end
    return "feed/idle-waiting.lua"
end

function transition(state, event)
    if event.type == "conversation.new" then
        state.feed.child = "idle-waiting"
        return delegate("feed/chat-assistant.lua", state, event)
    end
    if event.type == "input.submitted" then
        return delegate(child_script(state), state, event)
    end
    if event.type == "present" then
        return delegate(child_script(state), state, event)
    end
    return delegate("feed/chat-assistant.lua", state, event)
end
