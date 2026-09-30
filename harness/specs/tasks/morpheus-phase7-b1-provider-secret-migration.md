---
id: morpheus-phase7-b1-provider-secret-migration
title: Protected migration of existing provider secrets
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Move app-owned provider credentials to versioned OS-protected storage without losing accounts or breaking the pinned OpenClaw runtime consumers.
touchedAreas:
  - SOL_START_HERE.md
  - electron/gateway/config-sync.ts
  - electron/gateway/provider-model-key-reconciliation.ts
  - electron/gateway/manager.ts
  - electron/main/ipc-handlers.ts
  - electron/services/gateway-api.ts
  - electron/services/providers-api.ts
  - electron/services/media-api.ts
  - electron/services/providers/provider-runtime-secret-ref.ts
  - electron/services/providers/active-runtime-provider-selection.ts
  - electron/services/secrets/**
  - electron/services/providers/store-instance.ts
  - electron/services/providers/provider-migration.ts
  - electron/services/providers/provider-service.ts
  - electron/services/providers/provider-runtime-sync.ts
  - electron/utils/secure-storage.ts
  - electron/utils/openclaw-auth.ts
  - electron/utils/openclaw-image-generation.ts
  - electron/utils/openclaw-auth-sqlite.ts
  - electron/utils/openclaw-upgrade-snapshot.ts
  - shared/providers/types.ts
  - shared/host-api/contract.ts
  - src/lib/host-api.ts
  - src/components/settings/ProvidersSettings.tsx
  - shared/i18n/locales/**
  - tests/unit/provider-secret-migration.test.ts
  - tests/unit/protected-provider-secret-store.test.ts
  - tests/unit/provider-secret-adapter.test.ts
  - tests/unit/provider-service-stale-cleanup.test.ts
  - tests/unit/provider-runtime-sync.test.ts
  - tests/unit/active-runtime-provider-selection.test.ts
  - tests/unit/config-sync.test.ts
  - tests/unit/provider-model-key-reconciliation.test.ts
  - tests/unit/openclaw-auth.test.ts
  - tests/unit/openclaw-image-generation.test.ts
  - tests/unit/openclaw-upgrade-snapshot.test.ts
  - tests/unit/gateway-ready-fallback.test.ts
  - tests/unit/gateway-api-security.test.ts
  - tests/unit/host-services.test.ts
  - tests/unit/providers.test.ts
  - tests/e2e/provider-lifecycle.spec.ts
  - tests/e2e/provider-protected-store.spec.ts
  - harness/specs/tasks/morpheus-phase7-b1-provider-secret-migration.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - openclaw-config-delivery
  - provider-default-invariant
  - provider-model-metadata-preservation
  - comms-regression
  - docs-sync
  - ui-i18n-design-tokens
  - morpheus-phase7-assistant-contract
expectedUserBehavior:
  - Existing API-key accounts, selected default, models and settings survive migration and restart; the same providers still work through the supported OpenClaw path.
  - A crash during any migration stage resumes safely without deleting a usable key or creating a second account.
  - If OS protection or decryption is unavailable, the affected provider operation reports a recoverable error while typing and local work remain usable.
  - Existing OAuth accounts remain connected where the pinned runtime supports them; a static-key migration does not claim to protect upstream-managed OAuth tokens.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/protected-provider-secret-store.test.ts tests/unit/provider-secret-adapter.test.ts tests/unit/provider-service-stale-cleanup.test.ts tests/unit/providers.test.ts tests/unit/provider-runtime-sync.test.ts tests/unit/provider-model-key-reconciliation.test.ts tests/unit/openclaw-auth.test.ts tests/unit/openclaw-image-generation.test.ts tests/unit/openclaw-upgrade-snapshot.test.ts tests/unit/gateway-ready-fallback.test.ts
  - pnpm exec playwright test tests/e2e/provider-lifecycle.spec.ts --workers=1
  - pnpm exec playwright test tests/e2e/provider-protected-store.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm harness validate --spec harness/specs/tasks/morpheus-phase7-b1-provider-secret-migration.md
acceptance:
  - Inventory app-owned providerSecrets and apiKeys plus every active Main, legacy API, OpenClaw auth-profile, generated config and upgrade/rollback consumer before removal; classify static keys separately from upstream-managed OAuth tokens.
  - Preserve the SecretStore interface. Validate legacy records, write a versioned protected destination atomically, decrypt and compare it in memory, mark it committed, then remove only the migrated plaintext fields. New writes never recreate plaintext duplicates.
  - Synthetic crash/restart fixtures at each boundary prove idempotent recovery, no key or metadata loss, and no orphaned plaintext backup. A protected Windows restart check verifies the storage actually decrypts for the same user.
  - Protection failure, corrupt ciphertext or a profile moved to a different OS/user never causes deletion or plaintext fallback. The affected provider fails safely and offers reconnection or recovery without exposing a secret.
  - Any OpenClaw runtime materialization is kept to the minimum supported lifetime and scope. If a pinned runtime consumer still requires durable plaintext, document that limitation and leave B.1 open rather than label that credential fully protected.
  - Real keys, raw auth profiles, token-bearing config and private data do not enter renderer responses, model context, logs, traces, fixtures or committed evidence.
  - Upgrade and rollback tests use synthetic keys or protected envelopes; downgrade cannot restore plaintext merely to satisfy an old binary.
docs:
  required: true
---

Checkpoint 7B.1 under morpheus-phase7-assistant. Follow
docs/architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md section 7 and
harness/reference/morpheus-phase7-assistant.md. The existing managed session
store is a separate protected path; this task covers provider credentials and
their pinned OpenClaw consumers. Source fixtures cannot establish packaged
upgrade or live-provider acceptance.
