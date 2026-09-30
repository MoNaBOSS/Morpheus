---
id: morpheus-phase7-shared-orb-motion
title: Shared orb motion and bounded visual audio level
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Share the approved native and React orb motion recipe while projecting only a bounded, ephemeral microphone or actual playback level through the typed host boundary.
touchedAreas:
  - electron/main/index.ts
  - electron/main/ipc-handlers.ts
  - electron/main/morpheus-wake-orb.ts
  - electron/services/morpheus-api.ts
  - resources/morpheus-orb/motion.css
  - resources/morpheus-orb/orb.css
  - resources/morpheus-orb/orb.html
  - resources/morpheus-orb/orb.js
  - shared/host-api/contract.ts
  - src/components/morpheus/MorpheusFluidOrb.tsx
  - src/components/morpheus/MorpheusGlobalRuntime.tsx
  - src/components/morpheus/boot/MatrixRain.tsx
  - src/components/morpheus/signal/MorpheusSignal.tsx
  - src/lib/host-api.ts
  - src/lib/morpheus-audio-level.ts
  - src/lib/morpheus-presentation-visibility.ts
  - src/lib/morpheus-speech-player.ts
  - src/styles/globals.css
  - tests/unit/morpheus-api.test.ts
  - tests/unit/morpheus-audio-level.test.ts
  - tests/unit/morpheus-speech-player.test.ts
  - tests/unit/morpheus-wake-orb.test.ts
  - tests/e2e/morpheus-wake-orb.spec.ts
  - tests/e2e/morpheus-compact-conversation.spec.ts
  - tests/e2e/morpheus-shared-orb-motion.spec.ts
  - harness/specs/tasks/morpheus-phase7-shared-orb-motion.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - SOL_START_HERE.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - ui-i18n-design-tokens
  - morpheus-production-companion-safety
  - morpheus-phase7-assistant-contract
expectedUserBehavior:
  - Native and React presence retain the approved M artwork and respond to the same quiet idle, listening, working, speaking and error motion rules.
  - Listening reacts to current microphone amplitude and speaking reacts to actual playback, without a fabricated waveform or progress signal.
  - Reduced motion shows a stable state, hidden surfaces pause visual animation, and the orb remains keyboard accessible with a visible focus cue.
  - When Main hides to tray, its hidden renderer pauses visual effects; a visible native orb can still animate its own current presence while explicitly enabled audio continues independently.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-audio-level.test.ts tests/unit/morpheus-speech-player.test.ts tests/unit/morpheus-wake-orb.test.ts tests/unit/morpheus-api.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-shared-orb-motion.spec.ts tests/e2e/morpheus-wake-orb.spec.ts tests/e2e/morpheus-compact-conversation.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm harness validate --spec harness/specs/tasks/morpheus-phase7-shared-orb-motion.md
acceptance:
  - The renderer sends only a finite normalized scalar through the typed host API; Main rejects invalid payloads and bounds positive native updates to at most 20 Hz.
  - No audio, transcript or provider content crosses this visual bridge, enters persistence or appears in diagnostics.
  - Playback metering starts with audible playback and releases analyser, timers and listeners on end, error, stop or replacement without changing output routing.
  - Zero level clears stale motion promptly; presentation state cannot enable microphone capture, grant authority, submit turns or control task execution.
  - Shared local CSS and artwork are used by native and React surfaces; packaged-resource rendering remains a separate acceptance check.
  - Native source automation, visual recordings, manual hardware, packaged app and live provider results are recorded as separate evidence; none is inferred from another.
docs:
  required: true
---

Checkpoint 7A.4 under morpheus-phase7-assistant. Read
harness/reference/morpheus-phase7-assistant.md and the selected motion contract in
docs/architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md. Keep the renderer's existing
audio owner; this bridge carries only a transient visual scalar. A source build or
fixture does not establish hardware voice quality, packaged motion or live service
acceptance.
