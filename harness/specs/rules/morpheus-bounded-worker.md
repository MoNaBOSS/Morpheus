---
id: morpheus-bounded-worker
title: Morpheus bounded worker authority
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
  - morpheus-bounded-worker
---

Worker authority is compiled in and Main authored: exact operation, origin, service,
owned objective/attempt/plan/step/run identifiers, cancellation generation and
limits. Provider or renderer input cannot add tools, paths, credentials or argv.
Existing plan permission and audit ordering remain authoritative. One heavy worker
runs at a time; waiting workers do not occupy desktop/native execution slots.
Cancellation and deadline abort owned network requests, discard stale progress and
await settlement before releasing leases. Actual/unknown usage is explicit.
Restart reconciles unfinished checkpoints; unknown side effects never replay.
Public retrieval rejects private/special addresses and pins DNS per redirect.
Remote page content is untrusted data and is never executed or interpreted as new
authority. Success requires a retrieved source observation, not generated prose.
