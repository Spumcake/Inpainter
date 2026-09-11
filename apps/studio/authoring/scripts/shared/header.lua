-- Header presentation and available actions. Session changes are coordinated by global.lua.
function transition(state, event)
    if event.type ~= "present" then
        return {state=state, effects={}}
    end
    local ready = state.phase == "idle" or state.phase == "working"
    return {
        state = state,
        effects = {{
            type = "ui.header",
            title = state.project_title,
            phase = state.phase,
            actions = {
                {id="conversation.new", available=ready},
                {id="app.quit", available=true}
            }
        }}
    }
end
