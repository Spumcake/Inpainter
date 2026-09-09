# Architecture

This is the current-state map of Inpainter: what the product is, what each layer owns, where those layers live, and how work moves through the system.

Behavioral rules for editing the repository live in `AGENTS.md`. In-progress reasoning lives in `.project/audits/`. Product vision lives in `.project/pitch.md`.

---

# Product Model

Inpainter is a purpose-built agentic environment for visual production.

It is not a general-purpose AI desktop assistant.

General-purpose agents center on a conversation with tools. Inpainter centers on a visual production being manipulated by an agent. The conversation is an interface to that production, not the product's fundamental abstraction.

The agent should ultimately be able to work across:

* project files
* source material
* reference images
* scripts
* generated assets
* intermediate outputs
* image models
* video models
* voice models
* local creative tools
* production workflows

The agent determines what work needs to happen, selects appropriate capabilities, executes them through Inpainter's interfaces, and saves the resulting artifacts back into the project.

A production might eventually involve:

```text
inspect project
    ↓
identify assets and constraints
    ↓
develop concept / shot plan
    ↓
prepare scripts and references
    ↓
generate storyboards / keyframes
    ↓
select appropriate models
    ↓
generate image / video / voice assets
    ↓
assemble and iterate
    ↓
upscale / polish
    ↓
save final and intermediate assets
```

This production-oriented model is the reason the layers below stay separate. Determination, identity, presentation, execution, routing, and implementation are different jobs.

---

# Product Surfaces

Inpainter is one product with two incarnations.

## Inpainter

`inpainter.app`

The web version, implemented under `apps/web/`.

It provides the agentic visual-production environment using project files stored within Inpainter. It launches first because it does not require local filesystem integration or desktop drawing and animation infrastructure.

## Inpainter Studio

The desktop version.

Studio shares the same agent, capability model, project concepts, and production architecture as the web application.

Studio additionally provides:

* local filesystem context
* local tools
* drawing
* animation
* performance authoring
* keyframe authoring
* deeper artist-controlled workflows

Studio is not a separate product architecture. It is the desktop incarnation of Inpainter.

On the desktop, two processes support that incarnation:

* **Launcher** (`apps/studio/launcher/`) manages projects, installs, providers, and machine-level settings, then hands a project to Studio.
* **Authoring** (`apps/studio/authoring/`) is the creative surface itself: agent workspace, canvas, and later drawing and animation tools.

---

# Long-Term Direction

The original ambition remains:

> a generative animation pipeline for professional character and storyboard artists

The broader agentic production environment is the foundation for that goal. Studio should eventually let artists author poses, performances, timing, drawings, storyboards, and keyframes, then use generative models to execute and refine that authored material.

The intended philosophy is that human-authored keyframes produce human-authored results. Generative models handle execution rather than replacing creative control.

Artists should be able to correct continuity errors, hallucinations, poses, timing, individual shots, and generated details directly, rather than depending on one-shot generation.

Architecture should keep that direction possible. See `.project/pitch.md` for the fuller product narrative.

---

# End-to-End Flows

Inpainter separates two paths that are easy to conflate.

## Capability flow

This is how work gets done.

```text
Agent
  ↓
Capabilities / Skills
  ↓
Capability Schema + Layout
  ↓
CLI Operations
  ↓
Platform routing when required
  ↓
Provider / Python implementation
```

The UI is another consumer of the same capability definitions and execution interfaces. It does not have its own path around the CLI.

A remote operation extends this path rather than replacing it:

```text
Skill + layout → schema → UI / agent → CLI → Python → platform API / external service
```

## Session flow

This is how the application decides what happens next.

```text
event + current state
        ↓
Lua transition
        ↓
new state + effects
        ↓
Python execution
```

Capability invocation is not session dispatch. Session dispatch is how Python reports that something happened so session-policy Lua can choose the next state and effects.

---

# Layer Reference

Each layer has one job. Ownership is defined by that job, not by which folder a file happens to sit in.

## Agent — Determination Layer

The agent decides what needs to happen, which capabilities are appropriate, what order operations should run in, and how a multi-step task should proceed.

It does not implement capabilities. It invokes defined operations.

## Skills — Capability Identity Layer

Skills define what a capability is and how it is wired.

A skill may identify:

* capability ID
* class
* provider
* model
* endpoint
* layout
* prompt-engineering content

