# Morpheus Execution Architecture

Durable contract for the Morpheus native action framework. Introduced in Morpheus Concept Build 0.1, the first working milestone of the Morpheus product. This document describes the intended long-lived shape of the system, not a milestone snapshot.

The security invariants are stated in `harness/specs/rules/morpheus-native-action-safety.md`. The milestone task is `harness/specs/tasks/morpheus-concept-build.md`.

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Action registry | `shared/morpheus/actions/registry.ts` | Frozen descriptors: logical id, kind, label key, risk tier, supported platforms, parameter descriptors. Imported by both processes, so it imports no Electron and no Node built-ins. |
| Run and event model | `shared/morpheus/action-types.ts` | Phase union, event envelope, run record, snapshot shape, system/storage/process/URL/project result shapes, audit record shape. |
| Capability registry | `electron/services/morpheus/capability-registry.ts` | Maps an action id and a platform to a concrete implementation. |
| Capability implementations | `electron/services/morpheus/capabilities/<platform>/<action>.ts` | One module per action per platform. |
| Approved roots | `electron/services/morpheus/roots.ts` | Resolves a logical root key to an absolute canonical path. |
| Permission gate | `electron/services/morpheus/permission-gate.ts` | Decides whether a run may proceed. |
| Audit sink | `electron/services/morpheus/audit.ts` | Append-only record store. |
| Runtime | `electron/services/morpheus/runtime.ts` | Owns run lifecycle, phase transitions, audit ordering, event emission. |
| Host API | `electron/services/morpheus-api.ts` | Typed host-invoke surface and payload validation. |
| Renderer store | `src/stores/morpheus-actions.ts` | Subscribes to real events, orders by sequence, exposes request and respond. |
| Renderer views | `src/components/morpheus/`, `src/pages/Dashboard/` | Timeline, permission confirmation, audit view, command center. |

## Renderer flow

The Renderer calls the typed facade in `src/lib/host-api.ts`, which uses `invokeHost` from `src/lib/host-api-client.ts`. It never uses the legacy preload channel allowlist and never opens transport of its own.

A request carries a logical action id and validated parameters only. The Renderer does not choose an executable, a directory, an argument vector, an environment, or a shell string, and it cannot influence any of them.

Events arrive on a single host event channel, `morpheus:action-event`. The discriminated phase in the envelope distinguishes transitions, so adding a phase does not add a channel. The preload event allowlist is derived from the host event channel registry, so no preload change is required when the module is registered.

## Main boundary

The Main process owns the registry, the approved roots, the permission decision, the audit record, and the execution itself.

Request handling:

1. Validate the payload against an explicit key whitelist. Unknown keys are rejected rather than ignored.
2. Resolve the descriptor from the frozen registry by exact id.
3. Resolve a capability for the descriptor and the current platform. No capability is a typed unsupported outcome, not an error.
4. Resolve the concrete target — an absolute executable path, an approved-workspace folder, or no external target for bounded introspection/URL operations — so the confirmation can name what will actually happen.
5. Record the requested and awaiting-permission phases and emit them.
6. Wait for an explicit decision.
7. On grant, remove the pending record before executing, so a repeated response cannot start a second run.
8. Execute, then record and emit the terminal phase.

Every phase transition is written to the audit sink and awaited before the corresponding event is emitted. The interface can therefore never display an outcome that the audit did not capture.

## Executable resolution

Applications are addressed by a compiled-in key. The path is derived, never supplied.

1. Exact key match against the frozen application record. No regular expressions, no normalization, no case folding.
2. Base directory from a trusted process environment value, asserted absolute and drive rooted. Never from a payload.
3. Join the base, the system directory, and the registered file name.
4. Link status check: the target must be a regular file and must not be a symbolic link.
5. Real path resolution, then a containment check proving the resolved target still lies inside the canonical system directory, compared case-insensitively with normalized separators.
6. Launch with shell disabled, fixed registry arguments, window hiding on Windows, and a bounded abort timer.

## Approved roots and file creation

Approved roots are resolved through a provider interface so additional or policy-driven roots can be introduced without changing call sites. Each root is created and canonicalized once at startup and then frozen.

File names must match a strict grammar of a leading alphanumeric character followed by alphanumerics, dot, underscore or hyphen, bounded in length, ending in the permitted extension. This rejects parent traversal, path separators, and alternate data stream separators by construction. Names are additionally rejected when they match a Windows reserved device name with or without an extension, and when they end in a dot or a space.

The resolved path is asserted to lie inside the canonical root. Creation uses an exclusive create flag, so an existing entry or a previously planted link cannot be written through. Content size is bounded.

## Bounded system, web and developer capabilities

Aggregate storage reports use only the Main-owned `morpheusFiles` root and
return byte counts, not user identity or arbitrary paths. Process inventory uses
the verified `System32\\tasklist.exe` with fixed CSV arguments and returns only a
bounded process name/PID/memory snapshot; command lines and environment data are
not returned. URL opening accepts only validated `http` or `https` URLs and uses
Electron's external-browser bridge. Project launch accepts the compiled-in
`vscode` template and a relative path that Main canonicalizes inside the
approved workspace, then launches the verified VS Code executable with exactly
that one folder argument and `shell: false`.

## Audit records

Append-only, one JSON object per line, one file per day, under the user data directory. Records carry a schema version, a monotonic sequence number, a timestamp, the run and action identifiers, the phase, the decision, sanitized parameters, the outcome, the duration, and the application version.

Text file content is never persisted. Content is represented by a byte count and a truncated digest. Credentials, tokens, secrets and full sensitive paths are excluded. Files rotate daily, are pruned after a retention window, and roll when a size cap is reached. The audit location is never disclosed to the Renderer, and the Renderer can read only a bounded recent tail through the typed host API.

## Extending the system

Adding a Windows action: add a descriptor to the registry, add a capability module under the Windows capability directory, add interface strings for every supported locale. The runtime, the host contract, the event channel, the audit sink and the timeline are unchanged.

Adding a platform: add capability modules under a new platform directory and declare the platform on the affected descriptors. Nothing else changes, because unsupported platform is already a normal outcome.

Tightening policy: provide a different permission gate implementation. Adding an export or forwarder: provide an additional audit sink implementation. Adding a writable location: extend the root provider. All three are interface substitutions, not call site edits.

## Security consequence

The Renderer is treated as untrusted for this surface. The worst case a compromised Renderer can achieve is to request a registered action with valid parameters and have the user confront an accurate confirmation naming the real resolved target. It cannot introduce a new executable, escape an approved root, suppress the confirmation, forge a timeline entry, or write to the audit log.

## Independence from the agent runtime

The Morpheus action runtime does not import Gateway or ACP service modules. Native actions are a product capability in their own right, not an agent tool surface, and the agent runtime that ships alongside them stays replaceable. This is verified by a unit test over the runtime module sources.
