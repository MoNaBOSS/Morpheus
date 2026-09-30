---
id: morpheus-phase7-native-composer
title: Real upward composer for the Windows companion
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Let the native bottom-right presence accept text and hand it to the existing assistant session without taking focus on hover or creating a second executor.
touchedAreas:
  - electron/main/morpheus-wake-orb.ts
  - electron/main/morpheus-orb-bridge.ts
  - electron/main/morpheus-presence-layout.ts
  - electron/main/index.ts
  - electron/preload/morpheus-orb.ts
  - vite.config.ts
  - resources/morpheus-orb/**
  - shared/morpheus/**
  - tests/unit/morpheus-wake-orb.test.ts
  - tests/unit/morpheus-orb-bridge.test.ts
  - tests/e2e/morpheus-wake-orb.spec.ts
  - docs/**
  - harness/**
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - ui-i18n-design-tokens
  - morpheus-production-companion-safety
  - morpheus-phase7-assistant-contract
expectedUserBehavior:
  - Hover expands an upward text field without taking keyboard focus from another application.
  - Clicking or using an explicit keyboard path focuses a real input; typing and IME are supported.
  - Escape and pointer exit preserve a draft; Enter admits one correlated request and presents it in the compact companion.
  - The orb remains inside the chosen display work area during display or DPI changes.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-wake-orb.test.ts tests/unit/morpheus-companion-surface.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-wake-orb.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Orb preload exposes only fixed snapshot, draft and submit operations with Main sender validation.
  - Untrusted orb content cannot invoke generic host methods, shell commands, URLs or credentials.
  - Hover never steals focus; direct click focuses the editable input without losing the draft.
  - Repeated Enter or display changes never duplicate an admitted turn or lose an unsubmitted draft.
  - Reduced motion and keyboard access remain usable in the native packaged resource path.
docs:
  required: true
---

Checkpoint 7A.2 of docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md. Read the
Main-owned assistant session contract established in 7A.1 before implementing the
native bridge. The companion's HTML is a presentation surface, not a second task
or audio owner. Full packaged hardware acceptance is a later gate.
