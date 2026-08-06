---
id: morpheus-concept-build
title: Morpheus productization milestone 0.1.1
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Convert the desktop product from ClawX to Morpheus and add the durable execution-planning and risk-based permission layers, so the Command Center is the product home and remembered scoped consent replaces confirm-on-every-execution, while preserving all existing OpenClaw behavior.
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
  - CLAUDE.md
  - docs/**
  - electron/main/updater-policy.ts
  - electron/main/updater.ts
  - electron/main/cli-integration-consent.ts
  - electron/utils/logger.ts
  - electron-builder.yml
  - index.html
  - package.json
  - resources/branding/**
  - resources/icons/**
  - scripts/generate-morpheus-icons.mjs
  - src/assets/morpheus-logo.svg
  - src/pages/CommandCenter/**
  - src/pages/Settings/index.tsx
  - src/pages/Setup/index.tsx
  - src/components/file-preview/**
  - src/stores/morpheus-command.ts
  - electron/main/menu.ts
  - electron/main/tray.ts
  - src/components/layout/use-new-chat-action.ts
  - tests/unit/use-new-chat-action.test.tsx
  - tests/unit/sidebar-session-buckets.test.ts
  - tests/e2e/main-navigation.spec.ts
  - tests/e2e/developer-mode.spec.ts
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - Existing Chat, Gateway, channels, agents, skills, cron, providers and settings behavior is unchanged.
  - The root route renders the Morpheus Command Center; chat moves to /chat and stays fully functional.
  - A boot sequence plays on launch, can be skipped, and always dismisses itself within a bounded time.
  - Command Center and Chat are separate sidebar entries, and at 1280x800 identity, the command input, runtime status, provider/model, permission profile and navigation are visible without scrolling.
  - Privacy-safe read-only actions run automatically; other actions ask once and can be remembered for an exact target, for the session or permanently, and grants are revocable without restart.
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
  - pnpm exec vitest run tests/unit/morpheus-action-registry.test.ts tests/unit/morpheus-path-guard.test.ts tests/unit/morpheus-capability-registry.test.ts tests/unit/morpheus-app-launch.test.ts tests/unit/morpheus-create-text-file.test.ts tests/unit/morpheus-audit.test.ts tests/unit/morpheus-runtime.test.ts tests/unit/morpheus-runtime-isolation.test.ts tests/unit/morpheus-api.test.ts tests/unit/morpheus-actions-store.test.ts tests/unit/morpheus-boot-phases.test.tsx tests/unit/morpheus-identity.test.ts tests/unit/morpheus-migration.test.ts tests/unit/morpheus-policy-engine.test.ts tests/unit/morpheus-grant-store.test.ts tests/unit/morpheus-execution-plan.test.ts tests/unit/morpheus-cli-consent.test.ts
  - pnpm exec vitest run tests/unit/host-contract-registration.test.ts tests/unit/host-api-facade.test.ts
  - pnpm run build:vite
  - pnpm exec playwright test tests/e2e/morpheus-boot.spec.ts tests/e2e/morpheus-routing.spec.ts tests/e2e/morpheus-command-center.spec.ts tests/e2e/morpheus-actions-permission.spec.ts tests/e2e/morpheus-audit.spec.ts
  - pnpm exec playwright test tests/e2e/app-smoke.spec.ts tests/e2e/main-navigation.spec.ts
acceptance:
  - Native action descriptors live in a frozen compiled-in registry that the Renderer cannot mutate through any host action.
  - Capability implementations are resolved by action id and platform, and an unsupported platform is a normal typed outcome rather than an error.
  - The Renderer sends only a logical action id and validated parameters, never an executable path, argv, environment, shell string, or unrestricted filesystem path.
  - Native process execution uses shell false with fixed arguments and a resolved absolute executable verified against a trusted system root.
  - Text file creation is confined to a Main-canonicalized approved root and uses exclusive create so an existing entry or planted link cannot be written through.
  - Execution is only reachable from the awaiting-permission phase for a live run identifier, and high or critical risk always confirms regardless of profile or grant.
  - Grants bind to an exact capability, platform, resource, risk tier and origin; wildcard or broad grants cannot be expressed even by editing the stored policy.
  - The Renderer cannot create, modify or delete a grant; policy is owned by a Main-process service with atomic writes.
  - When audit persistence is unhealthy, write and launch actions are blocked while privacy-safe reads continue.
  - Product identity is Morpheus: application id, product name, version, window title, installer naming, executable metadata and artwork.
  - The inherited ClawX update feed is removed and rejected, and updates report a not-configured state rather than a broken check.
  - An existing ClawX profile is imported once, validated, never overwritten and never deleted.
  - CLI PATH integration happens only after an explicit one-time user choice.
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

0.1.1 converts distribution identity as well as the product surface: application id `app.morpheus.desktop`, product name Morpheus, version 0.1.1, Morpheus window title and executable metadata, and original Morpheus artwork generated from a single vector source. Because the application id moves the user-data location, a one-time import brings an existing ClawX profile across without ever modifying or deleting the source.

## Out of Scope

- Any change to the OpenClaw configuration sanitizer or to OpenClaw tool execution.
- Routing native actions through OpenClaw tools or the Gateway.
- Renderer-editable action policy or user-managed allowlists.
- Signature verification of registered executables.
- Linux and macOS capability implementations.
- A configured Morpheus update endpoint; auto-update stays inert until one exists.
- Linux, macOS, web and mobile targets.
- Multi-step plans; the plan contract supports them but the interpreter emits one step.
- Repairs to pre-existing unrelated boundary gaps outside the Morpheus action surface.
