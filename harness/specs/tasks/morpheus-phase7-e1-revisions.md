---
id: morpheus-phase7-e1-revisions
title: Recoverable static website revisions
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Revise a verified site against observed file digests while preserving manual edits and retaining recoverable snapshots.
touchedAreas:
  - shared/morpheus/site-types.ts
  - electron/services/morpheus/sites/**
  - electron/services/morpheus/capabilities/win32/verify-site.ts
  - src/pages/CommandCenter/**
  - src/components/file-preview/FilePreviewOverlay.tsx
  - src/components/web-browser/**
  - tests/unit/web-browser-host.test.tsx
  - shared/morpheus/actions/registry.ts
  - shared/morpheus/agents/registry.ts
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/runtime.ts
  - electron/services/morpheus/audit.ts
  - electron/services/morpheus/core/objective-orchestrator.ts
  - shared/morpheus/action-types.ts
  - shared/morpheus/execution-types.ts
  - src/stores/morpheus-command.ts
  - shared/i18n/locales/*/dashboard.json
  - tests/unit/morpheus-site-revisions.test.ts
  - tests/e2e/morpheus-site-revisions.spec.ts
  - harness/specs/tasks/morpheus-phase7-e1-revisions.md
  - docs/releases/phase7-e1-revisions.md
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-site-revisions.test.ts
  - pnpm run typecheck
acceptance:
  - A revision is bound to the current observed project digest and rejects changed user files.
  - Staged content passes the original static verifier before any user project file is replaced.
  - Snapshots and a durable journal precede mutation and rollback preserves subsequent manual edits.
  - No generated package scripts or server code are executed.
docs:
  required: true
---

Source implementation checkpoint for E1; the worker capability/composition and
fresh Electron revision journey must also pass before marking E1 complete.
