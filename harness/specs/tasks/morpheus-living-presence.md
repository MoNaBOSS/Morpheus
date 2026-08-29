---
id: morpheus-living-presence
title: Morpheus Living Presence and Neural Voice
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Complete the truthful companion presentation with a state-driven living Signal, provider-neutral neural speech output, personality context and bounded proactive preference integration.
touchedAreas:
  - shared/morpheus/**
  - shared/host-api/contract.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/**
  - electron/services/morpheus-api.ts
  - src/lib/host-api.ts
  - src/lib/morpheus-**
  - src/stores/morpheus-**
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - src/pages/Settings/**
  - src/styles/globals.css
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - docs/**
  - harness/reference/morpheus-living-presence.md
  - harness/specs/rules/morpheus-production-companion-safety.md
  - harness/specs/tasks/morpheus-living-presence.md
expectedUserBehavior:
  - Fresh activation presents a prominent original Morpheus presence and truthful readiness calibration.
  - Command Center shows listening, understanding, planning, trust, execution, speaking and result through one real Signal.
  - A configured compatible provider can generate a natural spoken final response; unavailable neural speech falls back truthfully.
  - Preferred personality influences communication but never grants execution authority.
  - Proactive check-ins use the existing bounded Today service and remain controllable.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-events-fallback-policy
  - ui-i18n-design-tokens
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
  - Signal motion and labels project only real Voice and Objective Core state.
  - Neural speech uses Main-owned credentials, fixed HTTPS endpoints and bounded ephemeral audio.
  - Speech text, audio and credentials never enter Audit or persistent storage.
  - Provider failure and audit degradation have truthful, usable fallbacks.
  - Personality cannot change plans, permissions, scopes or capability authority.
  - Proactive preference does not introduce unbounded provider calls or direct native execution.
  - All new product text has en, zh, ja and ru locale coverage.
  - OpenClaw Chat, Gateway and existing Objective entry points do not regress.
docs:
  required: true
---

This task completes the missing companion presentation without widening native
authority or replacing the existing Morpheus execution architecture.
