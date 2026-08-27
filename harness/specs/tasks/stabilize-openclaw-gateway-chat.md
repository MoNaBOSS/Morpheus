---
id: stabilize-openclaw-gateway-chat
title: Stabilize OpenClaw Gateway And Chat Replay
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Keep the embedded OpenClaw Gateway responsive, preserve legacy Chat transcript replay, and prevent background voice or pairing loops from competing with normal Gateway work.
touchedAreas:
  - electron/services/acp-chat-service.ts
  - electron/utils/control-ui-device-pairing.ts
  - electron/gateway/process-launcher.ts
  - src/components/morpheus/MorpheusGlobalRuntime.tsx
  - src/stores/morpheus-voice.ts
  - tests/unit/acp-chat-service.test.ts
  - tests/unit/control-ui-device-pairing.test.ts
  - tests/unit/gateway-process-launcher.test.ts
  - tests/unit/morpheus-voice-store.test.ts
  - harness/reference/acp-chat.md
  - harness/reference/morpheus-production-companion.md
  - harness/specs/tasks/stabilize-openclaw-gateway-chat.md
  - PROJECT_HANDOFF.md
expectedUserBehavior:
  - Opening an existing OpenClaw conversation completes and replays its stored user and assistant messages.
  - New Chat and live prompt routing remain unchanged.
  - Gateway health and RPC remain responsive while Morpheus is idle and while Chat is open.
  - Missing or temporarily unavailable voice providers produce one visible error rather than a retry loop.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - acp-chat-state-and-history
  - session-workspace-authority
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm exec vitest run tests/unit/acp-chat-service.test.ts tests/unit/control-ui-device-pairing.test.ts tests/unit/gateway-process-launcher.test.ts tests/unit/morpheus-voice-store.test.ts
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
acceptance:
  - Historical ACP loads keep the stable Gateway session key and preserve OpenClaw transcript fallback.
  - Historical replay events are captured during load and returned under that stable key.
  - Background loopback pairing discovery reads OpenClaw's local pending store and does not continuously poll the Gateway when no request exists.
  - The managed OpenClaw child's piped stdout is continuously consumed so normal lifecycle output cannot block Gateway RPC or heartbeats.
  - Ambient voice does not start or continuously retry provider discovery while transcription is unavailable or after a failed automatic start.
  - Fresh-session creation and live-prompt generation routing do not regress.
  - No second persisted history ledger or transcript-derived ordinary Chat history is introduced.
docs:
  required: true
---

This task removes three independent sources of Gateway starvation while keeping
OpenClaw's own stable session key and transcript history authoritative.
