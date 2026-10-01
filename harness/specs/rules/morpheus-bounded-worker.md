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
Remote page content is untrusted data and never becomes new authority. The D1
text reader never executes markup. The separate D2 browser may run page scripts
only in a sandboxed ephemeral Chromium session with no privileged preload/Node,
personal cookies or device grants. Exact-origin pinned HTTPS transport and a
rejecting fallback proxy block unintended network access. No arbitrary generated
JavaScript or selector execution: use fixed isolated-world routines and fresh
observed node references. Account writes, credentials, uploads and downloads need
separate authority; public browsing cannot imply it. Success requires observed
content/control results, not generated prose.

Research synthesis binds citation ids to this objective's Main-observed sources,
not model URLs, imported prose or search snippets. Failed sources remain labeled
unavailable. Main compiles bounded plain Markdown and saves through the existing
file permission/audit/no-overwrite path; a generated answer is not a saved file.
Citation provenance does not certify semantic claim support. Keep that distinction
and preserve the existing provider request/iteration budgets.
