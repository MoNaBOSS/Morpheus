---
id: morpheus-phase7-a1-assistant-session
title: Main-owned assistant turn admission and projection
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Admit correlated turns once and project bounded conversation state through the typed Main boundary.
touchedAreas:
  - shared/morpheus/assistant-session-types.ts
  - shared/host-api/contract.ts
  - shared/host-events/contract.ts
  - electron/services/morpheus-assistant-session.ts
  - electron/services/morpheus-api.ts
  - electron/main/ipc-handlers.ts
  - src/lib/host-api.ts
  - src/lib/host-events.ts
  - src/stores/morpheus-operator.ts
  - src/components/morpheus/operator/MorpheusOperatorNavigation.tsx
  - src/pages/Chat/ChatInput.tsx
  - tests/unit/morpheus-assistant-session.test.ts
  - tests/unit/morpheus-api.test.ts
  - tests/unit/morpheus-operator-store.test.ts
  - tests/unit/chat-input.test.tsx
  - tests/unit/morpheus-voice-store.test.ts
  - harness/specs/tasks/morpheus-phase7-a1-assistant-session.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-task-continuity
  - morpheus-phase7-assistant-contract
expectedUserBehavior:
  - A repeated request returns the original admission and a changed request with the same id is rejected.
  - Two rapid turns remain separately pending and never cross conversation ids.
  - A stale or duplicated event cannot replace a later turn state; a sequence gap asks for resync.
  - The existing compact-question redirect is captured as the subsequent A.3 correction target.
requiredTests:
  - pnpm run typecheck
  - pnpm exec vitest run tests/unit/morpheus-assistant-session.test.ts tests/unit/morpheus-operator-store.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Main issues turn ids, bounds pending admissions and checks client request identity before dispatch.
  - Draft updates use revision checks and the selected conversation is explicit.
  - Only acknowledged turns leave the pending delivery snapshot.
  - The projection does not execute a second agent, store full conversation history or grant tool authority.
docs:
  required: true
---

This is checkpoint 7A.1 under morpheus-phase7-assistant. Source and fixture tests
do not establish packaged or live conversation acceptance. A.3 owns replacing the
existing compact-to-Chat redirect with compact reply continuity.
