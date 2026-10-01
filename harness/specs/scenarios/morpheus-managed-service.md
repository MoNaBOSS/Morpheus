---
id: morpheus-managed-service
title: Managed operations reuse the existing assistant owners
type: runtime-bridge
ownedPaths:
  - electron/services/morpheus/managed/**
  - electron/services/morpheus/planning/managed-planner.ts
requiredProfiles:
  - fast
  - comms
requiredRules:
  - morpheus-managed-authority
  - backend-communication-boundary
docs:
  required: true
---

With managed selected, a complex task uses a correlated hosted request and the
same typed plan/review validator as BYOK. A direct local command makes no model
request. Account failure, logout, route change, missing configuration or allowance
exhaustion cannot fall back to a personal key. Failed/malformed responses still
have usage evidence; uncertain spend remains unknown. Audit failure prevents dispatch.
Retain original profiles and conversation history. Planner-only source coverage
cannot enable the full hosted mode or imply trial/voice/deployment acceptance.
