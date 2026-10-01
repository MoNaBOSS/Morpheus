---
id: morpheus-phase7-conversation-recovery
title: Restore compact conversation through the original ACP history owner
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Recover saved replies after renderer reload without another inference or parallel history.
touchedAreas:
  - src/stores/morpheus-conversation.ts
  - src/components/morpheus/MorpheusConversationThread.tsx
  - tests/e2e/morpheus-compact-conversation.spec.ts
  - tests/unit/morpheus-conversation-store.test.ts
  - harness/specs/tasks/morpheus-phase7-conversation-recovery.md
  - harness/specs/rules/morpheus-phase7-assistant-contract.md
  - docs/releases/phase7-i-windows-candidate.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-phase7-assistant-contract
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-conversation-store.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-compact-conversation.spec.ts --workers=1
expectedUserBehavior:
  - The same saved conversation reappears in compact after reload without sending it again.
acceptance:
  - Existing Main turn references or original session catalogue authorize history restoration.
  - Restoration loads existing ACP history, never creates an empty session or sends paid inference.
  - Concurrent compact/full restoration is single-flight; pending admissions retain their original drain owner.
  - Late errors cannot overwrite another selected conversation.
docs:
  required: true
---

Reproduced on normal packaged 3fe59e0c with a real local-provider reply.
