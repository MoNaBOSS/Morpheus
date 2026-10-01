---
id: morpheus-phase7-runtime-launch
title: Start the actual Electron Gateway with a valid credential environment
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Fix the normal packaged startup failure caused by undefined credential-clearing entries without reviving inherited secrets.
touchedAreas:
  - electron/gateway/process-launcher.ts
  - electron/gateway/manager.ts
  - electron/gateway/state.ts
  - tests/unit/gateway-process-launcher.test.ts
  - tests/unit/gateway-manager-diagnostics.test.ts
  - tests/unit/gateway-ready-fallback.test.ts
  - tests/unit/morpheus-identity.test.ts
  - tests/e2e/gateway-launch-environment.spec.ts
  - harness/specs/tasks/morpheus-phase7-runtime-launch.md
  - harness/specs/rules/morpheus-phase7-assistant-contract.md
  - docs/releases/phase7-i-windows-candidate.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-phase7-assistant-contract
requiredTests:
  - pnpm exec vitest run tests/unit/gateway-process-launcher.test.ts tests/unit/config-sync.test.ts tests/unit/gateway-manager-diagnostics.test.ts
  - pnpm exec playwright test tests/e2e/gateway-launch-environment.spec.ts --workers=1
expectedUserBehavior:
  - The original engine starts with zero configured providers as well as protected provider credentials.
acceptance:
  - Electron receives only string environment values after all overrides; cleared credentials are omitted, never inherited or stringified.
  - Empty string values remain valid and the parent environment is not mutated.
  - An actual Electron utility process verifies launch and credential omission without sending credentials to a network provider.
  - The configured Gateway environment port is honored for isolated normal startup.
  - A fresh package is tested in normal startup mode with isolated profiles; mocked readiness is not acceptance.
docs:
  required: true
---

Found by d5954e6c preview.1 normal packaged startup, not by a source-only UI test.
The original ACP/OpenClaw engine remains the owner. No fallback engine is added.
