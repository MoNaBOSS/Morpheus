---
id: morpheus-phase7-acp-endpoint
title: Connect original ACP conversation to the actual Main-owned Gateway
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Fix packaged conversation on an isolated or non-default Gateway port without replacing history or tools.
touchedAreas:
  - package.json
  - tests/unit/morpheus-identity.test.ts
  - electron/services/acp-chat-service.ts
  - tests/unit/acp-chat-service.test.ts
  - harness/specs/tasks/morpheus-phase7-acp-endpoint.md
  - harness/specs/rules/morpheus-phase7-assistant-contract.md
  - docs/releases/phase7-i-windows-candidate.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
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
  - pnpm exec vitest run tests/unit/acp-chat-service.test.ts
expectedUserBehavior:
  - Compact conversation uses the running Gateway endpoint instead of silently dialing port 18789.
acceptance:
  - Main-owned validated port determines the loopback endpoint; renderer cannot choose an arbitrary endpoint.
  - Gateway authentication travels only in the owned child environment, not command arguments or diagnostics.
  - The original ACP session/history/permission owner remains unchanged.
  - Packaged local-provider conversation is verified separately from unit mocks and paid live acceptance.
docs:
  required: true
---

Reproduced by preview.2 normal startup with a synthetic protected local provider.
