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
  - Existing technical tools remain reachable through explicit Advanced navigation.
  - Included local voice requires no voice API key; device and service failures have actionable recovery.
  - Presence respects actual work area, inactivity, reduced motion and manual microphone mute.
  - Included speech begins with real bounded local PCM segments and cannot reopen recording during generation gaps.
  - Public research rejects credential-bearing URLs and retries only validated transport connection failures.
  - Completed task exchanges stay beside their original request in the continuous conversation.
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
