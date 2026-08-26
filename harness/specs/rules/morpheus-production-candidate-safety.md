---
id: morpheus-production-candidate-safety
title: Morpheus Production Candidate Safety
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Performance work must not create a Renderer planner, direct provider request,
direct Gateway transport, second executor, second permission store, or unaudited
execution path. Provider credentials and complete prompts remain Main-owned.

Stage timing may record planner id, protocol, duration, timeout category, step
counts, and safe outcome metadata. It must never record credentials, request or
response bodies, raw prompts, microphone audio, transcripts, file contents, or
secret-bearing headers.

Provider review is conditional work, not a ritual. It may be skipped only when
Main can prove the plan has a conclusive terminal observation and no step or
artifact requires semantic evaluation. A planner-requested review, partial or
ambiguous result, verification step, failed step, clarification, or continuation
must retain bounded review behavior.

Cancellation and timeout handling must end in a durable truthful state and must
not report success after an abort. Retries must be bounded and must not duplicate
non-idempotent native work.

Voice optimization must keep capture explicit and visible, keep audio ephemeral,
and preserve immediate stop and mute behavior. Local wake detection may be added
only when its implementation is real and packaged; otherwise ambient disclosure
must remain truthful.

Update support may initialize only when a Morpheus-owned endpoint and update
signature policy are both explicitly configured. No optimization or fallback may
restore inherited ClawX feeds or disable production signature verification.
