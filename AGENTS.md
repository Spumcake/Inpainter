# AGENTS.md

Inpainter has intentionally strict architectural boundaries.

Do not redesign those boundaries while implementing a task.

This file provides the product context and the rules required to work safely in the repository. The current-state map of layers, flows, and repository layout lives in `ARCHITECTURE.md`. Read the relevant section there before modifying code.

---

# What Inpainter Is

Inpainter is a **purpose-built agentic environment for visual production**.

It is not intended to become a general-purpose AI desktop assistant.

General-purpose agents center on:

> conversation + tools

Inpainter centers on:

> **a visual production being manipulated by an agent**

The conversation is an interface to that production, not the product's fundamental abstraction.

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

This production-oriented model should inform architectural decisions.

---

# Product Shape

Inpainter is one product with two incarnations.

## Inpainter

`inpainter.app`

The web version.

It provides the agentic visual-production environment using project files stored within Inpainter.

The web version launches first because it does not require local filesystem integration or desktop drawing/animation infrastructure.

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

Studio is not a separate product architecture.

It is the desktop incarnation of Inpainter.

See `ARCHITECTURE.md`'s Product Surfaces for process ownership of the web app, launcher, and Studio authoring surface.

---

# Long-Term Direction

The original ambition remains important:

> **a generative animation pipeline for professional character and storyboard artists**

The broader agentic production environment is the foundation for reaching that goal.

Studio should eventually allow artists to author:

* poses
* performances
* timing
* drawings
* storyboards
* keyframes

and use generative models to execute and refine that authored material.

The intended philosophy is:

> **human-authored keyframes produce human-authored results; generative models handle execution rather than replacing creative control.**

Artists should ultimately be able to directly correct:

* continuity errors
* hallucinations
* poses
* timing
* individual shots
* generated details

rather than depending on one-shot generation.

Do not introduce architecture that makes this future direction harder.

---

# Feature Discussions

When a new feature is being worked out, that discussion is sometimes written down as an audit.

Those files live under:

```text
.project/audits/
```

They are not the architecture itself. They record the reasoning, questions, and decisions around a feature so later work does not have to reconstruct the conversation.

If a task involves a feature that may already have been discussed, read the relevant audit before proposing or implementing a design. `ARCHITECTURE.md`'s Open Questions lists the audits that currently hold unsettled decisions.

---

# Core Invariant

Inpainter separates **determination, identity, presentation, execution, routing, and implementation**.

These responsibilities must remain distinct.

---

# No Duplicate Ownership

Every decision has one owner.

If TypeScript modules in a `scripts/` tree decide session behavior, the host and React must not contain a fallback copy of that behavior.

If core owns application-home initialization, the launcher must not keep a parallel copy of those filesystem rules.

If a layout owns capability presentation, React must not independently encode the same capability-specific rules.

If a provider owns vendor behavior, neither the CLI nor platform API should duplicate it.

If functionality needs to cross a boundary, introduce an explicit interface.

Do not merge the responsibilities.

---

# Before Editing Code

Before implementation, determine:

1. What behavior is being requested?
2. Which layer owns that behavior?
3. What existing interface crosses the required boundaries?
4. Which files should change?
5. Which files should not change?

Do not begin by inventing a new cross-layer abstraction.

Use the existing ownership model first. See `ARCHITECTURE.md`'s Layer Reference and Repository Map.

---

# Implement Vertical Slices

Work on the smallest functional slice that proves the architecture.

Do not create speculative infrastructure for future requirements.

For example, implementing application boot means dispatching the real `app.boot` event, letting policy return the next state and effects, persisting that state, executing those effects, and testing authenticated and unauthenticated boot.

Stop there.

Do not simultaneously invent every future session event.

See `ARCHITECTURE.md`'s Development Strategy for why slices are preferred over temporary implementations.

# Required Self-Check

Before completing a task, inspect the diff.

Ask:

### Ownership

* Does each new decision live in its owning layer?
* Did responsibility become duplicated?
* Did implementation convenience move logic across a boundary?

### Session

* Did the core host gain a branch deciding session state or lifecycle behavior?
* Did the host begin interpreting policy?
* Could the requested session behavior still be changed by editing TypeScript modules in the `scripts/` tree without changing host or React code?
* Did the working chrome appear after policy declared a fatal condition?

### Capability architecture

* Did React gain capability implementation logic?
* Did a skill gain layout logic?
* Did the CLI gain provider-specific logic?
* Did the platform API gain vendor-specific behavior?
* Did a provider gain application policy?

### Scope

* Were unrelated files modified?
* Was speculative functionality added?
* Was an existing interface replaced without the task requiring it?

If the implementation violates ownership, it is not complete.

---

# Stop Condition

If implementing a task appears to require violating an architectural boundary:

**do not silently work around the architecture.**

Instead identify:

1. the requested behavior;
2. the boundary involved;
3. why the existing interface is insufficient;
4. the smallest new interface required to preserve ownership.

Do not solve a local problem by collapsing layers.