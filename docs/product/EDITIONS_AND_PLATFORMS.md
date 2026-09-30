# Morpheus — Editions and Platforms

## Editions

Product decision updated 2026-09-30 from the approved experience plan. One
codebase has three planned tiers; this is **not** a claim all tiers are live:

1. **Basic / BYOK** — existing companion and desktop capabilities using the user's
   provider accounts. Hosted sign-in is not required for local/BYOK use.
2. **Premium** — managed tested model/voice routes, defined usage allowance and
   explicit top-up or BYOK choice. Live identity, routes, operations and payment
   acceptance are still required; never silently switch billing accounts.
3. **Unrestricted (later)** — Premium-quality assistance with the owner's NerdGPT
   spicy humor/provider experience and verified-activation animation. NerdGPT
   renovation/integration is deferred; do not advertise this as available now.

### Shared across tiers — no exceptions

- User interface
- Agents
- Workflows
- Execution runtime
- Capability registry
- Permission engine
- Audit system
- Platform adapters

Editions differ by **configuration and entitlement**, never by source tree.

> **Do not create edition forks.** No `if (edition === 'free')` branches scattered
> through features, no parallel directories, no separate build targets. Where an
> edition difference is genuinely required, express it as a capability or provider
> entitlement resolved at runtime.

### Morpheus Unrestricted and model providers

Unrestricted is planned to use the owner's **NerdGPT**, not an assumed unrelated
external vendor. Do not implement or substitute that dependency in Phase 7.

Three constraints, none negotiable:

- NerdGPT is **not the agent engine**. It does not replace OpenClaw.
- It does **not** replace Morpheus execution controls. Provider output is reasoning;
  the permission engine still decides what may execute.
- It supplies model output through the **same replaceable adapter interface** as any
  other provider.

"Unrestricted" refers to model-output policy, **not** to operating-system authority.
No edition grants a provider unrestricted OS access. The permission engine is
edition-independent.

## Platforms

### Implemented

| Platform | Status |
| --- | --- |
| Windows (x64) | **Implemented** — Electron desktop shell, win32 capability adapters |

Source implementation does not mean packaged/hardware acceptance. Current gates
are in [Phase 7 acceptance](../releases/MORPHEUS_PHASE7_ACCEPTANCE.md); managed
service status is in [Phase 6 readiness](../roadmap/MORPHEUS_PHASE6_READINESS.md).

### Architectural targets

The architecture must remain extensible toward, without being built now:

- Linux
- macOS
- Bootable Linux USB/ISO
- Web companion
- Android companion
- iOS companion

### How extensibility is preserved

**Contracts are platform-neutral.** `shared/**` declares capabilities, plans,
permissions and audit records with no platform assumptions and no `electron` or
`node:*` imports.

**Platform behaviour lives in adapters.** Implementations register into the
capability registry keyed by `(actionId, platform)`:

```
electron/services/morpheus/capabilities/
  win32/
    app-launch.ts
    create-text-file.ts
    system-report.ts
  <future platform>/
```

**Unsupported is a normal outcome.** Resolving a capability for a platform with no
implementation yields the typed `unsupported-platform` phase, not an error. Adding a
platform means adding modules and declaring the platform on the affected descriptors
— the runtime, host contract, event channel, audit sink and interface are untouched.

**Companions consume the same contracts.** Web and mobile companions will speak to
the same typed plan/permission/audit models rather than a parallel API.

## Development tooling is not runtime

Claude Code and Codex are **development tools**. They are not Morpheus runtime
components, are not shipped, and must never be referenced by product code.
