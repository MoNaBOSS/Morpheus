---
id: morpheus-windows-production-candidate
title: Morpheus Windows Production Candidate
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Turn the verified operator private alpha into a responsive, recoverable, update-ready Windows production candidate without splitting the Objective Core or weakening Main-owned authority.
touchedAreas:
  - shared/morpheus/**
  - shared/host-api/contract.ts
  - shared/host-events/contract.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/**
  - electron/services/morpheus-api.ts
  - electron/main/**
  - src/lib/host-api.ts
  - src/lib/host-events.ts
  - src/lib/morpheus-voice-runtime.ts
  - src/stores/morpheus-**
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - src/pages/Settings/**
  - src/styles/globals.css
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - scripts/**
  - .github/workflows/**
  - docs/**
  - harness/reference/morpheus-windows-production-candidate.md
  - harness/specs/rules/morpheus-production-candidate-safety.md
  - harness/specs/tasks/morpheus-windows-production-candidate.md
  - CLAUDE.md
  - PROJECT_HANDOFF.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - Known local objectives begin immediately without waiting for an AI provider.
  - Provider-backed objectives show truthful planning progress, can be cancelled, and fail within a bounded configurable timeout.
  - Successful fully observed plans avoid redundant provider review unless the result requires evaluation or continuation.
  - Provider, microphone, speech, Gateway, Audit, and update readiness are diagnosable without exposing secrets.
  - Voice, Invoke, Command, Chat Act, workflows, schedules, and Systems continue through one Objective Core.
  - Interrupted objectives, failed providers, restarts, and partial plans recover to truthful terminal states.
  - The packaged app remains responsive, update-safe, and visually coherent at 1280x800.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-events-fallback-policy
  - ui-i18n-design-tokens
  - morpheus-native-action-safety
  - morpheus-objective-orchestration-safety
  - morpheus-production-companion-safety
  - morpheus-operator-private-alpha-safety
  - morpheus-production-candidate-safety
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-*.test.ts tests/unit/morpheus-*.test.tsx
  - pnpm exec playwright test tests/e2e/morpheus-*.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run build:vite
  - pnpm package:win
acceptance:
  - Timing is measured by stage without persisting prompts, credentials, audio, transcripts, or file contents.
  - Deterministic routing, plan validation, trust evaluation, execution, Audit ordering, and artifact lineage remain Main-owned.
  - Provider timeouts, cancellation, retries, and review decisions are bounded and produce truthful states.
  - A successful deterministic or fully conclusive plan does not make a redundant provider review call.
  - Provider configuration and latency diagnostics exercise the real configured protocol without exposing credentials.
  - Voice recovery remains ephemeral, visible, cancellable, and usable when ambient mode is disabled.
  - Critical boundaries remain unwaivable while routine trusted work remains interruption-light.
  - No inherited ClawX update feed can initialize and update metadata remains inert until a Morpheus endpoint and signing policy are configured together.
  - New text has complete en, zh, ja, and ru locale coverage.
  - Existing routes, Gateway, Chat, providers, capabilities, trust, Audit, Missions, workflows, schedules, Goals, and Systems do not regress.
docs:
  required: true
---

This campaign completes the credential-independent Windows production candidate.
Hosted Pro and Ultra billing, production provider quotas, Authenticode credentials,
and acoustic validation on external hardware remain externally owned release inputs.
