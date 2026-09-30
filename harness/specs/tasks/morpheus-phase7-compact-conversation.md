---
id: morpheus-phase7-compact-conversation
title: Keep Phase 7 conversation on the companion surfaces
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Submit ordinary turns through the existing OpenClaw conversation owner and show replies in compact and full Morpheus without implicit Chat navigation.
touchedAreas:
  - shared/morpheus/**
  - shared/host-api/**
  - electron/services/morpheus/**
  - src/components/morpheus/**
  - src/pages/Chat/**
  - src/pages/CommandCenter/**
  - src/stores/**
  - src/lib/**
  - tests/unit/**
  - tests/e2e/**
  - shared/i18n/locales/**
  - docs/**
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
  - ui-i18n-design-tokens
  - morpheus-phase7-assistant-contract
expectedUserBehavior:
  - An ordinary question sent from the compact companion receives the real OpenClaw reply in compact without route change or forced expansion.
  - Compact and full Morpheus show the same selected conversation and independent task result; draft and selection survive dismiss and expansion.
  - Chat remains an explicit advanced destination with its existing attachment, agent, and permission behavior.
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-conversation-projection.test.ts tests/unit/morpheus-quick-command-ui.test.tsx tests/unit/morpheus-operator-store.test.ts
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec playwright test tests/e2e/morpheus-compact-conversation.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm harness validate --spec harness/specs/tasks/morpheus-phase7-compact-conversation.md
acceptance:
  - The existing ACP Chat service remains the only OpenClaw conversation owner; no second Gateway or history is created.
  - Conversation admission is correlated and no pending turn is silently overwritten or sent to a different session.
  - ACP generation/session mismatches cannot repaint a selected conversation.
  - Pending permissions and failures remain visible and actionable while compact.
  - Native source automation and packaged/live acceptance are recorded separately.
docs:
  required: true
---

This checkpoint extends the Phase 7 assistant session contract without changing Objective Core authority.
