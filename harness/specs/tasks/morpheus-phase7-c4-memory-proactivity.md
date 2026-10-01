---
id: morpheus-phase7-c4-memory-proactivity
title: Inspectable local memory and persisted social backoff
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Export only explicit memory through a Main-owned save dialog and admit local social invitations with persistent quiet-policy and ignored-response backoff.
touchedAreas:
  - shared/morpheus/onboarding-types.ts
  - shared/morpheus/social-check-in-types.ts
  - shared/morpheus/memory-types.ts
  - shared/morpheus/memory-candidates.ts
  - shared/morpheus/operator-types.ts
  - shared/host-api/contract.ts
  - electron/services/morpheus-api.ts
  - electron/services/morpheus/onboarding/onboarding-store.ts
  - electron/services/morpheus/persona-context.ts
  - electron/services/morpheus/memory/memory-export.ts
  - electron/main/ipc-handlers.ts
  - electron/main/index.ts
  - electron/main/morpheus-wake-orb.ts
  - resources/morpheus-orb/**
  - src/lib/host-api.ts
  - src/lib/morpheus-speech-player.ts
  - src/components/morpheus/MorpheusGlobalRuntime.tsx
  - src/pages/CommandCenter/index.tsx
  - src/components/morpheus/MorpheusSocialCheckIn.tsx
  - src/pages/Projects/index.tsx
  - shared/i18n/locales/*/dashboard.json
  - tests/unit/morpheus-*.test.*
  - tests/e2e/morpheus-memory-proactivity.spec.ts
  - docs/releases/phase7-c4-source-checkpoint.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
expectedUserBehavior:
  - Users inspect correct disable delete and export saved memory without changing chat history.
  - Explicit current preferences are captured once and remain inspectable.
  - Quiet unavailable or busy users receive no social invitation and ignoring invitations increases cooldown.
  - A locally admitted check-in uses the native orb caption without focus theft and optionally one opted-in natural utterance; interruption cannot cancel a newer reply.
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-social-check-in-policy.test.ts tests/unit/morpheus-social-check-in.test.tsx tests/unit/morpheus-api.test.ts tests/unit/morpheus-memory-candidates.test.ts tests/unit/morpheus-persona-context.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-memory-proactivity.spec.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Main owns timestamps native availability cooldown and export destination; renderer paths and unknown fields are rejected.
  - Social silence is local deterministic and makes no provider requests or emotional inferences.
  - Export contains only bounded inspectable memory not credentials logs or chat transcripts.
  - Source fixtures do not claim packaged hardware or live-provider acceptance.
docs:
  required: true
---

C4 checkpoint. Root updates the README set and campaign ledger after integration.
