---
id: morpheus-voice-interaction-recovery
title: Included voice recognition lifetime and conversational recovery
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Make addressed voice turns responsive and repairable while preserving exact wake verification, mute authority and the existing execution platform.
touchedAreas:
  - electron/services/morpheus/voice/**
  - electron/main/morpheus-wake-orb.ts
  - shared/morpheus/**
  - src/lib/morpheus-*.ts
  - src/stores/morpheus-voice.ts
  - src/stores/morpheus-conversation.ts
  - src/stores/morpheus-command.ts
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - resources/morpheus-orb/**
  - resources/scripts/morpheus-asr-worker.cjs
  - shared/i18n/locales/*/dashboard.json
  - scripts/**
  - tests/**
  - docs/**
  - harness/**
  - SOL_START_HERE.md
  - README*
  - package.json
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
  - Addressed requests produce a correct action, genuine clarification or an explicit nonexecuting repair cue.
  - Listening and speaking animation reflect actual audio; retry and question feedback remain readable across native, compact and expanded surfaces.
  - Existing tasks, draft, personality, providers and capabilities remain available; companion input stays suspended in visible conversation and manual mute wins.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-local-voice.test.ts tests/unit/morpheus-voice-service.test.ts tests/unit/morpheus-voice-store.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-wake-command.spec.ts tests/e2e/morpheus-selected-wake-handoff.spec.ts
  - pnpm exec playwright test tests/e2e/morpheus-voice-interaction-recovery.spec.ts tests/e2e/morpheus-voice-silence.spec.ts tests/e2e/morpheus-unrestricted-appearance.spec.ts tests/e2e/morpheus-voice-panel.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run harness:ci
acceptance:
  - Explicit microphone commands automatically finish from real speech-end samples; paused/unavailable audio never fabricates silence or revives cancelled capture.
  - Opted-in tray wake accepts exact Morpheus and Hey Morpheus while expanded chat and manual mute retain authority; clear same-breath commands execute once.
  - Reusable local recognition has bounded resource lifetime and rejects cancelled, stale, malformed or cross-session results.
  - Unverified wake never opens an addressed follow-up or admits a command; no fuzzy authority or query rewriting is introduced.
  - Retry requires a fresh verified wake or explicit user microphone action and never unmutes input silently.
  - Questions preserve their actual objective and answer choices and allow a bounded spoken follow-up after playback.
  - Real engine outputs, latency, generated-input qualification and physical acceptance remain distinct; improved lifetime is not claimed as improved accuracy without measurements.
  - Previous identified delivery and owner profiles are preserved; any new package has separate identity and evidence.
  - Evil appearance horns and labels grant no subscription, NerdGPT service or broader authority; hidden and reduced-motion presentation stays bounded.
docs:
  required: true
---

Owner authorization, October 5: implement the proposed voice interaction correction.
This is the bounded wake → command → repair/question → response component, not a
platform restart. Included local English voice remains a Basic responsibility.
Hosted speech requires actual funded service configuration and is not fabricated.
