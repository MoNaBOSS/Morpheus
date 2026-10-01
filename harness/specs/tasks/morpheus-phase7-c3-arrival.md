---
id: morpheus-phase7-c3-arrival
title: Phase 7 C3 quiet persisted arrival and genuine question fallback
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Main admits daily greetings only after a meaningful break and quiet policy and renderer reveals answers only for genuine questions.
touchedAreas:
  - shared/morpheus/onboarding-types.ts
  - shared/morpheus/persona-context.ts
  - shared/morpheus/core/objective-types.ts
  - shared/morpheus/planner.ts
  - shared/morpheus/provider-plan.ts
  - shared/host-api/contract.ts
  - src/lib/host-api.ts
  - electron/services/morpheus/onboarding/onboarding-store.ts
  - electron/services/morpheus-api.ts
  - electron/main/ipc-handlers.ts
  - electron/services/acp-chat-service.ts
  - electron/services/chat-api.ts
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/persona-context.ts
  - electron/services/morpheus/voice/voice-service.ts
  - electron/services/morpheus/core/objective-orchestrator.ts
  - electron/services/morpheus/planning/provider-planner.ts
  - src/components/morpheus/onboarding/**
  - src/components/morpheus/MorpheusQuickCommand.tsx
  - src/components/morpheus/MorpheusSocialCheckIn.tsx
  - src/components/morpheus/MorpheusQuestionAnswers.tsx
  - tests/unit/morpheus-arrival-policy.test.ts
  - tests/unit/morpheus-api.test.ts
  - tests/unit/morpheus-social-check-in.test.tsx
  - tests/unit/morpheus-question-answers.test.tsx
  - tests/unit/morpheus-provider-plan.test.ts
  - tests/unit/morpheus-persona-context.test.ts
  - tests/unit/acp-chat-service.test.ts
  - tests/unit/morpheus-voice-service.test.ts
  - tests/e2e/morpheus-companion-missions.spec.ts
  - tests/e2e/morpheus-arrival-policy.spec.ts
  - docs/releases/phase7-c3-arrival-source.md
  - docs/releases/phase7-c3-source-checkpoint.md
  - docs/releases/phase7-c3-next-actions.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - SOL_START_HERE.md
  - harness/specs/tasks/morpheus-phase7-c3-persona.md
  - README*
  - harness/specs/tasks/morpheus-phase7-c3-arrival.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
expectedUserBehavior:
  - Returning users retain preferences and receive a quiet greeting only when Main admits it.
  - DND quick restart recent interaction and active work suppress daily greetings.
  - Ignored social check-ins do not reveal answer suggestions.
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-arrival-policy.test.ts tests/unit/morpheus-api.test.ts tests/unit/morpheus-social-check-in.test.tsx
  - pnpm exec playwright test tests/e2e/morpheus-arrival-policy.spec.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Admission persists before presentation and caller cannot supply time or policy.
  - Daily boundary does not interrupt active work.
  - Source automation is distinct from hardware and packaged acceptance.
docs:
  required: true
---

Small C3 checkpoint preserving existing profile and conversation owners.
