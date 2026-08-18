---
id: morpheus-signal-os
title: Morpheus Signal OS Product Experience
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Replace the inherited dashboard/chat-first presentation with one truthful voice-first Signal OS experience while preserving the Main-owned Objective Core, trust, capabilities, audit and OpenClaw runtime.
touchedAreas:
  - shared/i18n/locales/**
  - src/App.tsx
  - src/styles/globals.css
  - src/components/layout/**
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - src/pages/Missions/**
  - tests/unit/morpheus-*.test.ts
  - tests/unit/morpheus-*.test.tsx
  - tests/e2e/morpheus-*.spec.ts
  - tests/e2e/app-smoke.spec.ts
  - tests/e2e/gateway-lifecycle.spec.ts
  - docs/design/**
  - docs/releases/**
  - PROJECT_HANDOFF.md
  - harness/reference/morpheus-signal-os.md
  - harness/specs/rules/morpheus-signal-os-experience.md
  - harness/specs/tasks/morpheus-signal-os.md
expectedUserBehavior:
  - A fresh user meets Morpheus through a cinematic but truthful activation and can complete one real objective.
  - Voice and global invocation open a compact Presence surface rather than Chat.
  - Meaningful work expands into a Mission surface with understand, plan, act, verify and deliver phases.
  - Command shows the current objective, Today context, artifacts, readiness and trust without becoming a card dashboard.
  - Existing trusted work proceeds without repeated prompts; genuinely new boundaries interrupt once inside the plan.
  - Chat and inherited OpenClaw functionality remain reachable and operational.
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
  - Morpheus Signal state is derived from real voice, objective, permission and runtime state.
  - Presence, Mission, Command and Chat submit through one Objective Core.
  - First launch, no-provider, no-microphone, permission, execution, result and degraded states remain truthful.
  - Primary controls and trust decisions are keyboard accessible and reduced-motion safe.
  - New text has complete en, zh, ja and ru locale coverage.
  - Existing routes, OpenClaw Gateway, Chat, exact grants, audit and capabilities do not regress.
docs:
  required: true
---

This task implements the approved Signal OS vertical product journey. It does
not authorize arbitrary shell access, financial execution, fake capabilities or
replacement of OpenClaw.
