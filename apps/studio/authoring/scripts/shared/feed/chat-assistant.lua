-- Conversation ownership: messages, request identity, completion, failure, and cancel.
local function messages(state)
    if type(state.feed.messages) ~= "table" then
        state.feed.messages = {}
    end
    return state.feed.messages
end

local function history(state)
    local out = {}
    local msgs = messages(state)
    for i=1,#msgs do
        if msgs[i].role == "user" or msgs[i].role == "assistant" then
            out[#out+1] = msgs[i]
        end
    end
    return out
end

local function rendered(state)
    local out = {}
    local msgs = messages(state)
    for i=1,#msgs do
        out[i] = {role=msgs[i].role, text=msgs[i].content}
    end
    return out
end

function transition(state, event)
    if event.type == "conversation.new" then
        state.feed.messages = {}
        state.feed.request_id = (state.feed.request_id or 0) + 1
        state.feed.child = "idle-waiting"
        return {state=state, effects={{type="ui.clear"}}}
    end
    if event.type == "input.submitted" then
        local text = (event.text or ""):match("^%s*(.-)%s*$")
        if text == "" then return {state=state, effects={}} end
        state.feed.request_id = (state.feed.request_id or 0) + 1
        table.insert(messages(state), {role="user", content=text})
        return {
            state = state,
            effects = {
                {type="ui.append", role="user", text=text},
                {type="ui.status", text="Working", working=true},
                {type="operation.invoke", request_id=state.feed.request_id, skill=state.skill, messages=history(state)}
            }
        }
    end
    if event.type == "request.cancel" then
        state.feed.request_id = (state.feed.request_id or 0) + 1
        local msgs = messages(state)
        if #msgs > 0 and msgs[#msgs].role == "user" then
            table.remove(msgs)
        end
        table.insert(msgs, {role="system", content="Interrupted. The remote provider may still finish the request."})
        return {state=state, effects={{type="ui.status", text="", working=false}}}
    end
    if event.type == "request.completed" or event.type == "request.failed" then
        if event.request_id ~= state.feed.request_id then
            return {state=state, effects={}}
        end
        if event.type == "request.completed" then
            table.insert(messages(state), {role="assistant", content=event.reply})
            return {
                state = state,
                effects = {
                    {type="ui.append", role="assistant", text=event.reply},
                    {type="ui.status", text="", working=false}
                }
            }
        end
        local msgs = messages(state)
        if #msgs > 0 and msgs[#msgs].role == "user" then
            table.remove(msgs)
        end
        table.insert(msgs, {role="system", content=event.error or "Request failed"})
        return {state=state, effects={{type="ui.status", text="", working=false}}}
    end
    if event.type == "present" then
        local working = state.phase == "working"
        return {
            state = state,
            effects = {{
                type = "ui.feed.show",
                child = "chat-assistant",
                title = state.project_title,
                placeholder = "Reply or type new prompt...",
                submit_available = state.phase == "idle",
                notice = "",
                messages = rendered(state),
                working = working
            }, {type="ui.status", text=working and "Working" or "", working=working}}
        }
    end
    return {state=state, effects={}}
end
