---
id: morpheus-phase7-h-native-readiness
title: Qualify native companion interaction and recovery without changing authority
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Repair measured native interaction races and qualify the approved companion with isolated Windows evidence.
touchedAreas:
  - electron/main/morpheus-wake-orb.ts
  - electron/main/morpheus-orb-bridge.ts
  - resources/morpheus-orb/orb.js
  - tests/unit/morpheus-wake-orb.test.ts
  - tests/unit/morpheus-orb-bridge.test.ts
  - tests/e2e/morpheus-device-permissions.spec.ts
  - tests/e2e/morpheus-native-performance.spec.ts
  - harness/specs/tasks/morpheus-phase7-h-native-readiness.md
  - harness/specs/rules/morpheus-phase7-assistant-contract.md
  - docs/releases/phase7-h-native-readiness.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
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
  - pnpm exec vitest run tests/unit/morpheus-wake-orb.test.ts tests/unit/morpheus-orb-bridge.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-native-performance.spec.ts tests/e2e/morpheus-shared-orb-motion.spec.ts tests/e2e/morpheus-device-permissions.spec.ts --workers=1
expectedUserBehavior:
  - A direct orb click exposes an editable composer before focusing input; hover never steals focus.
  - Escape closes once without a pending hover reopening the panel or losing the draft.
acceptance:
  - Presentation acknowledgement waits for the editable DOM state and retains sender validation.
  - Repeated native cycles preserve text and do not dispatch a task or contact a provider.
  - Evidence names hardware source identity sample size and measurement boundary; fixtures do not pass live or packaged gates.
  - Legacy permission journeys assert actual current task results without resurrecting dashboard controls or weakening policy.
docs:
  required: true
---

H1/H2 incremental qualification. Preserve original task and audio owners.
External signing, hosting, hardware and live-provider acceptance remain separate.
