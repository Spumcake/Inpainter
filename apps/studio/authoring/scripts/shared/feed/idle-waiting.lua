-- Initial prompt surface. First accepted submit hands the message to chat-assistant.
function transition(state, event)
    if event.type == "present" then
        local notice = ""
        if state.phase == "signed_out" then
            notice = "Signed out. Sign in using the launcher."
        elseif state.phase == "blocked" then
            notice = "Core unavailable."
        elseif state.phase == "checking" then
            notice = "Checking session…"
        end
        return {
            state = state,
            effects = {{
                type = "ui.feed.show",
                child = "idle-waiting",
                title = state.project_title,
                placeholder = "Ask Inpainter",
                submit_available = state.phase == "idle",
                notice = notice,
                messages = {}
            }}
        }
    end
    if event.type == "input.submitted" then
        local text = (event.text or ""):match("^%s*(.-)%s*$")
        if text == "" or state.phase ~= "idle" then
            return {state=state, effects={}}
        end
        state.feed.child = "chat-assistant"
        return delegate("feed/chat-assistant.lua", state, event)
    end
    return {state=state, effects={}}
end
