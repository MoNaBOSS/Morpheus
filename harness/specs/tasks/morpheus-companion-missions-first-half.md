---
id: morpheus-companion-missions-first-half
title: Morpheus Companion and Missions First Half
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Turn the Windows 1.0 Foundation into a cinematic, fast companion with durable Missions, Projects, inspectable memory and capability-first objective routing while retaining one Main-owned execution pipeline.
touchedAreas:
  - shared/morpheus/**
  - shared/host-api/contract.ts
  - shared/host-events/contract.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/**
  - electron/services/morpheus-api.ts
  - electron/main/**
  - src/lib/host-api.ts
  - src/lib/host-events.ts
  - src/stores/morpheus-**
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - src/pages/Missions/**
  - src/pages/Projects/**
  - src/pages/Settings/**
  - src/components/layout/**
  - src/styles/globals.css
  - src/App.tsx
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - docs/**
  - harness/reference/morpheus-companion-missions.md
  - harness/specs/rules/morpheus-companion-mission-safety.md
  - harness/specs/tasks/morpheus-companion-missions-first-half.md
  - CLAUDE.md
  - PROJECT_HANDOFF.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - A fresh user experiences a cinematic, truthful Morpheus activation and can keep the companion in the tray.
  - Quick Command or voice summons a compact companion surface without navigating through a dashboard.
  - Known commands route directly to verified capabilities; open-ended objectives use provider planning.
  - Every accepted objective becomes a durable Mission with real status, plans, artifacts and history.
  - Projects and inspectable memory provide bounded context without granting filesystem or execution authority.
  - Existing exact trust executes without repeated interruption and new trust is still requested once per plan.
  - OpenClaw Chat and runtime pages remain functional.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-events-fallback-policy
  - ui-i18n-design-tokens
  - morpheus-native-action-safety
  - morpheus-objective-orchestration-safety
  - morpheus-companion-mission-safety
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-*.test.ts tests/unit/morpheus-*.test.tsx
  - pnpm exec playwright test tests/e2e/morpheus-*.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run build:vite
acceptance:
  - All entry surfaces converge on Objective Core, plan-level trust and the sequential capability runtime.
  - Mission state is a validated atomic projection of real objective runs and survives restart safely.
  - Projects reference only Main-owned workspace ids and memory cannot widen authority.
  - Sensitive or local-only memory never enters provider context and memory text never enters Audit.
  - Deterministic direct routing happens before provider selection and never bypasses plan validation, trust or audit.
  - Compact companion mode uses the existing trusted renderer and restores prior window state exactly.
  - New product text has complete en, zh, ja and ru locale coverage.
  - Existing OpenClaw Chat, Gateway, Models, Agents, Channels, Skills and Cron remain functional.
docs:
  required: true
---

This task is the first half of the larger companion campaign, not a claim that
the entire long-term Morpheus product is complete.
