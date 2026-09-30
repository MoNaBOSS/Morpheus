# Morpheus — Product Vision

> Canonical. If any other document, comment, ticket or implementation contradicts
> this file, this file wins until it is deliberately amended.

2026-09-30 amendment: Morpheus's primary experience is the quiet desktop companion
defined in the [assistant architecture](../architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md).
The [Phase 7 plan](../roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md) governs current
delivery; older roadmap/UI snapshots are history, not current defaults.

## What Morpheus is

**Morpheus is an AI execution platform and AI system builder.** It is not a chatbot,
and it is not a wrapper around one.

The distinction is not cosmetic. A chatbot's output is text. Morpheus's output is
**executed work** — files created, applications launched, systems inspected,
artifacts produced — each one planned, policy-checked, permissioned where required,
and permanently recorded.

## The operating model

Every Morpheus command follows one path:

```
Voice / text / Quick Command / Chat execution
  → objective + bounded context
  → intent interpretation
  → typed execution plan
  → policy evaluation
  → permission where required
  → deterministic capability execution
  → live events
  → results and artifacts
  → structured observation and bounded replanning when needed
  → optional spoken response and useful context
  → append-only audit history
```

This pipeline is the product. Each stage is a real, separable component with its own
contract, and each can be upgraded without rewriting the others:

| Stage | Today | Future |
| --- | --- | --- |
| Intent interpretation | Deterministic direct routing and bounded provider-backed planning | Scoped agent/worker adapters under the same authority |
| Execution plan | Typed, multi-step with dependencies | Richer conditions, retries and lineage |
| Policy evaluation | Plan-level trust delta + profiles + scoped grants | Same engine, connected-service scopes |
| Execution | Windows capability adapters | Linux, macOS, remote adapters |
| Audit | Cross-day append-only JSONL + durable artifact metadata | Same contract, additional sinks |

**The interpreter is temporary. The plan contract is permanent.** A future AI planner
must be able to emit the same `ExecutionPlan` structure without touching the UI, the
policy engine, or the runtime.

## Chat is an interface, not the product

Chat is one way to reach Morpheus. It is not what Morpheus *is*. Voice, Quick
Command, the expanded workspace and explicit Chat execution enter the same Core.
The quiet bottom-right orb, upward composer and compact conversation are the
primary surfaces. Full expansion is explicit; conversation and useful results
remain together. No everyday Ask/Auto/Act selector, plan-stage dashboard or
provider/trust controls. Detailed work remains inspectable when requested.
Ordinary OpenClaw Chat stays functional as an advanced destination, not a forced
navigation whenever the user asks a normal question.

## What Morpheus is not

- Not a chat client with buttons bolted on.
- Not a shell wrapper. An AI provider never receives unrestricted operating-system
  authority. Providers produce *reasoning*; Morpheus decides what may execute.
- Not a demo. Every capability shown is real and runs real code.
- Not a re-skin. Identity, execution planning, permissions, capabilities, artifacts
  and auditability are Morpheus's own.

## Honesty requirements

These are product requirements, not style preferences:

- **No fake capabilities.** If it appears in the interface, it executes.
- **No simulated events.** Every timeline entry originates from a real main-process
  transition.
- **No invented diagnostics.** Runtime status reflects actual runtime state.
- **No unsupported claims.** If a provider or model is not genuinely known, the
  interface says so rather than guessing.
- **Truthful refusal.** An unsupported command produces a clear, useful answer
  describing what Morpheus actually supports — never a fabricated success.

## Trust posture

Morpheus asks for real authority over a user's machine. That is earned by being
predictable and inspectable:

- The complete plan and execution reason remain observable. When a genuinely new
  trust boundary needs consent, the prompt describes what Main actually resolved;
  work inside existing exact trust does not interrupt repeatedly.
- Approvals are **narrow and revocable**, never blanket.
- Everything is **recorded** before it is reported.
- When the audit trail cannot be written, Morpheus **degrades rather than proceeds**.

See [`docs/security/PERMISSION_MODEL.md`](../security/PERMISSION_MODEL.md).

## Relationship to OpenClaw

OpenClaw is the embedded agent and chat runtime. It must remain fully functional.

It must **not** define the visible product identity. Users experience Morpheus;
OpenClaw is an internal runtime dependency, in the same category as Electron or
Chromium.

## Related documents

- [Product principles](PRODUCT_PRINCIPLES.md)
- [Editions and platforms](EDITIONS_AND_PLATFORMS.md)
- [Permission model](../security/PERMISSION_MODEL.md)
- [Architecture](../architecture/MORPHEUS_ARCHITECTURE.md)
- [Roadmap](../roadmap/MORPHEUS_ROADMAP.md)
