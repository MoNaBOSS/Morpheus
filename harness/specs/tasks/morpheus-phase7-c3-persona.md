---
id: morpheus-phase7-c3-persona
title: Unified bounded companion persona context
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Compose one Main-owned versioned persona for admitted companion conversation and speech without a second model pass or planner changes.
touchedAreas:
  - shared/morpheus/persona-context.ts
  - electron/services/morpheus/persona-context.ts
  - electron/services/acp-chat-service.ts
  - electron/services/chat-api.ts
  - electron/main/ipc-handlers.ts
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/voice/voice-service.ts
  - electron/services/morpheus-api.ts
  - tests/unit/morpheus-persona-context.test.ts
  - tests/unit/acp-chat-service.test.ts
  - tests/unit/morpheus-voice-service.test.ts
  - docs/releases/phase7-c3-persona.md
  - harness/specs/tasks/morpheus-phase7-c3-persona.md
requiredProfiles:
  - fast
  - comms
requiredTests:
  - tests/unit/morpheus-persona-context.test.ts
  - tests/unit/acp-chat-service.test.ts
  - tests/unit/morpheus-voice-service.test.ts
acceptance:
  - The composer is versioned and bounded, using current saved profile preferences without mutating older profiles.
  - Main applies the same effective preferences to admitted companion conversation and speech instruction input.
  - Ordinary chat and planner/tool schemas do not receive companion persona instructions.
  - Synthetic tests verify bounds, preference edits, legacy fallbacks and one existing provider request with unchanged speech text.
docs:
  required: false
---

Source-only C3 subcheckpoint. Existing memory/profile/settings sources remain
inspectable and are not silently migrated. Human persona and real voice judgment,
fresh packaged journeys and paid-service acceptance remain separate gates.
