# Morpheus 0.5 Foundation — Architecture

Supplements [`MORPHEUS_ARCHITECTURE.md`](MORPHEUS_ARCHITECTURE.md), which remains
the standing description of layers and boundaries. This document records the
0.5 decisions and the reasoning behind them.

## The honest starting point

0.1.1 shipped an `ExecutionPlan` type and an interpreter that produces one — but
**no plan executor**. The renderer received the plan and dispatched
`plan.steps[0]` through `requestAction(actionId, params)`. Main never saw the
plan again, `ExecutionStep.dependsOn` was typed and never read, and the renderer
was the de-facto orchestrator.

The contract was right. The layer under it was missing. 0.5 supplies it.

## 1. Plan execution moves into Main

```
interpret ──▶ ExecutionPlan
                   │
            ┌──────▼───────────────────────────────┐
            │ PlanExecutor  (electron/services/    │
            │   morpheus/plan/)                    │
            │  • topological order over dependsOn  │
            │  • per-step status and results       │
            │  • failure isolation per branch      │
            │  • cancellation                      │
            └──────┬───────────────────────────────┘
                   │ per step
            policy.evaluate(scope)      ← unchanged from 0.1.1
                   │
            capability.resolve/execute  ← unchanged
                   │
            audit ─┴─ emit              ← unchanged ordering guarantee
```

The per-run machinery built in 0.1.1 (idempotent consumption, rate limiting,
audit-before-emit) is **reused, not rewritten**. `requestAction` becomes a thin
adapter that wraps a single capability into a one-step plan, so there is exactly
one execution pipeline and no path that bypasses planning.

### Dependency semantics

- Steps with no unmet dependency run as soon as their turn arrives.
- A failed step marks its **transitive dependents** `skipped`, not `failed` —
  they never ran, and the distinction matters when reading history.
- Independent branches continue. A plan where some steps succeed and others fail
  ends `partially-completed`, which already exists in `ExecutionPlanStatus`.
- Cycles are rejected at plan validation, before anything executes.

## 2. Permission: trust delta, not per-call prompting

**This is the central behavioural change in 0.5.**

0.1.1 evaluated one capability at a time and prompted per run. That produces the
supervise-every-tool-call experience this product explicitly rejects.

0.5 evaluates the **whole plan** before anything runs:

```
1. Resolve every step's target (so scopes are real, not requested)
2. Evaluate each scope against profile + existing grants
3. Partition:  auto-allowed | needs-consent | denied
4. If any step is denied outright  → reject the plan, explain which and why
5. If needs-consent is empty       → execute immediately, no prompt at all
6. Otherwise → ONE consent request carrying the DEDUPLICATED set of new
   trust boundaries, then execute the whole approved plan
```

Deduplication is the point: five steps writing into the same approved root are
**one** boundary, not five prompts. A plan that stays entirely inside already-
granted scopes runs with **zero** interruption.

### Risk tiers, corrected

0.1.1 treated `high` and `critical` as unwaivable. That was too blunt — it made
useful capabilities permanently annoying.

| Tier | 0.5 behaviour |
| --- | --- |
| `low` | Runs automatically under every profile when `privacySafe` |
| `medium` | Asks once per new scope; grantable once / session / persistent |
| `high` | Asks once per new scope; **grantable**, but never auto-runs on a scope the user has not seen, and grants are visible in the Permission Center |
| `critical` | **Unwaivable.** Always confirms, regardless of profile or grant |

`critical` is reserved for genuinely consequential trust changes:

- financial transactions and wallet signing
- credential and secret access
- privilege elevation
- destructive or irreversible operations (delete, overwrite)
- security-setting changes
- arbitrary shell execution
- access materially broader than anything previously authorized

Everything else is grantable. Screenshots are `high`: visible, audited,
grantable — not a prompt every time.

### Profile behaviour

| Profile | Intent |
| --- | --- |
| Strict | Reads auto-run. Everything else asks per new scope; grants apply within a session only. |
| **Balanced** (default) | Convenient. Reads auto-run; other work asks once per new scope and honours grants thereafter. |
| Autonomous | Genuinely autonomous. Low and medium risk run automatically inside trusted scopes; new scopes still surface once; `critical` still confirms. |

The floor is constant across all three: `critical` always confirms, a persistent
denial always wins, and a degraded audit always blocks non-read work.

## 3. Capability parameters become discriminated

`MorpheusActionParams` was a flat bag of optional keys
(`{ applicationKey?, fileName?, content? }`). At 18 capabilities that becomes
~40 optionals with no way to express which combination is valid.

0.5 uses a union discriminated by `capabilityId`, so validation is exhaustive
and per-capability, and adding a capability cannot silently widen another's
accepted input.

## 4. Naming: two collisions with OpenClaw, resolved

OpenClaw already owns "agent" (`~/.openclaw/agents/`, a chat workspace + model +
channel binding) and "cron" (gateway RPC, `~/.openclaw/cron/`). Morpheus needs
both concepts but means something different by them.

| Morpheus concept | Name | Storage |
| --- | --- | --- |
| Instructions + capability allowlist + permission boundary | **Agent Profile** | Morpheus user data |
| Scheduled execution of a Morpheus plan | **Schedule** | Morpheus user data |

An Agent Profile may *reference* an OpenClaw agent as its conversational
backend. It is not the same object.

**Scheduling is Morpheus-owned, not delegated to OpenClaw cron.** OpenClaw cron
triggers OpenClaw chat sessions; a Morpheus schedule must trigger a *plan* that
passes through the *Morpheus* policy engine. Routing it through OpenClaw would
place scheduled execution outside the trust boundary. OpenClaw cron is untouched
and continues to serve chat.

## 5. Audit gains a query layer

The 0.1.1 write path is correct and unchanged. `recent()` read only the current
day's file, which cannot back a real history surface. 0.5 adds
`query({ from, to, capabilityId?, status?, limit, cursor })` across daily files.

## 6. Provider-neutral planning

`MorpheusPlanner` is an interface with one method: objective + context in, typed
`ExecutionPlan` out. The deterministic interpreter implements it. A provider- or
OpenClaw-backed planner implements the same interface and substitutes without
the UI, policy engine, capability registry or audit sink changing.

Providers propose plans. They never receive operating-system authority: the
policy engine sits between any planner and any capability, and a planner cannot
name an executable path, argv, or an arbitrary filesystem location — only
capability ids and validated parameters.

## 7. Three ways to use Morpheus

| Surface | Purpose |
| --- | --- |
| **Command Center** (`/`) | Manage and observe work: command in, plan and live status out |
| **Quick Command** (global shortcut) | Do something immediately from any app, without switching windows |
| **Chat** (`/chat`) | Think and converse through OpenClaw |

## 8. What 0.5 deliberately does not build

- A no-code workflow editor. Workflows are real and reusable; authoring is code/config for now.
- Unrestricted shell or PowerShell as a user-facing capability.
- Non-Windows capability adapters. Contracts stay platform-neutral; adapters are additive.
- Cryptocurrency, wallet or financial capabilities. The `critical` tier exists to
  govern them when they arrive; nothing implements them.
