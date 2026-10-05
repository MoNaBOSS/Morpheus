---
id: morpheus-voice-interaction-recovery
title: Addressed hosted speech and secure connected voice setup
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Add optional protected Deepgram speech into the existing addressed task route while preserving included voice, exact wake verification, mute authority, task providers and capabilities.
touchedAreas:
  - electron/services/morpheus/voice/**
  - electron/services/morpheus/index.ts
  - electron/services/morpheus-api.ts
  - shared/host-api/**
  - src/lib/host-api.ts
  - electron/main/morpheus-wake-orb.ts
  - electron/main/ipc-handlers.ts
  - electron/services/morpheus/capabilities/win32/open-url.ts
  - electron/services/morpheus/capabilities/win32/browser-profile.ts
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
  - pnpm exec vitest run tests/unit/morpheus-deepgram-voice.test.ts tests/unit/morpheus-deepgram-connection.test.ts tests/unit/morpheus-deepgram-connection.test.tsx tests/unit/morpheus-deepgram-integration.test.ts tests/unit/morpheus-deepgram-input-store.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-deepgram-voice.spec.ts
  - pnpm exec playwright test tests/e2e/morpheus-wake-command.spec.ts tests/e2e/morpheus-selected-wake-handoff.spec.ts
  - pnpm exec playwright test tests/e2e/morpheus-voice-interaction-recovery.spec.ts tests/e2e/morpheus-voice-silence.spec.ts tests/e2e/morpheus-unrestricted-appearance.spec.ts tests/e2e/morpheus-voice-panel.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run harness:ci
acceptance:
  - Native wake verification immediately restores an informational orb in hidden companion scope, without granting transcript, follow-up or execution authority; visible chat and mute suppress restoration.
  - Saving protected voice credentials preserves the mounted connection form and its test result while old audio authority is revoked.
  - When Chrome is the Windows HTTP/HTTPS default, URL actions reuse its validated existing last-used profile without creating a user-data directory; other defaults retain Windows delegation.
  - Deepgram connection setup remains optional, separate from task providers, stores credentials protected in Main, never reads secrets back, and offers an actionable bounded connection test.
  - A configured Deepgram tray wake uses original addressed audio through the selected hosted recognizer rather than forcing included tiny.en; no ambient cloud stream or unaddressed action is admitted.
  - Only validated natural final transcript or explicitly requested finish may complete a hosted turn; partial updates, close/flush, stale results and revoked authority never submit a command.
  - Hosted speech uses real bounded PCM playback with interruption and no late chunks after cancellation; saved task-model, personality and conversations remain unchanged.
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

Latest authorization: implement modular Deepgram speech with the supplied test
access and provide easy secure setup for other users. This bounded change adds an
optional personal cloud connection; included local voice remains available without
another key, and global operator-funded service is still a separate deployment gate.
Do not embed the owner's service key in source, scripts, diagnostics or installers.
Voice transport is Main-owned; the existing task agent and planner selection stay.

October 5 owner reliability repair: actual installed 1.5.0 used legacy provider
audio despite the available cloud integration. The supplied test access has now
been securely saved, tested and selected through the installed application.
Repair the reproduced connection-form remount on credential invalidation,
acknowledge real native wake capture before secondary ASR, and preserve Chrome's
existing profile. Native wake acknowledgement is presentation only; exact
selected-stream verification still owns all command/follow-up admission.
