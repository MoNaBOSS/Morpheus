---
id: morpheus-concept-build
title: Morpheus Concept Build 0.1 native action milestone
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Establish the first working milestone of the Morpheus product surface by adding a Main-owned, permission-gated, audit-logged native action framework with an extensible capability registry, a command-center dashboard, and a boot sequence, while preserving all existing ClawX and OpenClaw behavior.
touchedAreas:
  - harness/specs/tasks/morpheus-concept-build.md
  - harness/specs/rules/morpheus-native-action-safety.md
  - harness/reference/morpheus-execution-architecture.md
  - shared/morpheus/**
  - shared/host-api/contract.ts
  - shared/host-events/contract.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/**
  - electron/services/morpheus-api.ts
  - electron/utils/morpheus-path-guard.ts
  - electron/main/ipc-handlers.ts
  - electron/main/index.ts
  - src/lib/host-api.ts
  - src/lib/host-events.ts
  - src/stores/morpheus-actions.ts
  - src/components/morpheus/**
  - src/pages/Dashboard/**
  - src/components/layout/Sidebar.tsx
  - src/styles/globals.css
  - src/App.tsx
  - tests/unit/morpheus-**
  - tests/unit/host-contract-registration.test.ts
  - tests/unit/host-api-facade.test.ts
  - tests/e2e/morpheus-**
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - Existing Chat, Gateway, channels, agents, skills, cron, providers and settings behavior is unchanged.
  - The root route continues to render the Chat page and the setup wizard still gates first launch.
  - A boot sequence plays on launch, can be skipped, and always dismisses itself within a bounded time.
  - A Dashboard entry appears in the sidebar and opens a command center showing privacy-safe system information, an action launcher, a live execution timeline, and recent audit entries.
  - Requesting a native action always shows a confirmation that names the resolved target before anything executes.
  - Denying a request performs no filesystem or process work and is visible in the timeline and audit log.
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
  - pnpm exec vitest run tests/unit/morpheus-action-registry.test.ts tests/unit/morpheus-path-guard.test.ts tests/unit/morpheus-capability-registry.test.ts tests/unit/morpheus-app-launch.test.ts tests/unit/morpheus-create-text-file.test.ts tests/unit/morpheus-audit.test.ts tests/unit/morpheus-runtime.test.ts tests/unit/morpheus-runtime-isolation.test.ts tests/unit/morpheus-api.test.ts tests/unit/morpheus-actions-store.test.ts tests/unit/morpheus-boot-phases.test.ts
  - pnpm exec vitest run tests/unit/host-contract-registration.test.ts tests/unit/host-api-facade.test.ts
  - pnpm run build:vite
  - pnpm exec playwright test tests/e2e/morpheus-boot.spec.ts tests/e2e/morpheus-dashboard.spec.ts tests/e2e/morpheus-actions-permission.spec.ts tests/e2e/morpheus-audit.spec.ts
  - pnpm exec playwright test tests/e2e/app-smoke.spec.ts tests/e2e/main-navigation.spec.ts
acceptance:
  - Native action descriptors live in a frozen compiled-in registry that the Renderer cannot mutate through any host action.
  - Capability implementations are resolved by action id and platform, and an unsupported platform is a normal typed outcome rather than an error.
  - The Renderer sends only a logical action id and validated parameters, never an executable path, argv, environment, shell string, or unrestricted filesystem path.
  - Native process execution uses shell false with fixed arguments and a resolved absolute executable verified against a trusted system root.
  - Text file creation is confined to a Main-canonicalized approved root and uses exclusive create so an existing entry or planted link cannot be written through.
  - Every action requires an explicit confirmation, and execution is only reachable from the awaiting-permission phase for a live run identifier.
  - Every real phase transition is written to the append-only audit log before the corresponding host event is emitted.
  - Audit records never contain text file content, credentials, or secrets.
  - The execution timeline is populated only by real Main-process events.
  - The Morpheus action runtime does not import Gateway or ACP service modules.
docs:
  required: true
---

## Scope

Morpheus Concept Build 0.1 is the first working milestone of the Morpheus product. It is not a demonstration edition, a separate build target, or a temporary prototype. Every module introduced here is intended to remain in the product and to be extended rather than replaced.

The milestone introduces four durable foundations:

1. A shared, frozen action registry describing native capabilities by logical id, parameter shape, risk tier, and supported platforms.
2. A Main-process capability registry that resolves an action id and a platform to a concrete implementation, so additional actions and additional platforms are added as data and modules rather than as runtime changes.
3. A Main-owned permission gate and append-only audit sink, both behind interfaces so stricter policies and additional sinks can be introduced without changing call sites.
4. A Renderer command center that renders a live execution timeline driven exclusively by real Main-process events.

Three capabilities seed the registry: launching an approved application, creating a text file inside a Main-controlled approved root, and retrieving privacy-safe system information. They are the first entries in the registry, not the intended limit of the product.

The durable architecture contract is `harness/reference/morpheus-execution-architecture.md`. The security invariants are `harness/specs/rules/morpheus-native-action-safety.md`.

## Product identity

This milestone converts the in-application product surface toward Morpheus. It deliberately does not change distribution identity. Application id, product name, update feed, signing configuration, and user data location remain as they are, because changing them breaks update continuity and orphans existing user data. Distribution identity migration is separate work.

## Out of Scope

- Any change to the OpenClaw configuration sanitizer or to OpenClaw tool execution.
- Routing native actions through OpenClaw tools or the Gateway.
- Renderer-editable action policy or user-managed allowlists.
- Signature verification of registered executables.
- Linux and macOS capability implementations.
- Remembered or pre-granted permission decisions.
- Distribution identity rename and update feed migration.
- Repairs to pre-existing unrelated boundary gaps outside the Morpheus action surface.
