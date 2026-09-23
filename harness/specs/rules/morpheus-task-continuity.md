---
id: morpheus-task-continuity
title: Morpheus task continuity
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Scheduling and recovery are Main-owned. Resolve locks from registered actions and
canonical resources, acquire multi-resource sets atomically, and retain leases
until native effects settle even after cancellation. Never replay a completed
effect or automatically retry an uncertain external effect after a crash.

Persist checkpoints before starting steps and retain conclusive results. Restored
work must pass current parameter, workspace, profile and permission checks. A
checkpoint contains no grant and cannot convert an old one-time approval into
persistent authority. Bound retries, queue length, execution time and recovery
attempts. Failed persistence must prevent the next side effect.

Correlate objective selection, permission requests and cancellation by identity.
An unrelated task's completion must not clear another task's consent or replace
the user's selected work. Speech interruption does not cancel a task.
