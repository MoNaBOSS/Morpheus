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

Client-interactive sites accept bounded data for an app-owned versioned template,
not generated build scripts/plugins. The deterministic small compiler runs under
existing Core workspace authority, never a project-provided command. Preview
requires current registered workspace/revision verification and serves immutable
memory bytes in an isolated ephemeral guest; no Node/preload/external network or
credential access. Static verification and the local HTML viewer remain separate.
Client-only form feedback must never claim an enquiry was sent or a site published.

Publications bind exact user approval to account/repository/site/source revision,
public bytes and current remote head. Persist write intent before remote effects,
never force a branch or silently replace remote manual edits. Lost responses are
unknown until read-only reconciliation; successful Git writes still require actual
HTTP content verification. API credentials stay on the fixed API origin and never
enter public files, planner context, exception diagnostics or content retrieval.

Native desktop controls use fixed application keys and operation enums, not raw
handles, processes, scripts or global media keys. Resolve an exact installed image
and window identity; recheck desktop lock, foreground snapshot and PID/start-time
before effects. Named Spotify sessions cannot fall back to another active player.
Explicit volume changes affect only the observed default output, never a mic.
Success requires observed state; Windows focus refusal remains a failed outcome.
Cancellation or timeout is not evidence that an effect did not happen: do not retry
blindly. Window and audio leases remain independent from public network workers.
