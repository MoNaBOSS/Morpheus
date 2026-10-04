---
id: morpheus-experience-preview6
title: Simplify Morpheus while preserving capability and conversation continuity
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Correct the installed owner-rejected experience, provide included local voice, and retain all existing capability owners behind a simpler Windows companion.
touchedAreas:
  - src/**
  - electron/**
  - shared/**
  - resources/**
  - scripts/**
  - tests/**
  - docs/**
  - harness/**
  - README*
  - SOL_START_HERE.md
  - package.json
  - electron-builder.yml
  - .github/workflows/**
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
  - Ordinary conversation and contextual settings never unexpectedly expose the technical sidebar.
  - Compact and expanded surfaces preserve the selected conversation, draft, task and personality.
  - Native compact window resizing keeps the latest reply visible unless the user deliberately scrolls to read older history.
  - Full process restart restores chat/task chronology from original bounded transcript timing metadata when short-lived Main admission references are absent.
  - Existing technical tools remain reachable through explicit Advanced navigation.
  - Included local voice requires no voice API key; device and service failures have actionable recovery.
  - Presence respects actual work area, inactivity, reduced motion and manual microphone mute.
  - Included speech begins with real bounded local PCM segments and cannot reopen recording during generation gaps.
  - PCM playback waits for every sequenced chunk declared by Main before finishing; an earlier synthesis response cannot truncate audible output.
  - Public research rejects credential-bearing URLs and retries only validated transport connection failures.
  - Completed task exchanges stay beside their original request in the continuous conversation.
  - Reloading an active reply restores original ACP history without duplicating the admitted turn; Main settles successful delivery independently of the renderer.
  - Live voice-origin ACP replies use the existing cancellable speech queue exactly once, without replaying historical or typed replies.
  - The approved animated arrival, actual audio-reactive companion and conversation card retain one draft, history and task owner.
  - Contextual settings return to the interrupted compact or expanded conversation.
  - Companion drag and keyboard placement stay within actual display work areas and survive display changes safely.
  - Included local speech reuses a bounded warm engine when enabled, with measurable latency, cancellation and shutdown.
  - Wake and active voice status reserve shell space and never cover navigation, at full and narrow window sizes.
  - Full and compact conversation expose a labeled Settings control; contextual return preserves the draft and conversation.
  - Original M and orb identity have perceptible bounded motion at actual size, with real audio-driven response and hidden/reduced-motion guards.
  - Local silence and standalone recognition annotations are rejected before draft or command admission; short valid commands remain usable.
  - The actual owner-PC decoder marker [SOUND] is non-speech and cannot pass the microphone check; ordinary sound-related requests remain intact.
  - Opening Voice settings preserves actionable capture errors; a configuration refresh is not represented as a successful input test.
  - Hidden or covered identity surfaces remove their decorative animations, since a reported paused state alone may leave Chromium clocks advancing.
  - Companion voice commands preserve explicit consent but suspend automatic capture and wake detection while full, compact or Settings is visible; chat microphone input remains explicit and master mute always wins.
  - Voice setup groups input/device/test and selected natural output/sample, separates installed-engine readiness from recognized-input evidence, and never labels an input error as active listening.
  - Committed native tray preferences synchronize even if an interaction is cancelled during status loading; obsolete capture callbacks cannot restart input, clear permission failure, or defeat master mute.
  - Silence or unrecognized room noise invites a spoken retry without claiming microphone access is unavailable or input readiness has passed.
  - A successful single-step website or application action has a concise specific localized inline outcome and optional details; complex results and failures retain their controls.
  - First-success examples identify real local capabilities and the separate need for secure task-model connection, without claiming unavailable hosted plans are live.
  - Existing task-model connections can be explicitly tested without returning saved credentials to the renderer or overriding their saved destination.
  - Each user supplies their own protected task-model account; no owner credential is bundled, and OpenRouter model choice is explicit instead of silently assuming account availability.
  - Core and original runtime/default/fallback routing preserve native OpenRouter router model IDs; cancelled validation cannot later save an account or replacement credential.
  - Listing saved connections preserves every account, selected default and original model; sharing a runtime vendor never authorizes deleting an account or attributing a sibling credential to it.
  - Modern saved account and default reads take precedence over stale legacy aliases, while legacy-only connections remain available without metadata rewrites.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/provider-service-stale-cleanup.test.ts tests/unit/provider-migration.test.ts tests/unit/provider-runtime-sync.test.ts tests/unit/provider-secret-adapter.test.ts tests/unit/provider-settings-locales.test.ts
  - pnpm exec playwright test tests/e2e/provider-lifecycle.spec.ts tests/e2e/provider-validation-cancel.spec.ts --grep 'explicit OpenRouter model|localizes a keyless default|cancelled provider validation' --workers=1
  - pnpm exec playwright test tests/e2e/morpheus-experience.spec.ts --workers=1
  - pnpm exec playwright test tests/e2e/morpheus-shell-recovery.spec.ts --workers=1
  - pnpm exec playwright test tests/e2e/morpheus-brand-motion.spec.ts tests/e2e/morpheus-shared-orb-motion.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - No profiles, credentials, conversation history or existing executor are replaced or discarded.
  - Local speech models and engine are pinned, bounded, cancellable and licensed with packaged notices.
  - Hosted plans, checkout and NerdGPT remain honestly unavailable until externally configured.
  - Packaged evidence distinguishes real operation from fixtures and unresolved physical PC acceptance.
docs:
  required: true
---

The canonical specification is docs/design/MORPHEUS_EXPERIENCE_REVIEW.md and the
current checklist is docs/releases/WINDOWS_COMPLETION_CHECKLIST.md. The owner
authorized a final combined review on 2026-10-02; this changes review scheduling,
not preservation, security, voice or Windows evidence requirements. The owner then
requested autonomous completion and testing. The next preview.7 change is bounded
speech responsiveness, verified conversation chronology, public capability reliability,
and disposable hosted Windows installation qualification. No paid provider, checkout,
signing identity or NerdGPT deployment is invented.

October 4 per-user amendment: the owner requests OpenRouter and preparation for
each user. Do not use the exposed chat credential; its replacement must be entered
securely in Connections. Correct explicit model choice and per-user guidance,
preserve existing accounts/defaults and qualify add/edit/restart with protected
synthetic accounts. Metadata access is not generation acceptance. Included local
English voice has no separate key requirement; hosted billing and NerdGPT remain
deferred. The existing single specification/checklist record exact evidence.

October 3 amendment: the owner approved the connected motion study and authorized
full integration/qualification with substantial voice improvement and connected
settings. The earlier design-only hold is superseded. Suggestions are considered
within this coherent experience; no speculative service or unimplemented action
is advertised. Keep actual package, physical audio and hosted-service gates distinct.

October 3 owner rejection of preview.8 supersedes candidate acceptance. Correct
the integrated shell, original identity motion and local non-speech recovery in a
bounded review candidate. Runtime effects remain globally owned; visual status
belongs to the in-flow shell. No owner profile or installed payload is replaced by
test runs. The next acceptance artifact is recorded actual Windows rendering;
any seeded wake/microphone states must be explicitly described as simulated.

October 4 amendment: owner enabled microphone permission and authorized the
connected Voice/mode correction. Actual preview.9 capture opened but no speech
was detected; recognition and speaker/echo remain unqualified. Implement saved
companion consent with Main-owned foreground suspension, explicit chat input,
truthful error priority, focused Voice controls and bounded fluid audio motion.
Keep original profiles/owners and existing Advanced capabilities.

October 4 share amendment: the owner requests a polished installable application
for Larry, including recommendations from actual preview.12 inspection. Continue
the approved design with bounded action/first-success polish and measured voice
improvements where justified. Qualify the actual normal package and NSIS payload;
use disposable hosted Windows for installation tests. No owner data enters the
shareable artifact, and no unaccepted hardware or absent commercial service is
represented as complete. The canonical specification/checklist own current scope.
