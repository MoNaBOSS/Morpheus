---
id: morpheus-adaptive-task-routing
title: Precise direct commands and bounded adaptive task planning
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Improve correct fast command execution and task-based model selection for the 1.5.0 target while preserving existing providers, permissions, history and release evidence.
touchedAreas:
  - shared/morpheus/**
  - electron/services/morpheus/**
  - electron/services/settings-api.ts
  - electron/utils/store.ts
  - shared/host-api/**
  - src/lib/host-api.ts
  - src/stores/**
  - src/components/morpheus/**
  - src/pages/Settings/**
  - shared/i18n/locales/*/dashboard.json
  - tests/**
  - scripts/**
  - docs/**
  - harness/**
  - SOL_START_HERE.md
  - README*
  - package.json
  - .github/workflows/morpheus-installed-windows.yml
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
  - Clear supported commands execute through the existing Core without unnecessary planning calls.
  - Negated, reported or unresolved compound instructions do not cause an incorrect partial action.
  - Automatic planning chooses an approved same-account model for task complexity; explicit model choices and conversation continuity remain.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-capability-routing.test.ts tests/unit/morpheus-execution-plan.test.ts tests/unit/morpheus-voice-command-corpus.test.ts tests/unit/morpheus-planner-selector.test.ts tests/unit/morpheus-provider-planner.test.ts tests/unit/morpheus-objective-orchestrator.test.ts tests/unit/morpheus-model-routing-api.test.ts
  - pnpm exec vitest run tests/unit/morpheus-command-context.test.ts tests/unit/morpheus-planner-routing.test.ts tests/unit/morpheus-adaptive-planner.test.ts tests/unit/morpheus-model-routing.test.tsx tests/unit/morpheus-operator-store.test.ts tests/unit/morpheus-voice-store.test.ts tests/unit/morpheus-deepgram-input-store.test.ts
  - pnpm exec vitest run tests/unit/morpheus-runtime.test.ts tests/unit/morpheus-runtime-plan.test.ts tests/unit/morpheus-runtime-control.test.ts tests/unit/morpheus-worker-runtime.test.ts
  - pnpm exec vitest run tests/unit/morpheus-windows-wake.test.ts tests/unit/morpheus-wake-audio.test.ts tests/unit/morpheus-voice-service.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-site-search.spec.ts
  - pnpm exec playwright test tests/e2e/morpheus-model-routing.spec.ts
  - pnpm exec playwright test tests/e2e/morpheus-voice-clarification.spec.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run harness:ci
acceptance:
  - Negation and reported speech cannot be promoted into destructive or partial deterministic plans; exact query and file content is preserved.
  - Direct registered tasks do not require a provider model, and consequential authority remains in the existing permission owner.
  - Adaptive planning applies only to auto profiles and pins one approved account endpoint and credential per objective; saved defaults and explicit bindings are not mutated.
  - Local routine/complex classification uses no paid inference and never changes capability or permission authority.
  - Unset efficient or strong model roles use the saved model with truthful UI rather than guessed cheapest or invented service availability.
  - At most one strict pre-execution typed-plan repair can escalate, sharing original request/output-token reservations; uncertain or post-execution work is never replayed.
  - Usage attributes each call to the actual requested model and keeps unknown monetary cost unknown.
  - Existing ACP persona, history, voice consent, manual mute, drafts and route return remain authoritative.
  - Unclear speech shows a repeat-or-type repair prompt, optionally spoken under the saved reply policy; no guessed correction, automatic capture or task is admitted.
  - Only one-step known application launch, validated default-browser navigation or privacy-safe system report/storage use the separate bounded local allowance; mixed, worker and consequential work retain the existing quota, permission, audit and concurrency owners.
  - Normal runtime, generated speech, provider fixtures, actual installer execution, physical hardware and signing evidence remain separately labelled.
  - Native wake audio extraction retains the complete original addressed range from the same selected input and live authority; ambiguous recognition never grants guessed command authority.
  - Existing signing and updater guards are retained; version 1.5.0 is not evidence of a signed public stable release.
docs:
  required: true
---

Owner authorization October 5: continue toward 1.5.0 with fast accurate task
execution and sensible credit use. This component preserves the existing product
and independently identified preview.18. The canonical experience specification
and current Windows checklist own requirements, evidence, open gates and next step.

The first actual normal packaged qualification exposed the inherited ten native
plans/minute quota after ten successful rapid system reports. Preserve that failed
receipt. Correct the ordinary local interaction allowance and distinguish quota
exhaustion from concurrent admission, then freeze and qualify new application bytes.
