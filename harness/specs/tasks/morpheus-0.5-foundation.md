---
id: morpheus-0.5-foundation
title: Morpheus 0.5 execution platform foundation
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Complete the Morpheus-owned Agent Profile, workflow, scheduling, Quick Command, activity and Command Center foundations on the existing sequential plan executor without weakening OpenClaw or native-action trust boundaries.
touchedAreas:
  - shared/morpheus/**
  - shared/host-api/contract.ts
  - shared/host-events/contract.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/**
  - electron/services/morpheus-api.ts
  - electron/main/ipc-handlers.ts
  - electron/main/index.ts
  - src/lib/host-api.ts
  - src/lib/host-events.ts
  - src/stores/morpheus-**
  - src/components/morpheus/**
  - src/pages/CommandCenter/**
  - src/pages/AgentProfiles/**
  - src/pages/Workflows/**
  - src/pages/Schedules/**
  - src/pages/Activity/**
  - src/components/layout/Sidebar.tsx
  - src/App.tsx
  - src/styles/globals.css
  - tests/unit/morpheus-**
  - tests/e2e/morpheus-**
  - docs/**
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - A user gives Morpheus an objective and sees a truthful typed plan execute sequentially through real capabilities.
  - Agent Profiles constrain planner, capabilities, workspace and context without acquiring operating-system authority.
  - Reusable workflows compile to the same Main-owned ExecutionPlan used by the Command Center.
  - Morpheus schedules invoke workflows through the same policy engine and never bypass permission grants.
  - A global shortcut opens Quick Command, which uses the same interpreter, plan executor, timeline and batched consent path.
  - Activity queries append-only audit history across daily files without exposing secret or text payloads.
  - The Command Center presents real runtime, plan, trust, execution and artifact state at 1280x800.
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
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run lint
  - pnpm exec vitest run tests/unit/morpheus-agent-profiles.test.ts tests/unit/morpheus-workflows.test.ts tests/unit/morpheus-schedules.test.ts tests/unit/morpheus-activity.test.ts tests/unit/morpheus-quick-command.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-0.5-foundation.spec.ts tests/e2e/morpheus-command-center.spec.ts tests/e2e/morpheus-routing.spec.ts
  - pnpm run build:vite
acceptance:
  - Plans remain sequential in 0.5 and dependency failures skip only their transitive dependants.
  - A profile or workflow capability allowlist can narrow execution but can never create a permission grant or bypass policy.
  - A schedule has a distinct schedule origin and therefore does not inherit command-bar or manual-workflow grants.
  - Persistent schedules are written atomically, bounded, validated and safe after partial or corrupt state.
  - Quick Command accepts only a natural-language objective and never receives executable paths, argv, environment, shell strings or unrestricted paths.
  - Audit queries are bounded, cursor-based and read only valid retained Morpheus JSONL records.
  - Existing OpenClaw Chat, Agents, Skills, Channels, Cron and Gateway routes remain reachable and functional.
  - All user-facing text has en, zh, ja and ru locale coverage and Morpheus surfaces use the permanent design tokens.
docs:
  required: true
---

Morpheus 0.5 turns the secure native-action foundation into one coherent execution product. Agent Profiles, workflows, schedules and Quick Command are separate sources of typed plans, not parallel execution engines. Every path converges in Main on the existing capability registry, trust-delta evaluation, sequential executor, runtime events and append-only audit sink.

The milestone deliberately excludes unrestricted shell execution, a no-code workflow editor, provider-specific operating-system authority, non-Windows capability adapters and simulated agents or results.
