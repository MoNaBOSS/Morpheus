---
id: morpheus-phase7-persona-display
title: Keep Main-generated personality context out of user message presentation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Preserve persona input and original ACP ledger while keeping restored user messages clean.
touchedAreas:
  - shared/morpheus/persona-context.ts
  - electron/services/acp-chat-service.ts
  - src/lib/acp/content-blocks.ts
  - tests/unit/acp-chat-service.test.ts
  - tests/unit/morpheus-persona-display.test.ts
  - tests/e2e/morpheus-compact-conversation.spec.ts
  - package.json
  - tests/unit/morpheus-identity.test.ts
  - harness/specs/tasks/morpheus-phase7-persona-display.md
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
  - pnpm exec vitest run tests/unit/acp-chat-service.test.ts tests/unit/morpheus-persona-display.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-compact-conversation.spec.ts --workers=1
expectedUserBehavior:
  - Restored history shows the user's words, not internal personality context.
acceptance:
  - Main tags only the generated context block; ordinary user input cannot supply this metadata.
  - Display suppresses only tagged bounded persona text in user-role blocks; untagged text and assistant/tool content remain unchanged.
  - Original ACP ledger and flattened prompt matching retain the original data; no transcript rewrite or second history.
  - Inspect actual packaged screenshots before compressing the next candidate.
docs:
  required: true
---

Reproduced by visual inspection of the 50437715 normal packaged full-restart history.
