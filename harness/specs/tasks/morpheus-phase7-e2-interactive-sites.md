---
id: morpheus-phase7-e2-interactive-sites
title: Pinned client-only interactive site creation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Add deterministic app-owned client templates and an isolated interactive preview without executing generated build configuration.
touchedAreas:
  - electron/services/morpheus-api.ts
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/runtime.ts
  - electron/services/morpheus/audit.ts
  - electron/services/morpheus/core/objective-orchestrator.ts
  - electron/services/morpheus/planning/provider-planner.ts
  - shared/host-api/contract.ts
  - shared/i18n/locales/**/dashboard.json
  - shared/morpheus/actions/registry.ts
  - shared/morpheus/agents/registry.ts
  - shared/morpheus/action-types.ts
  - shared/morpheus/site-types.ts
  - shared/morpheus/execution-types.ts
  - src/lib/host-api.ts
  - src/stores/morpheus-command.ts
  - src/pages/CommandCenter/ArtifactsPanel.tsx
  - src/pages/CommandCenter/SupportedActions.tsx
  - tests/unit/morpheus-supported-actions.test.ts
  - tests/unit/morpheus-artifacts.test.ts
  - tests/unit/morpheus-api.test.ts
  - electron/services/interactive-site/**
  - shared/morpheus/interactive-site-types.ts
  - tests/unit/morpheus-interactive-site*.test.ts
  - tests/e2e/morpheus-interactive-site*.spec.ts
  - harness/specs/tasks/morpheus-phase7-e2-interactive-sites.md
  - harness/specs/rules/morpheus-bounded-worker.md
  - harness/specs/scenarios/morpheus-bounded-worker.md
  - docs/releases/phase7-e2-interactive-sites.md
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
  - Interactive client sites have real local buttons and forms with honest delivery limitations.
  - The existing static verifier and local HTML viewer keep their restrictions.
acceptance:
  - App-owned pinned templates accept bounded data only, never package scripts or generated build plugins.
  - Creation preserves existing projects and verification detects changed or injected files.
  - Preview runs without preload Node personal cookies device permissions external network downloads or popups.
  - Interaction and responsive tests inspect actual Chromium output; a build alone is not live publication.
docs:
  required: true
---

E2.1 establishes the template/build/preview boundary and negative fixtures. E2.2
registers it through existing Core capabilities, artifact presentation and audit.
Do not count an unregistered foundation as a delivered assistant capability.
