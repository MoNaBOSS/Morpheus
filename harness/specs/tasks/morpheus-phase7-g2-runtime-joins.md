---
id: morpheus-phase7-g2-runtime-joins
title: Join managed routes to existing planner and voice owners without BYOK fallback
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Extend existing owners and correlate receipts; never create a replacement assistant or activate partially wired Premium.
touchedAreas:
  - electron/services/morpheus/**
  - electron/services/managed-account-api.ts
  - electron/main/ipc-handlers.ts
  - electron/services/chat-api.ts
  - electron/services/acp-chat-session.ts
  - shared/morpheus/**
  - src/lib/morpheus*.ts
  - src/stores/morpheus*.ts
  - src/components/morpheus/**
  - electron/services/morpheus-api.ts
  - services/managed/provider-routes.ts
  - tests/unit/morpheus*.test.ts
  - tests/unit/managed*.test.ts
  - tests/e2e/morpheus-managed*.spec.ts
  - harness/specs/tasks/morpheus-phase7-g2-runtime-joins.md
  - harness/specs/rules/morpheus-managed-authority.md
  - harness/specs/scenarios/morpheus-managed-service.md
  - docs/releases/phase7-g2-runtime-joins.md
  - docs/releases/phase7-g2-bridge-foundation.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - morpheus-managed-authority
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - Direct local operations remain local and original profiles/history persist.
  - Managed operations never silently spend from a BYOK account on failure.
acceptance:
  - Planner output uses the existing strict typed plan and review validators.
  - Every request has bounded attempts and correlated started plus terminal usage evidence.
  - Logout or mode change invalidates pending calls and stale selected routes.
  - Voice uses the existing capture and playback owner with bounded PCM support.
  - Runtime readiness remains false until conversation and voice composition are verified too.
docs:
  required: true
---

G2.1 is the planner/transport checkpoint. G2.2 joins voice; G2.3 must preserve
the original ACP conversation/history owner. Do not enable the service-mode switch
merely because the planning route passes. No deployed account or paid calls are
authorized by these fixture checks.
