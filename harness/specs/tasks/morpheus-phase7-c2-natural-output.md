---
id: morpheus-phase7-c2-natural-output
title: Phase 7 C2 bounded natural voice audition and silent capture
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Audition each existing neural voice with one localized greeting joke and example task update and prove silent capture creates no provider requests.
touchedAreas:
  - src/components/morpheus/onboarding/MorpheusActivation.tsx
  - shared/i18n/locales/*/dashboard.json
  - tests/unit/morpheus-voice-audition.test.ts
  - tests/e2e/morpheus-voice-silence.spec.ts
  - docs/releases/phase7-c2-source-checkpoint.md
  - harness/specs/tasks/morpheus-phase7-c2-natural-output.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
expectedUserBehavior:
  - Each available audition speaks a prepared greeting joke and example task update using one neural speech request.
  - A silent explicit listen releases capture without transcription or task admission.
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-voice-audition.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-voice-silence.spec.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Auditions forbid Windows fallback and require configured neural speech.
  - Synthetic Chromium silence demonstrates zero STT TTS route or objective requests.
  - Real microphone speaker echo voice quality and packaged acceptance remain open.
docs:
  required: true
---

Narrow source checkpoint. Existing voice provider and task owners remain authoritative.
