function transition(state, event)
    if event.type == "auth.status" then
        return {
            state = event.error and "unhealthy" or "healthy",
            payload = {
                authenticated = event.authenticated,
                expires_at = event.expires_at,
                error = event.error,
                crashed = false
            }
        }
    end

    if event.type == "core.crash" then
        return {
            state = "crashed",
            payload = {
                authenticated = false,
                expires_at = nil,
                error = event.error,
                crashed = true
            }
        }
    end

    return {
        state = state,
        payload = {}
    }
end
