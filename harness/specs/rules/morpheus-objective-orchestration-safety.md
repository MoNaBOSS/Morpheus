---
id: morpheus-objective-orchestration-safety
title: Morpheus Objective Orchestration Safety
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

All interactive and scheduled Morpheus objectives converge on one Main-owned
orchestrator. Renderer surfaces may submit bounded objective text, capture
bounded microphone audio and select existing Main-owned ids; they may not submit
trusted plans, capabilities outside the registry, permission scopes, grants,
provider credentials, executable paths, argv, shell strings, environment or
unrestricted filesystem roots.

Provider and OpenClaw planner output is untrusted proposal data. Main must parse
it against a strict schema, reject unknown fields, validate every capability id
and parameter set, validate the dependency graph, resolve every concrete target,
and recompute risk and permission scope before registration. Provider output may
never be treated as an audit record, execution result or permission decision.

Observation and replanning are bounded by explicit iteration, step, time and
payload limits. Cancellation is checked between provider calls and execution
steps. Repeated equivalent plans are detected and stopped. A continuation plan
is evaluated through the same policy engine and may reuse only exact matching
grants; any genuinely new boundary forms a new trust delta.

Context selection is Main-owned, bounded and source-labelled. Do not send raw
credentials, private keys, provider secrets, unlimited transcripts, audit files,
arbitrary file contents or microphone recordings as planner context. Durable
memory must distinguish user preferences, workspace context and sensitive data,
and must support immediate deletion.

Microphone audio is ephemeral by default, size/duration/type validated and never
written to Audit. Transcription providers run in Main so credentials cannot enter
the Renderer. Spoken output is limited to explicit user-facing summaries and
must not reveal hidden reasoning, secrets or raw sensitive content.

The plan executor remains provider-, voice-, Gateway- and ACP-independent.
Planner, Agent Profile, workflow, schedule and voice modules can narrow or submit
work but cannot call a native capability directly or create a permission grant.
