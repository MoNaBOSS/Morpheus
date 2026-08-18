---
id: morpheus-larry-review-candidate
title: Morpheus Signal OS Larry Review Candidate
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Produce a truthful external-review candidate by removing contradictory restored-Chat readiness messaging, preserving the Signal OS operator journey, and recording an exact tester path without widening runtime authority.
touchedAreas:
  - shared/i18n/locales/**/chat.json
  - src/pages/Chat/ChatInput.tsx
  - src/pages/Chat/index.tsx
  - tests/unit/chat-acp-page.test.tsx
  - tests/unit/chat-input.test.tsx
  - tests/e2e/chat-workspace-context.spec.ts
  - docs/releases/**
  - docs/handoff/**
  - PROJECT_HANDOFF.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - harness/specs/tasks/morpheus-larry-review-candidate.md
expectedUserBehavior:
  - A restored Chat session with an unavailable workspace explains that exact problem instead of falsely reporting a disconnected Gateway.
  - Chat session loading and cancellation show truthful, distinct composer states.
  - Fresh Chat, the OpenClaw Gateway, and all Signal OS objective entry points continue to work.
  - A reviewer can install Morpheus, configure a provider if desired, and follow a concise first-session evaluation path.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-events-fallback-policy
  - acp-chat-state-and-history
  - ui-i18n-design-tokens
  - morpheus-signal-os-experience
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/chat-acp-page.test.tsx tests/unit/chat-input.test.tsx
  - pnpm exec playwright test tests/e2e/chat-workspace-context.spec.ts tests/e2e/morpheus-signal-os.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run build:vite
acceptance:
  - Disabled Chat composers never claim the Gateway is disconnected unless Gateway state is actually the blocking reason.
  - Unavailable restored workspaces keep their existing recovery action and do not attempt ACP session creation.
  - All new user-visible text has en, zh, ja and ru translations.
  - The Command Center, Invoke, first-run activation, Objective Core, plan trust, OpenClaw Chat, and Gateway behavior do not regress.
  - Release documentation separates automated verification, packaged verification, human microphone/provider acceptance, signing, and future product scope.
docs:
  required: true
---

This is a delivery-hardening task for the existing Signal OS architecture. It
does not authorize new capabilities, arbitrary shell access, fake provider or
voice success, embedded credentials, or a Larry-specific runtime path.
