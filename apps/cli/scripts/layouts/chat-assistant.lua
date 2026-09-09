-- Portable declaration: the client renders this contract and executes its action.
function transition(state, event)
    if event.type == "schema" then
        return {state=state, payload={input={placeholder="Press /? for help"}, submit={operation="invoke"}}}
    end
    return {state=state, effects={}}
end
