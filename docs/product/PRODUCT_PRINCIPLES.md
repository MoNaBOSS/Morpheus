# Morpheus — Product Principles

Operating rules for anyone changing this codebase. Each is testable; most are
enforced by tests named in the right-hand column.

## 1. Execution over conversation

Morpheus's value is work performed, not text produced. When a feature could be built
as "the agent says it did X" or "Morpheus actually does X", build the second.

| Rule | Enforced by |
| --- | --- |
| Every command produces a typed `ExecutionPlan` | `morpheus-execution-plan.test.ts` |
| Every timeline entry comes from a real main-process event | `morpheus-runtime.test.ts` |

## 2. The main process is the authority

The renderer is untrusted for anything that touches the operating system.

- The renderer sends a **logical action id** and **validated parameters**. Nothing else.
- It never supplies an executable path, argv, environment, shell string, working
  directory, or arbitrary filesystem path.
- Policy and grants are owned by a main-process service with atomic writes. Renderer
  state, Zustand persistence and ordinary settings APIs are **not** the authority.
- Unknown payload keys are **rejected**, not ignored.

## 3. Narrow, revocable, remembered consent

"Confirm everything forever" is not a security model — it trains users to click
through. Neither is "allow everything once".

- Grants bind to an **exact scope**: capability or frozen capability group,
  platform, canonical resource, risk tier, and origin.
- A changed scope invalidates the grant.
- Permission is evaluated across the complete plan and genuinely new scopes are
  batched into one decision.
- High risk is sensitive but grantable. Critical risk always confirms regardless
  of profile or grant.
- Revocation takes effect on the next execution, with no restart.

## 4. Record before you report

An audit entry is written **and awaited** before its phase reaches the interface. The
user can never be shown an outcome the audit missed.

When auditing is unhealthy, Morpheus enters a visible degraded-security state and
permits only explicitly safe read-only work.

## 5. Truthful surfaces

Never render a value the runtime cannot substantiate. Unknown is a legitimate state
and must be displayed as such — an honest "not configured" beats a plausible fiction.

## 6. Platform-neutral contracts, platform-specific adapters

`shared/**` is imported by both processes and must contain no `electron` and no
`node:*` imports. Platform behaviour lives behind capability adapters keyed by
`(actionId, platform)`. An unsupported platform is a **typed outcome**, never an
exception, so new platforms are additive.

## 7. One codebase, no edition forks

Free and Unrestricted differ by configuration and entitlement, never by source tree.
See [Editions and platforms](EDITIONS_AND_PLATFORMS.md).

## 8. Replaceable providers

Model providers sit behind adapters. The execution runtime must not import provider
or agent-runtime modules — enforced by `morpheus-runtime-isolation.test.ts`.

## 9. Additive, not disposable

Every milestone ships production architecture. No demo modes, no throwaway
prototypes, no per-audience code paths. If something is temporary, it is temporary
*behind a permanent contract* — like the deterministic interpreter behind
`ExecutionPlan`.

## 10. Preserve what works

OpenClaw chat, gateway, channels, agents, skills, cron and providers must keep
working. Productization changes identity and adds capability; it does not regress
inherited function.

## Definition of done

A change is complete when:

1. `typecheck` and `lint` pass.
2. New behaviour has tests; security behaviour has *negative* tests.
3. No fake data, simulated events or unsubstantiated claims were introduced.
4. Inherited functionality still works.
5. Docs updated when behaviour or interfaces changed (AGENTS.md doc-sync rule).
