---
id: morpheus-phase7-f2-desktop-controls
title: Typed observed Windows app controls through the existing Core
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Control only an exact approved running app, retain desktop leases and report observed effects rather than sent keystrokes.
touchedAreas:
  - electron/services/morpheus/**
  - electron/services/logs-api.ts
  - shared/morpheus/**
  - shared/i18n/locales/*/dashboard.json
  - src/stores/morpheus-command.ts
  - src/pages/CommandCenter/**
  - tests/unit/morpheus*.test.ts
  - tests/unit/host-services.test.ts
  - tests/e2e/morpheus-desktop-controls.spec.ts
  - harness/specs/tasks/morpheus-phase7-f2-desktop-controls.md
  - harness/specs/rules/morpheus-bounded-worker.md
  - harness/specs/scenarios/morpheus-bounded-worker.md
  - docs/releases/phase7-f2-desktop-controls.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
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
  - pnpm run typecheck:node
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - Focus restore or minimize a named approved application without a model call.
  - Ambiguous disappeared locked or unsupported targets receive an honest outcome.
acceptance:
  - No renderer PID handle executable or script is accepted.
  - Exact process identity and foreground scope are rechecked at execution.
  - Resource leases serialize desktop effects without holding up public network research.
  - Success means observed target state, not merely a sent OS request.
docs:
  required: true
---

F2.1 joins typed focus/minimize/restore to the original Core and local interpreter.
Named media control and measured/package acceptance follow within F2. Never route
unrecognized operations into arbitrary shell, global hotkeys or guessed windows.

The cross-drive scratch run exposed a pre-existing logs path-containment failure:
Windows relative() returns an absolute path for another drive. Reject that path
before reading; retain an explicit regression as part of native qualification.
