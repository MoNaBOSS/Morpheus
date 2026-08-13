---
id: morpheus-companion-mission-safety
title: Morpheus Companion and Mission Safety
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

The companion experience must reuse the single Main-owned Objective Core. Do
not create a parallel planner, permission path, native executor, event simulator,
or privileged renderer window.

A Mission is a durable projection of audited objective state. Mission records
may reference objective runs, plans, Projects and artifacts, but cannot directly
invoke a capability, mint a grant or fabricate progress. Restart recovery marks
interrupted work truthfully and never resumes a native operation by assumption.

Projects may reference only validated existing workspace ids. Renderer text,
Project state and memory cannot create a filesystem root or widen an Agent
Profile. Durable memory is Main-owned, bounded, source-labelled and immediately
deletable. Sensitive or local-only entries, credentials, raw file contents,
audio, audit records and unrestricted transcripts must be excluded before any
provider request. Memory text must not be written to Audit.

Capability-first routing may bypass a provider call, never policy or execution.
A deterministic match must still produce a validated typed plan, resolve exact
trust, execute sequentially through the capability registry, and audit every
real transition before emission.

Compact companion mode uses the existing trusted renderer. Main owns bounds,
always-on-top behavior and restoration; Renderer may request only fixed logical
mode changes. Dismissing the companion must restore the exact prior visibility
and window state without creating duplicate processes or permission surfaces.
