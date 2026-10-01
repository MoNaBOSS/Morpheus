---
id: morpheus-phase7-d2-browser
title: Task-owned public browser interaction
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Add bounded isolated Chromium navigation and observed DOM actions without personal sessions or privileged page bridges.
touchedAreas:
  - electron/services/task-browser/**
  - shared/morpheus/browser-types.ts
  - tests/unit/morpheus-task-browser*.test.ts
  - tests/e2e/morpheus-task-browser.spec.ts
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

D2.1 establishes the real Chromium boundary and its negative fixtures before
registering capabilities. This is not full D2 acceptance until the existing Core
worker/planner/audit path consumes it. Keep the local HTML viewer unchanged.