A skill names a layout. It does not contain the layout. A skill names an endpoint. It does not implement the endpoint.

Skills do not own UI implementation, session policy, provider implementation, or execution logic.

**Location:** `skills/<provider>/<name>.json` for identity and wiring, with optional `<name>.md` for prompt-engineering content. Built-in skills ship in the repository `skills/` directory. Project-scoped and machine-scoped skills are additional storage tiers; see Open Questions.

## Layout Lua — Capability Presentation Layer

Layout scripts define how a capability manifests inside Inpainter.

They may describe:

* inputs
* outputs
* presentation
* actions
* mappings from actions to CLI operations
* view-state belonging to an opened capability entry

Layouts compile into portable capability schemas. They do not implement the capability itself.

They must not contain provider implementation, skill identity, model credentials, or app-wide session policy.

Multiple skills may use the same layout.

**Location:** `apps/cli/scripts/layouts/`

## Capability Schema — Shared Representation Layer

Capability schemas are compiled representations of layout declarations.

They provide a common contract consumed by React, the agent, and the CLI. A schema may describe inputs, outputs, actions, presentation metadata, and invocation definitions.

Schemas are compiled, not manually duplicated across consumers. Nothing consuming a schema should need to understand the Lua source that produced it.

## Session Lua — Application Policy Layer

Application-wide session behavior is controlled by Lua.

This includes what happens on boot, after authentication, when work begins, when work completes, after failure, and which session state follows an event.

Python defines what the application can do. Lua defines what the application does in response to events.

The runtime contract is:

```text
event + current state
        ↓
Lua transition
        ↓
new state + effects
        ↓
Python execution
```

Conceptually:

```lua
transition(state, event)
    -> {
        state = ...,
        effects = {...}
    }
```

Session state is not UI state. Showing a view is only one possible effect.

Layout Lua and session Lua are two scopes that share a transition contract. A layout owns what an opened entry shows. App-wide session policy owns boot, authentication, and idle or working. They are not the same script.

**Location:** `apps/cli/scripts/state/` — this directory is the intended home for session-policy Lua. It does not exist yet.

## Core UI — Application Interface Layer

Core UI components implement the stable application interface.

They own reusable React components, navigation, panels, dialogs, menus, inputs, common interaction patterns, and purely presentational client state.

React renders what schemas and executed effects tell it to render.

React does not own session policy, capability execution, provider logic, skill identity, or decisions about application lifecycle.

Inpainter and Inpainter Studio should reuse the same core UI concepts wherever practical.

**Location:** `apps/web/` for the web application; `apps/studio/authoring/` for the desktop creative surface.

## CLI — Execution Interface

The CLI is the formal execution boundary for Inpainter capabilities.

UI actions, agent actions, and scripted actions resolve into structured CLI operations.

The CLI owns:

* executable operations
* argument validation
* skill loading
* layout compilation
* session event dispatch
* state persistence
* effect execution
* structured results and errors

Executable capability behavior is accessible through a CLI operation. The UI and agent do not import implementation modules directly.

**Location:** `apps/cli/core/` for operations, skill loading, layout compilation, session runtime, effect execution, and the REPL. `apps/cli/api/` for platform API clients.

## Python — Mechanism and Implementation Layer

Python implements underlying mechanisms.

Examples include image processing, video processing, audio processing, filesystem operations, API clients, authentication mechanisms, async workers, external tools, local model integrations, provider implementations, and computational workflows.

Python implements what Lua, CLI operations, or providers request. It does not absorb policy merely because implementing it there is convenient.

## Platform API — Remote Services and Routing Layer

The platform API exists for work that genuinely requires remote infrastructure.

Examples include authentication, billing, synchronization, hosted records, hosted jobs, protected credentials, and provider routing.

For generative providers, the platform API performs generic endpoint routing rather than containing vendor-specific business logic. It does not need to understand OpenAI, ComfyUI, or another provider's internal request format.

**Location:** `operations/api/` for generic remote invoke routing; `operations/auth/` for authentication.

## Providers — Execution Targets

Providers perform endpoint-specific work.

They own vendor integrations, vendor request formats, vendor credentials, vendor-specific errors, local engines, and provider-specific execution.

A provider registry maps an endpoint to the provider that serves it. Provider-specific code belongs with the provider, not in the CLI or generic platform routing layer.

**Location:** `providers/<name>/provider.json` for registry information; `providers/<name>/app/` for the implementation.

## Project System — Production Filesystem Layer

