---
id: morpheus-fluid-arrival
title: Morpheus Fluid Arrival and Tray Handoff
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Make greeting, activation, speech cancellation and explicit tray handoff coherent without changing execution authority.
touchedAreas:
  - package.json
  - src/**
  - shared/**
  - electron/main/tray.ts
  - electron/services/window-api.ts
  - tests/**
  - docs/**
  - README*
  - PROJECT_HANDOFF.md
  - harness/**
expectedUserBehavior:
  - Returning users receive a visible personalized greeting after boot.
  - Users choose the full workspace or explicit tray handoff without enabling recording.
  - Cancelling speech prevents late provider audio and settles pending playback.
  - Motion is restrained, interruptible and reduced-motion aware.
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
  - pnpm exec vitest run tests/unit/morpheus-speech-player.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-fluid-arrival.spec.ts --workers=1
acceptance:
  - No implicit microphone activation or changed profile during tray handoff.
  - Main verifies a live tray before hiding the window.
  - No stale speech after cancellation or supersession.
  - Greeting, keyboard focus, tray failure and reduced motion are covered.
docs:
  required: true
---

Reference: harness/reference/morpheus-fluid-arrival.md.
