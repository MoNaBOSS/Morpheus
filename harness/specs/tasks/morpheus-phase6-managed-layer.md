---
id: morpheus-phase6-managed-layer
title: Morpheus Phase 6 managed service foundation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Add a payment-independent authenticated managed service boundary and durable allowance reservations without exposing provider secrets or claiming a deployed trial.
touchedAreas:
  - services/managed/**
  - electron/services/morpheus/managed/**
  - shared/morpheus/managed-types.ts
  - tests/unit/morpheus-managed-**
  - tsconfig.managed.json
  - package.json
  - docs/**
  - README*
  - harness/specs/**
requiredProfiles:
  - fast
  - comms
expectedUserBehavior:
  - Existing BYOK and companion flows remain available while the managed foundation is not deployed.
  - Managed API clients receive explicit allowance and unavailable-billing responses.
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-managed-authority
requiredTests:
  - pnpm run typecheck
  - pnpm exec vitest run tests/unit/morpheus-managed-ledger.test.ts tests/unit/morpheus-managed-gateway.test.ts tests/unit/morpheus-managed-client.test.ts
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Only a verified identity can use an account allowance; client amounts and entitlement claims are rejected.
  - Reservations survive restart and prevent concurrent spending beyond the available allowance.
  - Duplicate requests never dispatch twice; ambiguous dispatched usage remains reserved.
  - Managed routes are allowlisted and server credentials never reach the desktop.
  - Payment is explicitly unavailable until an eligible provider is configured; BYOK is preserved.
docs:
  required: true
---

This is a server-side foundation with injected identity/provider adapters, not a
publicly deployed service or a complete Phase 6 acceptance claim. See
docs/roadmap/MORPHEUS_PHASE6_READINESS.md for scope and follow-on gates.
