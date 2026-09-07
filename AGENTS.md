Inpainter uses strict separation of concerns. Every implementation must be placed in the layer that owns that responsibility. Do not move logic across architectural boundaries for convenience.

### Core UI — React

**Owns:**

* Stable application shell
* Shared visual components
* Layout, navigation, panels, dialogs, menus, inputs, and common interaction patterns
* Rendering capability schemas into visible interfaces
* Client-side interaction state that is purely presentational

**Does not own:**

* Capability implementation
* CLI execution logic
* Python business logic
* Provider integrations
* Capability-specific behavior that belongs in scriptable definitions

React should render and communicate. It should not become the implementation layer for capabilities.

---

### Scriptable Components — Lua

**Owns:**

* Capability presentation definitions
* Capability-specific UI composition
* Input/output declarations
* Action declarations
* Conditional presentation logic
* Mapping user interactions to named CLI operations
* Capability metadata exposed to the UI and agent

**Does not own:**

* Python execution
* Direct provider calls
* Shell/process implementation
* Heavy application logic
* Core reusable React components

Lua describes **what a capability exposes and how it appears**, not how the underlying work is performed.

---

### Capability Schema — Shared Representation

**Owns:**

* Portable representation of capabilities
* Capability identity
* Inputs and outputs
* Available actions
* Presentation metadata
* State and validation definitions
* Mapping actions to executable CLI operations

The schema is the contract shared between Lua, React, the agent, and the CLI.

No consumer should need to inspect another layer's implementation in order to understand a capability.

---

### CLI — Execution Boundary

**Owns:**

* Stable executable operations
* Argument parsing and validation
* Dispatching requests to implementation code
* Returning structured results and errors
* Providing the common execution interface used by the UI, agent, and human users

**Does not own:**

* UI presentation
* React behavior
* Capability layout
* Agent decision-making

All executable capability behavior must be accessible through a CLI operation.

The UI and agent should invoke capabilities through this boundary rather than reaching directly into Python implementation code.

---

### Python — Capability Implementation

**Owns:**

* Actual capability behavior
* Image, video, audio, and data processing
* Model and provider integrations
* File transformations
* External tool integrations
* Complex computation
* Business logic required to perform CLI operations

**Does not own:**

* UI layout
* React components
* Capability presentation
* Client interaction state

Python exists behind the CLI boundary.

If Python functionality must be exposed elsewhere in Inpainter, expose it through a CLI operation rather than importing Python implementation directly into another layer.

---

## Required Execution Flow

The intended capability flow is:

**Lua capability definition → capability schema → React / agent → CLI operation → Python implementation**

For remote functionality:

**CLI / Python implementation → platform API → remote service**

Each boundary should remain explicit.

---

## Placement Rule

Before implementing any behavior, determine which layer owns it.

If the behavior:

* **renders or arranges interface elements** → React
* **describes how a capability appears or connects to actions** → Lua
* **defines the portable structure of a capability** → capability schema
* **provides an executable public operation** → CLI
* **performs the actual work** → Python
* **decides what operation to use** → agent
* **requires shared remote infrastructure** → server/platform API

Do not duplicate the same responsibility across multiple layers.

If functionality appears to require crossing these boundaries, introduce an explicit interface between the layers instead of merging their responsibilities.
