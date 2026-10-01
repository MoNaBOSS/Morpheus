---
id: morpheus-phase7-e3-publication
title: Exact-target GitHub Pages publication with receipts and reconciliation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Publish only explicitly approved public static bytes to an exact configured account repository site and revision, retaining recovery evidence.
touchedAreas:
  - electron/services/site-publication/**
  - shared/morpheus/publication-types.ts
  - tests/unit/morpheus-publication*.test.ts
  - harness/specs/tasks/morpheus-phase7-e3-publication.md
  - harness/specs/rules/morpheus-bounded-worker.md
  - harness/specs/scenarios/morpheus-bounded-worker.md
  - docs/releases/phase7-e3-publication.md
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
  - pnpm run typecheck:node
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - Publication identifies exact public bytes account repository site and revision before approval.
  - A returned URL is not success until the deployed content is observed over HTTP.
acceptance:
  - Credentials are Main-owned and never enter generated site files or the model.
  - Updates are non-force and retain unrelated remote content and previous version evidence.
  - Unknown publication outcomes are reconciled read-only before any retry.
  - Isolated fixture evidence is not live publication acceptance.
docs:
  required: true
---

E3.1 builds the bounded GitHub adapter and public-byte snapshot/reconciliation
contracts. E3.2 joins protected connection, exact user confirmation and durable
receipts to the existing application. Do not call an unjoined adapter a shipped
publication feature. Never publish to the application/design repository implicitly.
