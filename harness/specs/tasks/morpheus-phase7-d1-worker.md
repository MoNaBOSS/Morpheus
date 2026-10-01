---
id: morpheus-phase7-d1-worker
title: Phase 7 D1 bounded Core worker and public source retrieval
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Main admits a typed public HTTPS source worker into the existing plan audit and permission path.
touchedAreas:
  - shared/morpheus/worker-types.ts
  - shared/morpheus/actions/registry.ts
  - shared/morpheus/agents/registry.ts
  - shared/morpheus/action-types.ts
  - electron/services/public-source-worker-adapter.ts
  - electron/services/morpheus/workers/**
  - electron/services/morpheus/runtime.ts
  - electron/services/morpheus/capability-registry.ts
  - electron/services/morpheus/audit.ts
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/core/**
  - electron/services/morpheus/plan/executor.ts
  - tests/unit/morpheus-worker*.test.ts
  - tests/unit/public-source-worker*.test.ts
  - tests/unit/morpheus-task-coordinator.test.ts
  - harness/specs/scenarios/morpheus-bounded-worker.md
  - harness/specs/rules/morpheus-bounded-worker.md
  - harness/specs/tasks/morpheus-phase7-d1-worker.md
  - docs/releases/phase7-d1-source-checkpoint.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - morpheus-native-action-safety
  - morpheus-bounded-worker
  - comms-regression
  - docs-sync
expectedUserBehavior:
  - Public source reading retrieves actual bounded content and preserves verified evidence.
  - Independent app controls do not wait behind heavy source work.
requiredTests:
  - pnpm exec vitest run tests/unit/public-source-worker-adapter.test.ts tests/unit/morpheus-worker-port.test.ts tests/unit/morpheus-worker-runtime.test.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Every network hop validates and pins public DNS addresses and exact origin.
  - Worker identity scope cancellation and usage are Main owned and checkpointed before results.
  - Unknown effect or usage blocks automatic side-effect replay.
docs:
  required: true
---

D1 is real HTTPS source retrieval; browser DOM interaction remains D2.
