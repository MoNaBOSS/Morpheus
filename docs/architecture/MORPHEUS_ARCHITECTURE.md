# Morpheus — Architecture

## Runtime composition

| Layer | Role |
| --- | --- |
| **Electron** | Current desktop shell. An implementation detail, not the product. |
| **OpenClaw** | Embedded agent and chat runtime. Must stay functional; must not define visible identity. |
| **Morpheus** | Product identity, command experience, execution planning, permissions, capabilities, workflows, artifacts, auditability. |
| **AI providers** | Supply reasoning and model output through replaceable adapters. |

**AI providers never receive unrestricted operating-system authority.** They produce
plans and reasoning; the Morpheus policy engine decides what may execute.

Claude Code and Codex are development tools, not runtime components.

## The execution pipeline

```
  ┌────────────┐   command text
  │  Renderer  │─────────────────────────┐
  └────────────┘                         ▼
                              ┌────────────────────┐
                              │ Intent interpreter │  deterministic today,
                              └────────────────────┘  AI-backed later
                                         │ ExecutionPlan (typed)
                                         ▼
                              ┌────────────────────┐
                              │ Plan trust delta   │  all resolved scopes together
                              └────────────────────┘
                                  │            │
                       auto-allow │            │ one batched decision
                                  │            ▼
                                  │   ┌──────────────────┐
                                  │   │ Permission prompt│  real boundaries shown
                                  │   └──────────────────┘
                                  ▼            │
                              ┌────────────────────┐
                              │Sequential executor │  dependency order
                              └────────────────────┘
                                         │ per step
                              ┌────────────────────┐
                              │ Capability adapter │  (actionId, platform)
                              └────────────────────┘
                                         │
                    audit write ─────────┼───────── event emit
                    (awaited first)      ▼
                              ┌────────────────────┐
                              │ Timeline / artifact│
                              └────────────────────┘
```

Audit is written **and awaited** before the event is emitted. That ordering is the
system's core guarantee.

## Module map

| Concern | Location |
| --- | --- |
| Action registry (frozen, compiled-in) | `shared/morpheus/actions/registry.ts` |
| Run / event / audit models | `shared/morpheus/action-types.ts` |
| Execution plan models | `shared/morpheus/execution-types.ts` |
| Permission models | `shared/morpheus/permission-types.ts` |
| Plan graph + planner contract | `shared/morpheus/plan/`, `shared/morpheus/planner.ts` |
| Agent Profile / workflow / schedule models | `shared/morpheus/*-types.ts` |
| Intent interpreter | `shared/morpheus/interpreter/` |
| Capability registry | `electron/services/morpheus/capability-registry.ts` |
| Capability adapters | `electron/services/morpheus/capabilities/<platform>/` |
| Approved roots | `electron/services/morpheus/roots.ts` |
| Main-owned workspace registry | `electron/services/morpheus/workspaces/` |
| Policy engine + grant store | `electron/services/morpheus/policy/` |
| Plan store, trust evaluation, executor | `electron/services/morpheus/plan/` |
| Agent Profiles / workflows / schedules | `electron/services/morpheus/{agents,workflows,schedules}/` |
| Audit sink | `electron/services/morpheus/audit.ts` |
| Run orchestrator | `electron/services/morpheus/runtime.ts` |
| Profile migration | `electron/services/morpheus/migration.ts` |
| Typed host API | `electron/services/morpheus-api.ts` |
| Renderer store | `src/stores/morpheus-*.ts` |
| Command Center | `src/pages/CommandCenter/` |

## Boundaries

**`shared/**` is imported by both processes.** No `electron` imports, no `node:*`
imports. Enforced by `morpheus-runtime-isolation.test.ts`.

**Renderer → main is the typed host-invoke API only.** `window.clawx.hostInvoke` →
`ipcMain.handle('host:invoke')` → `HostApiRegistry`. The legacy per-channel preload
allowlist gains no Morpheus entries.

**Main → renderer runtime transitions use one event channel**,
`morpheus:action-event`, carrying a discriminated phase union. Product-level host
signals such as `morpheus:quick-command` are separately registered in
`HOST_EVENT_CHANNELS`; the preload event allowlist is derived from that registry.

**The action runtime imports no Gateway or ACP module.** Native actions are a product
capability, not an agent tool surface, which keeps the agent runtime replaceable.

## Why a plan layer exists now

Today's interpreter is deterministic and maps a bounded objective set to nineteen
real Windows capabilities and reusable workflows. It would have been cheaper to
call capabilities directly.

The plan layer exists so that swapping the interpreter for an AI planner later
requires **no change** to the UI, policy engine, capability registry, audit sink or
event contract. A future planner emits the same `ExecutionPlan`; everything
downstream is unchanged. Multi-step dependency execution, batched trust evaluation,
workflows, schedules and Quick Command already prove that substitution boundary.

## Extension recipes

**New action on Windows** — add a descriptor to the registry, add a capability module
under `capabilities/win32/`, add locale strings. Runtime, contract, audit and
interface unchanged.

**New platform** — add modules under `capabilities/<platform>/` and declare the
platform on affected descriptors. `unsupported-platform` is already a normal outcome.

**Stricter policy** — provide a different permission-gate implementation behind the
existing interface.

**Additional audit destination** — provide another sink implementation.

**New trusted workspace** — register it through the typed Main API. Main obtains
the path from its native directory picker, canonicalizes it, and persists only a
logical id for Renderer selection. The root provider captures that canonical
root for one execution; callers never extend authority with a path payload.

All four are interface substitutions, not call-site edits.
