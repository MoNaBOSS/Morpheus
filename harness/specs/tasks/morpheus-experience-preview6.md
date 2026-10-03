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
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec playwright test tests/e2e/morpheus-experience.spec.ts --workers=1
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

October 3 amendment: the owner approved the connected motion study and authorized
full integration/qualification with substantial voice improvement and connected
settings. The earlier design-only hold is superseded. Suggestions are considered
within this coherent experience; no speculative service or unimplemented action
is advertised. Keep actual package, physical audio and hosted-service gates distinct.
