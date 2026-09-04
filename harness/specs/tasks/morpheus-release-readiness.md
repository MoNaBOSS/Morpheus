---
id: morpheus-release-readiness
title: Windows public release readiness
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Make voice failures actionable and stop unverified public delivery while preserving the operator runtime.
touchedAreas:
  - electron/**
  - shared/**
  - src/**
  - tests/**
  - harness/**
  - docs/**
  - scripts/**
  - patches/**
  - .github/**
  - README*
  - PROJECT_HANDOFF.md
  - package.json
  - pnpm-lock.yaml
  - vitest.config.ts
expectedUserBehavior:
  - Provider authentication failures are distinguished from configured voice availability.
  - No credential or financial charge is inferred from an unavailable live check.
  - Release artifacts remain drafts until independent review.
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
  - pnpm test
  - pnpm exec playwright test tests/e2e/morpheus-intelligence-voice.spec.ts tests/e2e/morpheus-update-status.spec.ts --workers=1
acceptance:
  - Cross-platform unit fixtures use the semantics of the emulated platform.
  - Voice failure state never exports credentials or provider response bodies.
  - Full unit and focused Electron checks precede release packaging in CI.
  - Signing and actual provider verification cannot be represented by mocked successes.
docs:
  required: true
---

Reference: harness/reference/morpheus-release-readiness.md.
