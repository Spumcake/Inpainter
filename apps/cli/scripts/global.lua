-- Session policy only. Rendering and request implementation live in Python.
local function result(state, effects) return {state=state, effects=effects or {}} end
local function note(text) return {type="ui.append", role="system", text=text} end
local function ready(state)
    state.phase = "idle"
    return {type="ui.status", text="", working=false}
end
function transition(state, event)
    if event.type == "skill.loaded" then
        state.skill = event.skill
        state.messages = {}
        return result(state, {{type="ui.clear"}, {type="ui.header"}, note("Selected " .. event.skill .. ". Started a new conversation.")})
    end
    if event.type == "app.boot" then
        state.phase = "checking"
        return result(state, {{type="ui.header"}, {type="operation.auth"}})
    end
    if event.type == "auth.failed" then
        state.phase = "blocked"
        return result(state, {{type="ui.status", text="", working=false}, note(event.error .. " — /auth to retry.")})
    end
    if event.type == "skill.failed" then return result(state, {note(event.error)}) end
    if event.type == "auth.completed" then
        if event.state == "unhealthy" or event.crashed then
            state.phase = "blocked"
            return result(state, {{type="ui.status", text="", working=false}, note(event.error or "Core unavailable. /auth to retry.")})
        end
        state.phase = event.authenticated and "idle" or "signed_out"
        local effects = {{type="ui.status", text="", working=false}}
        if event.authenticated then table.insert(effects, {type="ui.header"}) end
        table.insert(effects, note(event.authenticated and "" or "Signed out. Sign in using the launcher, then /auth to check again."))
        return result(state, effects)
    end
    if event.type == "app.quit" then
        return result(state, {{type="operation.cancel"}, {type="ui.exit"}})
    end
    if event.type == "request.cancel" and state.phase == "working" then
        state.request_id = state.request_id + 1
        table.remove(state.messages)
        return result(state, {{type="operation.cancel"}, ready(state), note("Interrupted. The remote provider may still finish the request.")})
    end
    if event.type == "request.completed" or event.type == "request.failed" then
        if state.phase ~= "working" or event.request_id ~= state.request_id then return result(state) end
        local effects = {ready(state)}
        if event.type == "request.completed" then
            table.insert(state.messages, {role="assistant", content=event.reply})
            table.insert(effects, {type="ui.append", role="assistant", text=event.reply})
        else
            table.remove(state.messages)
            table.insert(effects, note(event.error))
        end
        return result(state, effects)
    end
    if event.type ~= "input.submitted" then return result(state) end
    local text = event.text:match("^%s*(.-)%s*$")
    if text == "" then return result(state) end
    if text == "/quit" or text == "/exit" then return result(state, {{type="operation.cancel"}, {type="ui.exit"}}) end
    if text == "/?" or text == "/help" then
        return result(state, {note("/? help · /new clear conversation · /skill [id] · /auth check sign-in · /quit exit · Esc interrupt")})
    end
    if state.phase == "working" or state.phase == "checking" then return result(state, {note("Please wait, or press Esc to interrupt a request.")}) end
    if text == "/auth" then
        state.phase = "checking"
        return result(state, {{type="operation.auth"}})
    end
    if text == "/new" then
        state.messages = {}
        return result(state, {{type="ui.clear"}})
    end
    if text == "/skill" then return result(state, {note("Current skill: " .. state.skill .. ". Use /skill provider/name to select another chat skill.")}) end
    local skill = text:match("^/skill%s+(.+)$")
    if skill then return result(state, {{type="skill.load", skill=skill}}) end
    if text:sub(1,1) == "/" then return result(state, {note("Unknown command. Use /? for help.")}) end
    if state.phase ~= "idle" then return result(state, {note("Sign in using the launcher, then /auth.")}) end
    state.phase = "working"
    state.request_id = state.request_id + 1
    table.insert(state.messages, {role="user", content=text})
    return result(state, {
        {type="ui.append", role="user", text=text},
        {type="ui.status", text="Working", working=true},
        {type="layout.submit", request_id=state.request_id, messages=state.messages}
    })
end
