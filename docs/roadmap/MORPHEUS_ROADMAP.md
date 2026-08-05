# Morpheus — Roadmap

Direction, not commitment. Sequencing may change; the architectural constraints in
[PRODUCT_PRINCIPLES.md](../product/PRODUCT_PRINCIPLES.md) may not.

## Shipped

### 0.1 — Concept build

Native action framework with main-owned execution authority. Frozen capability
registry, per-platform adapters, permission gate, append-only audit, live timeline,
boot sequence, command surface. Three Windows capabilities.

### 0.1.1 — Productization *(current)*

- Product identity converted to Morpheus; distribution identity, installer,
  executable metadata and artwork.
- One-time ClawX → Morpheus profile migration with validation and rollback safety.
- Inherited update feed disabled; updates report *not configured* rather than broken.
- CLI PATH integration moved behind explicit one-time consent.
- Typed execution-plan layer with a deterministic interpreter.
- Risk-based permission engine: Strict / Balanced / Autonomous, scoped session and
  persistent grants, revocation, Permission Center.
- Command Center at `/`; chat at `/chat`.

## Next

### 0.2 — Multi-step execution

Multi-step plans with dependencies and partial failure. Artifact lineage across
steps. Cancellation mid-plan. Plan preview before approval. Capability set widened
where a defensible risk tier exists.

### 0.3 — Planner substitution

Replace the deterministic interpreter with an OpenClaw or provider-backed planner
emitting the **same** `ExecutionPlan`. UI, policy engine and runtime unchanged — the
proof that the plan contract was worth building early.

### 0.4 — Reusable systems

Saved plans as reusable AI systems. Scheduling via existing cron. Parameterised
plans. Agent identity in grant scope, so trust is per-system rather than global.

### 0.5 — Platform expansion

Linux and macOS capability adapters. Contracts already platform-neutral; work is
adapters plus packaging.

## Later

- Connected services with per-service permission scopes
- Web companion
- Android and iOS companions
- Bootable Linux USB/ISO
- Workflow composition surface

## Explicitly not planned

- Edition forks of the source tree
- Replacing OpenClaw
- Unrestricted shell or PowerShell as a user-facing capability
- Cryptocurrency trading or wallet signing
- Any capability that weakens the permission architecture for convenience

## Standing constraints

Every milestone:

- ships production architecture, never demo scaffolding;
- preserves inherited OpenClaw function;
- keeps `shared/**` platform-neutral;
- keeps execution authority in the main process;
- keeps the mandatory-confirmation floor intact for high and critical risk.
