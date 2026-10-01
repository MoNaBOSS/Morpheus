---
id: morpheus-phase7-d2-browser
title: Task-owned public browser interaction
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Add bounded isolated Chromium navigation and observed DOM actions without personal sessions or privileged page bridges.
touchedAreas:
  - electron/services/task-browser/**
  - shared/morpheus/browser-types.ts
  - shared/morpheus/worker-types.ts
  - shared/morpheus/action-types.ts
  - shared/morpheus/actions/registry.ts
  - shared/morpheus/agents/registry.ts
  - shared/i18n/locales/*/dashboard.json
  - electron/services/morpheus/workers/**
  - electron/services/morpheus/runtime.ts
  - electron/services/morpheus/audit.ts
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/core/objective-orchestrator.ts
  - electron/services/morpheus/planning/provider-planner.ts
  - src/pages/CommandCenter/**
  - src/stores/morpheus-command.ts
  - tests/unit/morpheus-worker*.test.ts
  - tests/unit/morpheus-objective-orchestrator.test.ts
  - tests/unit/morpheus-provider-planner.test.ts
  - tests/unit/morpheus-supported-actions.test.ts
  - tests/unit/morpheus-task-browser*.test.ts
  - tests/e2e/morpheus-task-browser.spec.ts
  - tests/e2e/morpheus-browser-result.spec.ts
  - harness/specs/tasks/morpheus-phase7-d2-browser.md
  - harness/specs/rules/morpheus-bounded-worker.md
  - harness/specs/scenarios/morpheus-bounded-worker.md
  - docs/releases/phase7-d2-browser.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - morpheus-bounded-worker
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - Public browsing stays in a separate task session and never opens the full companion or steals focus.
  - Unsupported account operations and expired page controls report their limitation instead of guessing success.
acceptance:
  - Browser has an ephemeral task-owned session and no preload Node credentials personal cookies or permission grants.
  - Every public request pins validated DNS and exact HTTPS origin while unhandled browser networking fails closed.
  - DOM controls use Main-authored snapshots and stale references fail without executing generated JavaScript.
  - Cancellation destroys only the owned browser and network requests; limits bound output requests bytes and lifetime.
  - Account writes uploads downloads and authenticated flows remain unavailable until separately scoped and verified.
docs:
  required: true
---

D2.1 establishes the real Chromium boundary and its negative fixtures. D2.2
registers inspect/interact through the existing worker/planner/audit path, reviews
observed controls between operations, keeps task identity and releases the owned
browser on termination. Full D2 account/live gates remain separate. Keep the local
HTML viewer unchanged.
