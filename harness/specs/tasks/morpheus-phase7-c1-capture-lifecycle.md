---
id: morpheus-phase7-c1-capture-lifecycle
title: Phase 7 C1 capture cancellation and microphone loss
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Release microphone ownership after cancellation or device loss and reject stale capture transitions.
touchedAreas:
  - src/components/morpheus/MorpheusVoiceRuntime.tsx
  - src/components/morpheus/MorpheusVoiceSettings.tsx
  - shared/i18n/locales/*/dashboard.json
  - electron/services/morpheus/voice/**
  - shared/morpheus/voice-types.ts
  - src/lib/morpheus-ambient-voice.ts
  - src/stores/morpheus-voice.ts
  - tests/unit/morpheus-ambient-voice.test.ts
  - tests/unit/morpheus-voice-store.test.ts
  - tests/unit/morpheus-windows-wake.test.ts
  - tests/unit/morpheus-voice-service.test.ts
  - tests/e2e/morpheus-wake-command.spec.ts
  - docs/releases/phase7-c1-source-checkpoint.md
  - harness/specs/tasks/morpheus-phase7-c1-capture-lifecycle.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
expectedUserBehavior:
  - A locally recognized wake and command arrives once without a second transcription call.
  - Lost microphone input releases capture and gives an explicit reconnect and restart error.
requiredTests:
  - pnpm exec playwright test tests/e2e/morpheus-wake-command.spec.ts
  - pnpm run typecheck
  - pnpm exec vitest run tests/unit/morpheus-ambient-voice.test.ts tests/unit/morpheus-voice-store.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Cancellation during microphone permission cannot acquire a late stream.
  - Device loss discards captured audio and releases ownership.
  - Source tests do not imply same-breath or hardware acceptance.
docs:
  required: true
---

Narrow partial C1 source checkpoint under the Phase 7 assistant umbrella. No provider calls or owner profiles.