The project is the primary working context for a visual production.

The project system organizes source files, generated assets, references, metadata, intermediate outputs, and production artifacts.

The agent should increasingly operate on the project rather than treat every generation as an isolated request. Project structure must therefore remain understandable and machine-addressable.

On desktop, a local project folder is the working context. On the web, the same project concept is hosted. See Open Questions for how local folders and hosted records bind to each other.

## Data Model Schemas — Persistent Identity Layer

Data model schemas define persistent things Inpainter must recognize and reference.

These may include projects, assets, settings, tools, components, placement, and persistent relationships.

Identity is explicit. Persistent concepts should not depend on UI position, filenames, Python object identity, or other incidental implementation details.

---

# Session State Machine

Session policy has a particularly strict boundary.

Python detects facts and dispatches them as events. Examples of facts include application booted, authentication completed, request started, request completed, and request failed.

Lua decides what those facts mean.

```text
app.boot
+
authenticated = false

        ↓

Lua

        ↓

state = signed_out
effect = ui.show("signed-out")
```

Python then mechanically executes the returned effect. It does not independently reproduce the same decision.

The first states with defined meaning are:

```text
signed_out
idle
working
```

`error` is a possible later state. It has no transition contract yet. The state set should stay small and represent meaningful application conditions rather than every UI variation.

Application session state is not the same thing as auth credentials. Credentials are tokens Python can read. Session state is the application's current condition, chosen by Lua.

## Contracted events

The first event with a defined contract is `app.boot`.

These additional names are useful examples, not a committed catalog:

```text
auth.completed
auth.expired

request.started
request.completed
request.failed

session.reset
```

`auth.expired`, `request.failed`, and `session.reset` have no transition contract yet.

## Effects

Lua returns a declarative list of effects. Python executes them mechanically.

A view is an effect. It is not the application state machine. A transition might show a view, focus an input, append a result, start an operation, or restore data.

---

# Repository Map

```text
skills/
  <provider>/
    <name>.json          capability identity and wiring
    <name>.md            prompt-engineering content

apps/cli/
  core/                  CLI operations, skill loading,
                         layout compilation, session runtime,
                         effect execution, REPL
  api/                   platform API clients
  scripts/
    layouts/             capability presentation + entry state
    state/               app-wide session-policy Lua

operations/
  api/                   generic remote invoke routing
  auth/                  authentication

providers/
  <name>/
    provider.json        provider registry information
    app/                 provider implementation

apps/studio/
  authoring/             desktop authoring UI
  launcher/              desktop project and machine management
  operations/

apps/web/                 web application
```

Physical proximity does not define ownership. Ownership is defined by the layer responsibilities above.

---

# Development Strategy

Inpainter is developed inside the same architecture that users will ultimately receive.

The production architecture is also the development environment. Each production boundary should exist as the smallest real version that can be dogfooded, then expand incrementally.

Prefer:

```text
small real vertical slice
→ verify architecture
→ use it
→ extend it
```

over:

```text
temporary implementation
→ large refactor later
```

See `.project/pitch.md` for why the product is being built this way. `AGENTS.md` turns this strategy into an editing rule: implement one vertical slice at a time.

---

# Open Questions

These are not settled architecture. They are discussions that later work should read rather than reconstruct.

* Skill identity, class versus layout, built-in versus user-authored skills, and the three skill storage tiers: `.project/audits/9-8-skill-component-architecture.md`
* Hosted entries versus local files, project-to-folder binding, and produced-asset storage: `.project/audits/9-8-data-model-and-storage.md`
* Session-policy Lua in more detail, including the first `app.boot` slice: `.project/audits/9-8-lua-controlled-session.md`
* Launcher, Studio shell, and how the agent workspace sits inside the desktop surface: `.project/audits/9-7-studio-and-launcher-design-flow.md`
* Identity, auth, and the relationship between `inpainter.app` and the desktop client: `.project/audits/9-7-identity-and-auth.md`
* Hosted data plane (Supabase, R2, what stays on Cloudflare): `.project/audits/9-5-platform-data-plane.md`
* Capability assembly from skill, layout, schema, CLI, and Python: `.project/audits/9-5-capability-architecture.md`
* Child-project hierarchy, which is a different hierarchy from entry nesting: `.project/audits/9-5-child-projects.md`
* Third-party agent integration through a skill plus CLI or bridge: `mcp/bridge.md`
