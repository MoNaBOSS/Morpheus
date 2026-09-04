---
id: morpheus-responsive-operator
title: Bounded provider work and responsive voice presence
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Bound paid planner generation, cancel stale speech at Main, and project real voice and command state smoothly without pricing UI.
touchedAreas:
  - electron/**
  - shared/**
  - src/**
  - tests/**
  - harness/**
  - docs/**
  - README*
  - PROJECT_HANDOFF.md
  - package.json
expectedUserBehavior:
  - Provider plans have finite input, output and request budgets.
  - Stopping speech cancels outstanding provider work rather than only hiding playback.
  - Voice feedback takes precedence over old completed objectives.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - ui-i18n-design-tokens
  - morpheus-production-companion-safety
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-provider-planner.test.ts tests/unit/morpheus-voice-service.test.ts tests/unit/morpheus-signal-state.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-fluid-arrival.spec.ts --workers=1
acceptance:
  - No unrestricted fallback request when a provider rejects a token cap.
  - Usage metadata excludes prompts, credentials and generated content.
  - Cancellation invalidates preflight and in-flight speech.
  - Reduced motion and real command completion remain usable at 1280x800.
docs:
  required: true
---

Reference: harness/reference/morpheus-responsive-operator.md.
