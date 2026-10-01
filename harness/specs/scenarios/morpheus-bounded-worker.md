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
  - shared/morpheus/research-types.ts
  - electron/services/morpheus/core/research-report.ts
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

Research retrieval feeds the existing bounded review; only observed source ids
can become citations. A real saved Markdown artifact is required for report
completion. Retrieved source links open via the safe external shell route, never
inside the local HTML preview. Failed/blocked sources are not cited as read.

Pinned interactive client projects use the same Core permission/audit owner.
Generated content cannot supply scripts or package configuration. Exact revision
verification precedes a separate network-isolated script-capable preview. Existing
project files/manual edits are preserved and unsupported server behavior is labeled.

Publishing a supported client build requires a separately approved public target
and revision. Changing account, remote head or files invalidates preparation. A
lost publication response is reconciled without repeating the write; exact HTTP
bytes, not a returned URL, are evidence of deployment. Keep previous-version
evidence for an explicitly approved non-force rollback.
