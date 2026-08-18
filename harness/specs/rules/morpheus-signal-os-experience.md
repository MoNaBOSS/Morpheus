---
id: morpheus-signal-os-experience
title: Morpheus Signal OS Experience
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Morpheus is an autonomous operator with four projections: Presence, Mission,
Command and Chat. All objective entry points use the existing Objective Core.
Do not create a second planner, executor, grant store, simulated event stream,
or Renderer-owned native action path.

The Morpheus Signal may visualize only real readiness, voice, objective,
permission and execution state. Green means live or verified. Reduced motion,
keyboard operation and non-colour state labels are required.

Command remains the product home. Chat remains reachable and OpenClaw-compatible
but must not dominate the first-run or routine execution experience. Existing
advanced routes remain reachable through contextual or advanced navigation.

User-visible text requires complete en, zh, ja and ru locale coverage. UI changes
require Electron E2E coverage at 1280x800. Fresh-profile activation must prove a
real Objective Core action rather than a mocked tutorial outcome.
