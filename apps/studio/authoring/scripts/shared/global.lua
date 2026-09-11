-- Session policy. Region scripts own presentation and scoped transitions.
local function result(state, effects)
    return {state=state, effects=effects or {}}
end

local function concat(first, second)
    local out = {}
    for i=1,#(first or {}) do out[#out+1] = first[i] end
    for i=1,#(second or {}) do out[#out+1] = second[i] end
    return out
end

local function present(state)
    local header = delegate("header.lua", state, {type="present"})
    local feed = delegate("feed.lua", state, {type="present"})
    return concat(header.effects, feed.effects)
end

local function adopt(state, child)
    state = child.state
    for i=1,#(child.effects or {}) do
        if child.effects[i].type == "operation.invoke" then
            state.phase = "working"
        end
    end
    return state, child.effects or {}
end

function transition(state, event)
    if event.type == "app.boot" then
        state.phase = "checking"
        return result(state, concat(present(state), {{type="operation.auth"}}))
    end
    if event.type == "auth.failed" then
        state.phase = "blocked"
        return result(state, present(state))
    end
    if event.type == "auth.completed" then
        if event.state == "unhealthy" or event.crashed then
            state.phase = "blocked"
        else
            state.phase = event.authenticated and "idle" or "signed_out"
        end
        return result(state, present(state))
    end
    if event.type == "app.quit" or (event.type == "header.action" and event.action == "app.quit") then
        return result(state, {{type="operation.cancel"}, {type="ui.exit"}})
    end
    if event.type == "header.action" and event.action == "conversation.new" then
        if state.phase == "checking" then return result(state, present(state)) end
        if state.phase == "idle" or state.phase == "working" then
            state.phase = "idle"
        end
        local feed
        state, feed = adopt(state, delegate("feed.lua", state, {type="conversation.new"}))
        return result(state, concat({{type="operation.cancel"}}, concat(feed, present(state))))
    end
    if event.type == "request.cancel" then
        if state.phase ~= "working" then return result(state, present(state)) end
        local feed
        state, feed = adopt(state, delegate("feed.lua", state, event))
        state.phase = "idle"
        return result(state, concat({{type="operation.cancel"}}, concat(feed, present(state))))
    end
    if event.type == "request.completed" or event.type == "request.failed" then
        if state.phase ~= "working" then return result(state) end
        local feed
        state, feed = adopt(state, delegate("feed.lua", state, event))
        if event.request_id == state.feed.request_id then
            state.phase = "idle"
            return result(state, concat(feed, present(state)))
        end
        return result(state)
    end
    if event.type == "input.submitted" then
        if state.phase ~= "idle" then return result(state, present(state)) end
        local feed
        state, feed = adopt(state, delegate("feed.lua", state, event))
        return result(state, concat(feed, present(state)))
    end
    return result(state, present(state))
end
