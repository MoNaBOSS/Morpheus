---
id: morpheus-phase7-g2-managed-bridge
title: Morpheus Phase 7 configured managed inference and voice bridge
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Extend the existing authenticated service and Main client with bounded configured text and audio routes, durable correlated receipts and cancellation without leaking server credentials or implying live acceptance.
touchedAreas:
  - services/managed/**
  - electron/services/morpheus/managed/**
  - electron/services/managed-account-api.ts
  - shared/morpheus/managed-*
  - tests/unit/morpheus-managed-*
  - harness/specs/**
  - docs/releases/phase7-g2-*
requiredProfiles:
  - fast
  - comms
expectedUserBehavior:
  - Managed operation uses a fixed server-owned route and protected Main session, never a silent BYOK fallback.
  - Speech chunks stop on cancellation or account change and uncertain dispatched usage remains held.
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-managed-authority
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-managed-routes.test.ts tests/unit/morpheus-managed-bridge.test.ts tests/unit/morpheus-managed-gateway.test.ts tests/unit/morpheus-managed-client.test.ts tests/unit/morpheus-managed-ledger.test.ts tests/unit/morpheus-managed-server.test.ts
  - pnpm run typecheck:managed
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Server configuration pins provider origin, models, rates and maxima; missing route configuration does not invent a provider or price.
  - Text and validated PCM transcription reserve before a single provider dispatch; streamed speech settles or retains an uncertain hold.
  - Duplicate requests never repeat provider work; cancellation, malformed output and sign-out prevent stale output or speech publication.
  - Fixtures prove adapters and accounting; actual composition, paid provider quality, deployment and trial/billing gates remain separately recorded.
docs:
  required: true
---

G2 extends services/managed and the Main-only managed client. It does not introduce
a second executor or enable a public trial. Root wires these adapters into the
existing planner/conversation/voice owners before claiming integrated G2 source
acceptance. Compressed recordings require conversion to bounded PCM WAV at their
existing capture owner; duration supplied by an untrusted HTTP client is not a
valid provider-cost bound.
