# Morpheus — Editions and Platforms

## Editions

One codebase supports two editions:

1. **Morpheus Free**
2. **Morpheus Unrestricted**

### Shared by both — no exceptions

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

Unrestricted may use **NerdGPT** or another configured model-output provider.

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
