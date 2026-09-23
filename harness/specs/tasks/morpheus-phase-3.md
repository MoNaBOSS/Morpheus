---
id: morpheus-phase-3
title: Responsive tasks, remembered permissions and restart recovery
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Coordinate independent objectives and recover recorded work through the existing Main-owned executor.
touchedAreas:
  - electron/**
  - shared/**
  - src/**
  - tests/**
  - harness/**
  - docs/**
  - README*
  - PROJECT_HANDOFF.md
  - package.json
  - scripts/**
  - resources/**
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - morpheus-task-continuity
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-task-coordinator.test.ts tests/unit/morpheus-recovery.test.ts tests/unit/morpheus-objective-orchestrator.test.ts tests/unit/morpheus-plan-executor.test.ts tests/unit/morpheus-command-store.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-phase-3.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - A second independent command can run while existing work continues.
  - Conflicting desktop and workspace actions wait without corrupting either task.
  - Stop talking and cancel a named task have different effects.
  - Remembered exact permissions survive restart and can be revoked.
  - Restart continues eligible checkpoints without repeating completed effects.
acceptance:
  - Main derives resource locks from registered capabilities and canonical workspace roots.
  - Interactive work takes priority over queued background work; queues, provider retries and task lifetimes are bounded.
  - Cancellation affects the named objective and retains locks until any in-flight native step settles.
  - Checkpoint persistence precedes side effects; uncertain effects require reconciliation instead of automatic replay.
  - Restored plans revalidate capabilities, workspace access and current permissions.
  - Consent requests from concurrent tasks remain correlated and cannot overwrite one another.
  - Fresh profiles use Balanced while existing profiles and grants are preserved.
  - Tests use temporary profiles and distinguish local evidence from real-PC voice acceptance.
docs:
  required: true
---

The approved experience-reset plan supersedes the earlier single-objective lane.
Per-plan dependency ordering, exact grants, provider isolation and existing OpenClaw paths remain authoritative.

Implementation reference: `docs/architecture/MORPHEUS_TASK_CONTINUITY.md`.
