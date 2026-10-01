---
id: morpheus-bounded-worker
title: Morpheus bounded worker execution
type: runtime-bridge
ownedPaths:
  - electron/services/morpheus/workers/**
  - electron/services/public-source-worker-adapter.ts
  - shared/morpheus/worker-types.ts
requiredProfiles:
  - fast
  - comms
requiredRules:
  - morpheus-native-action-safety
  - morpheus-bounded-worker
  - backend-communication-boundary
docs:
  required: true
---

Public source reads run through Main's plan execution and exact-origin authority.
Source observations include actual retrieved URL, retrieval time, excerpt and
digest. Local app commands remain responsive while source work runs or waits.
