# Morpheus Execution Architecture

Durable contract for Morpheus execution. Concept Build 0.1 established the
native-action boundary; 0.5 makes every entry surface converge on a Main-owned,
sequential, typed plan executor. Security invariants live in
`harness/specs/rules/morpheus-native-action-safety.md`.

## Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Platform-neutral contracts | `shared/morpheus/**` | Actions, discriminated parameters/results, plans, permissions, Agent Profiles, workflows, schedules, planner interface, audit records. No Electron or Node imports. |
| Action registry | `shared/morpheus/actions/registry.ts` | Frozen logical ids, risk/privacy metadata, parameter descriptors, supported platforms, approved application/templates. |
| Plan graph | `shared/morpheus/plan/graph.ts` | Validates ids/dependencies, rejects cycles, and computes deterministic order. |
| Plan store/trust/executor | `electron/services/morpheus/plan/` | Holds Main-authored plans, resolves all targets, computes trust delta, requests one batched decision, and executes steps sequentially. |
| Policy/grants | `electron/services/morpheus/policy/` | Strict/Balanced/Autonomous evaluation and atomic exact-scope session/persistent grants/denials. |
| Capability adapters | `electron/services/morpheus/capabilities/<platform>/` | Resolve and execute one registered capability. Windows ships today. |
| Workspace registry and approved roots | `electron/services/morpheus/workspaces/`, `electron/services/morpheus/roots.ts` | Atomically stores Main-selected logical workspaces and captures one canonical root per execution. |
| Runtime | `electron/services/morpheus/runtime.ts` | Run lifecycle, audited phase transitions, real event emission, single-action compatibility adapter. |
| Agent/workflow/schedule services | `electron/services/morpheus/{agents,workflows,schedules}/` | Validated persistent product models that compile or invoke the same plan pipeline. |
| Audit query/sink | `electron/services/morpheus/audit.ts` | Append-only ordered writes, outcome redaction, cross-day bounded queries, health state. |
| Typed host boundary | `electron/services/morpheus-api.ts`, `src/lib/host-api.ts` | Explicit payload validation and typed `host:invoke`; no Renderer transport switching. |
| Renderer projections | `src/stores/morpheus-*.ts` | Subscribe to real events and render Main-owned state. Never acquire execution authority. |

## Entry flow

```
objective / workflow / schedule
        ↓
Main-authored ExecutionPlan
        ↓
resolve every real target and exact PermissionScope
        ↓
evaluate complete-plan trust delta
        ↓
zero prompts, or one deduplicated consent request
        ↓
sequential step execution through capability registry
        ↓
audit each transition before host event emission
        ↓
real status, result, artifact and Activity history
```

The Renderer can ask Main to interpret an objective or execute a registered plan
id. It cannot submit an executable path, argument vector, environment, shell
string, working directory, unrestricted path, permission grant, fabricated plan
result, or audit record.

## Plan semantics

- Graph validation happens before trust evaluation or execution.
- 0.5 executes one step at a time in deterministic topological order. There is
  no concurrency.
- A failed step marks transitive dependants `skipped`; independent branches may
  continue, yielding `partially-completed` when appropriate.
- All targets are resolved before consent so the prompt names the real boundary.
- Equivalent scopes are deduplicated across the whole plan.
- Single-action requests are wrapped into one-step plans; there is no bypass.

## Trust semantics

- Low privacy-safe work runs automatically.
- Balanced is convenient: a new medium/high boundary asks once and exact grants
  are reused afterwards.
- Autonomous may run low/medium work inside trusted exact scopes without
  interruption; it is never arbitrary shell authority.
- High risk (for example clipboard read or screen capture) is sensitive but
  grantable. Capture remains visible and audited.
- Critical risk is unwaivable and reserved for consequential boundaries such as
  credentials, financial signing, privilege elevation, destructive/irreversible
  work, security changes, or arbitrary shell authority.
- Audit degradation permits only explicitly safe read-only work and blocks
  writes/process launches until persistence recovers.
- A profile, Agent Profile, workflow, provider, or schedule may narrow authority;
  none can create a grant or widen policy.

## Filesystem and process safety

Workspace trust is rooted in a canonical Main-owned root, not individual file
names. Renderer sends only a validated logical workspace id; adding a workspace
always invokes Main's native folder picker. Registrations persist atomically,
missing or redirected roots fail closed, and removing a registration never
deletes files. Removal revokes every session, persistent and denial grant bound
to that exact root so trust cannot silently return if the folder is re-added.
Routine non-destructive operations within an exact trusted root reuse the same
grant. Relative names are validated, canonicalized, checked for containment,
bounded, and protected against links/reserved Windows names. Read-only workspace
policy is enforced in the runtime for direct and planned execution. Creation is
exclusive; overwrite and deletion remain critical. `file.create` extends
exclusive creation to a frozen non-executable text-extension set while keeping
the root Main-owned. `site.verify` may resolve a contained future folder during
whole-plan trust preparation, but it must re-resolve and inspect the real files
after dependency execution before producing a verified artifact.

Applications and developer tools use frozen compiled-in keys/templates. Main
resolves trusted system roots, rejects links, verifies real-path containment,
uses fixed or one canonical workspace argument, and launches with `shell: false`.
There is no generic command, PowerShell, script host, argv, or environment API.

Clipboard read and write are distinct scopes. Screen capture accepts no Renderer
parameters and writes a Main-generated PNG only inside the approved artifact
root. URL opening accepts validated HTTP(S) only. Every capability has explicit
risk/privacy metadata and a focused adapter test.

## Audit and artifacts

Each phase is appended and awaited before the corresponding Renderer event.
Records rotate by day and are queried with bounded cursors across retained files.
Control events include profile changes, grants, grant use/revocation, workflows,
and schedules.

Durable outcomes are metadata-only. File/clipboard text, notification copy,
process names, directory entries, and URL paths/queries are transient and never
persisted. File content is represented by size/digest where relevant. Recent
artifacts reconstruct from this reduced ledger after restart; the Renderer does
not maintain a second authoritative history store.

Website artifacts retain only the canonical project/entry locations, relative
entry reference, file count, byte count, and verified state. Their built-in
preview reuses the Main-owned local HTML navigation policy. Scheduled reminder
artifacts retain schedule/workflow ids, trigger type, and next-run time; reminder
copy is not written to the execution audit outcome.

## Agent, workflow, schedule, and provider boundaries

Agent Profiles carry planner binding, instructions, capability allowlist,
workspace/context policy, and maximum risk. Workflows carry steps, dependencies,
conditions, Agent Profile assignment, outputs, and allowed triggers. Morpheus
schedules persist atomically and invoke workflows through the same policy engine.
OpenClaw agents/cron remain separate chat-runtime concepts.

`reminder.schedule` is the bounded convenience path: it persists one generated
notification workflow plus one one-time/daily schedule. Removing that schedule
also removes its generated workflow. It cannot carry an executable, command,
URL, filesystem path, environment value, or shell payload.

`MorpheusPlanner` maps objective + context to the same typed plan contract. The
deterministic planner implements it today. Future OpenClaw/provider adapters may
propose plans, but never execute capabilities or receive OS authority.

## Extension rules

Adding an action requires one frozen descriptor, discriminated validation,
platform adapter, locale coverage, risk/scope tests, audit-redaction review, and
real E2E behavior. Adding a platform means new adapters and descriptor platform
declarations; shared contracts, executor, policy, events, and UI remain unchanged.
