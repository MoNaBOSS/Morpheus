---
id: morpheus-bounded-worker
title: Morpheus bounded worker execution
type: runtime-bridge
ownedPaths:
  - electron/services/morpheus/workers/**
  - electron/services/public-source-worker-adapter.ts
  - shared/morpheus/worker-types.ts
  - electron/services/task-browser/**
  - shared/morpheus/browser-types.ts
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
Task browser sessions start without personal accounts. Fixed DOM actions reject
stale or covered controls, operate only within the approved public origin, and
close their own renderer/requests on cancellation or deadline. The HTML artifact
viewer remains separate and unchanged.
