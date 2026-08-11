---
id: morpheus-windows-1.0-foundation
title: Morpheus Windows 1.0 Foundation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Turn the verified 0.5 execution chassis into one voice-first, provider-backed, observable and bounded autonomous Windows product through a centralized Main-owned objective pipeline.
touchedAreas:
  - shared/morpheus/**
  - shared/host-api/contract.ts
  - shared/host-events/contract.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/**
  - electron/services/morpheus-api.ts
  - electron/services/providers/**
  - electron/services/files-api.ts
  - electron/services/gateway-api.ts
  - electron/services/shell-api.ts
  - electron/services/providers-api.ts
  - electron/main/**
  - electron/preload/**
  - src/lib/host-api.ts
  - src/lib/host-events.ts
  - src/stores/morpheus-**
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - src/pages/Chat/**
  - src/pages/AgentProfiles/**
  - src/pages/Workflows/**
  - src/pages/Schedules/**
  - src/pages/Activity/**
  - src/pages/Settings/**
  - src/components/layout/**
  - src/styles/globals.css
  - index.html
  - scripts/installer.nsh
  - scripts/patch-nsis-*.mjs
  - resources/cli/**
  - resources/context/**
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - docs/**
  - harness/reference/morpheus-core-orchestration.md
  - harness/reference/morpheus-execution-architecture.md
  - harness/specs/tasks/morpheus-windows-1.0-foundation.md
  - harness/specs/rules/morpheus-objective-orchestration-safety.md
  - CLAUDE.md
  - PROJECT_HANDOFF.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - Voice, Command Center, Quick Command and explicit Chat execution submit objectives to the same Morpheus Core.
  - A configured provider creates a validated typed plan; no provider receives execution authority.
  - Morpheus observes structured results and may produce a bounded continuation plan until complete or genuinely blocked.
  - Existing exact trust runs without repeated prompts; a replan asks only for its new trust delta.
  - The user can stop or correct an active objective and inspect real progress, artifacts and Activity.
  - Agent Profiles, workflows and schedules are editable product systems over the same core.
  - Ordinary OpenClaw Chat and runtime pages remain functional.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - api-client-transport-policy
  - host-events-fallback-policy
  - ui-i18n-design-tokens
  - morpheus-native-action-safety
  - morpheus-objective-orchestration-safety
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-*.test.ts tests/unit/morpheus-*.test.tsx
  - pnpm exec playwright test tests/e2e/morpheus-*.spec.ts --workers=1
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run build:vite
acceptance:
  - Main owns objective state, context selection, planner choice, proposal validation, trust, execution, observation, replanning and durable history.
  - Provider output is parsed as untrusted proposal data and cannot invent capabilities, targets, grants or results.
  - Only the active Main renderer may invoke the typed host bridge; provider secrets never return to Renderer.
  - Generic Gateway RPC is restricted to the existing Chat and Channels compatibility methods.
  - File and native shell paths are accepted only inside Main-owned roots, and external URLs are HTTP(S)-only.
  - The installer never adds security exclusions, changes system long-path policy or enables CLI PATH integration without explicit in-app consent.
  - Planning and replanning have strict step, iteration, time and cycle bounds and support cancellation.
  - Voice recordings are bounded, ephemeral by default and never persisted to Audit; credentials remain in Main.
  - A continuation plan reuses matching exact grants and evaluates only newly introduced boundaries.
  - Workspaces enter through Main-owned selection and canonicalization; Renderer text cannot establish a root.
  - The plan executor remains sequential and independent of providers, voice, Gateway and ACP.
  - UI state is sourced from real Main events and visually verified throughout implementation.
  - Existing OpenClaw Chat, Gateway, Models, Agents, Channels, Skills and Cron remain functional.
docs:
  required: true
---

Windows 1.0 Foundation is an end-to-end product campaign. A type, adapter or
page does not satisfy an acceptance item unless the corresponding real user flow
works. Credential-dependent integrations must be completed up to the real
provider boundary and reported truthfully when no credential is available.
