---
id: morpheus-operator-private-alpha
title: Morpheus Operator Private Alpha
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Turn the existing Windows companion foundation into one coherent persistent operator with Ask, Auto, Act, automatic bounded memory, and a real business-website hero objective.
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
  - src/pages/Chat/**
  - src/pages/Settings/**
  - src/styles/globals.css
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - docs/**
  - harness/reference/morpheus-operator-private-alpha.md
  - harness/specs/rules/morpheus-operator-private-alpha-safety.md
  - harness/specs/tasks/morpheus-operator-private-alpha.md
  - CLAUDE.md
  - PROJECT_HANDOFF.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - A user invokes Morpheus from tray, shortcut, voice, Command, or Chat and reaches the same operator state.
  - Auto answers conversational questions and executes clear objectives without requiring the user to supervise tool calls.
  - Morpheus remembers useful explicit context in an inspectable local-first memory system.
  - A configured provider can build and verify a real business website inside an approved Project and create ongoing follow-up.
  - OpenClaw Chat remains available as the thinking surface.
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
  - morpheus-production-companion-safety
  - morpheus-signal-os-experience
  - morpheus-operator-private-alpha-safety
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
  - Ask, Auto, and Act route truthfully over one Objective Core and one OpenClaw Chat runtime.
  - Background voice and tray behavior remain explicit, visible, bounded, and cancellable.
  - Autonomous behavior cannot widen beyond frozen reversible capabilities and Main-resolved scopes.
  - Automatic memory is bounded, inspectable, local-first, and excludes sensitive payloads.
  - The business-site objective creates verified real artifacts and never fakes research, deployment, analytics, or earnings.
  - New text has complete en, zh, ja, and ru locale coverage.
  - Existing routes, Gateway, Chat, providers, capabilities, trust, Audit, Missions, workflows, schedules, and Systems do not regress.
docs:
  required: true
---

This task implements the approved private-alpha operator journey. Managed Pro
and Ultra billing, a hosted provider gateway, cloud memory synchronization,
financial execution, and unrestricted shell authority are outside this branch.

