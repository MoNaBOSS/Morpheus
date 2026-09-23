---
id: morpheus-companion-experience
title: Production companion voice and presence
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Make voice activation and feedback coherent without replacing execution authority.
touchedAreas:
  - src/**
  - resources/morpheus-orb/**
  - electron/**
  - shared/**
  - tests/**
  - harness/**
  - docs/**
  - README*
  - PROJECT_HANDOFF.md
  - package.json
  - scripts/**
expectedUserBehavior:
  - The default full window uses the approved orb and conversation workspace, showing only real work and useful results.
  - Everyday controls do not expose Ask/Auto/Act or internal planning stages.
  - Calling the assistant by name opens a bounded follow-up interaction.
  - Direct voice capture ends automatically after speech and bounded silence.
  - A completed spoken result may open one bounded follow-up turn without becoming execution authority.
  - Microphone energy drives the orb only while capture is active.
  - Voice previews disclose the actual playback engine and never pretend fallback is neural.
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
  - pnpm exec vitest run tests/unit/morpheus-ambient-voice.test.ts tests/unit/morpheus-voice-store.test.ts tests/unit/morpheus-speech-player.test.ts
  - pnpm exec vitest run tests/unit/morpheus-voice-dialogue.test.ts tests/unit/morpheus-audio-level.test.ts tests/unit/morpheus-windows-wake.test.ts tests/unit/morpheus-speech-stream.test.ts
  - pnpm exec vitest run tests/unit/morpheus-voice-session.test.ts tests/unit/morpheus-windows-voice.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-intelligence-voice.spec.ts --workers=1
  - pnpm exec playwright test tests/e2e/morpheus-companion-experience.spec.ts tests/e2e/morpheus-fluid-arrival.spec.ts --workers=1
  - pnpm exec playwright test tests/e2e/morpheus-motion-polish.spec.ts --workers=1
  - pnpm exec playwright test tests/e2e/morpheus-workspace.spec.ts --workers=1
acceptance:
  - No audio or transcripts enter persistent settings or audit.
  - Cancellation and configuration changes invalidate in-flight ambient results.
  - A follow-up session never creates permission grants or bypasses policy.
  - A silent push-to-talk timeout never sends audio to a provider.
  - Main owns local-wake follow-up admission and expires it without Renderer authority.
  - Animation does not subscribe React to high-frequency audio samples.
  - Matrix rain is dim behind reading content, capped at 24 fps, paused when hidden and still when reduced motion is requested.
  - The default workspace keeps text/voice input available while tasks run and shows artifacts only after real execution.
  - Arrival, invocation and result transitions respect reduced motion and keep controls reachable.
  - Greeting owns its speech presentation without hiding capture or error indicators.
  - The 1.0.5 visual candidate is checked at 1280x800 and 1920x1080 before delivery.
  - The 1.1.0 Command Center and compact Presence are checked against the permanent Presence design at 1280x800.
  - Live provider and microphone verification remain distinct from fixture results.
docs:
  required: true
---

Reference: harness/reference/morpheus-companion-experience.md.
