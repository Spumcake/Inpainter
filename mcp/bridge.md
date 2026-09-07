ship both an agent skill and a bridge/CLI, rather than asking the user to manually configure an MCP server.

Here's how it works for Framer:

┌─────────────────────────────┐
│ Cursor / Claude / Codex     │
│                             │
│ LLM                         │
│ + Framer SKILL.md           │
└─────────────┬───────────────┘
              │
              │ executes local tools
              ▼
┌─────────────────────────────┐
│ @framer/agent CLI / bridge  │
│                             │
│ auth                         │
│ project/session management  │
│ commands/API adapter        │
└─────────────┬───────────────┘
              │
              │ authenticated API
              ▼
┌─────────────────────────────┐
│ Framer project              │
│ canvas / CMS / components   │
└─────────────────────────────┘