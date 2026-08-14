---
id: morpheus-production-companion
title: Morpheus Windows Production Companion
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Complete the Windows companion campaign with opt-in ambient voice, proactive Today, durable Goals, bounded Systems, final Command Center integration and packaged verification while retaining one Main-owned Objective Core.
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
  - src/pages/Goals/**
  - src/pages/Missions/**
  - src/pages/Systems/**
  - src/pages/Settings/**
  - src/components/layout/**
  - src/styles/globals.css
  - src/App.tsx
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - docs/**
  - harness/reference/morpheus-production-companion.md
  - harness/specs/rules/morpheus-production-companion-safety.md
  - harness/specs/tasks/morpheus-production-companion.md
  - CLAUDE.md
  - PROJECT_HANDOFF.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - Morpheus can remain in the tray, wake through an explicitly enabled ambient voice mode, and show every real voice state.
  - The Command Center opens with factual Today attention, current Goal or Mission, runtime, trust and one primary objective input.
  - Goals persist long-horizon intent and continue through new audited Objectives rather than pretending interrupted work resumed.
  - Successful reusable Missions can become reviewed Systems that test and activate through existing workflows and schedules.
  - Routine trusted work remains autonomous and critical boundaries remain protected.
  - Existing OpenClaw Chat and all inherited product routes remain functional.
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
  - morpheus-production-companion-safety
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
  - Ambient voice is explicit, visible, bounded, auditable and never persists audio or transcript.
  - Proactive state is source-backed, deduplicated, quiet-hours aware and uses Objective Core for action.
  - Goal progress and continuation reflect real milestones and Mission outcomes.
  - System test and activation reuse workflow compilation, exact trust, sequential execution and schedules without minting grants.
  - Renderer cannot fabricate ambient sessions, attention, Goal progress, System test results or activation authority.
  - New product text has complete en, zh, ja and ru locale coverage.
  - Existing Command Center, Quick Command, voice, Missions, Projects, workflows, schedules, Activity and OpenClaw routes remain functional.
docs:
  required: true
---

This task completes the agreed Windows production-companion campaign. Future
platform hosts and connected-service catalogs remain separate campaigns.
