# Morpheus — Roadmap

Direction, not commitment. Sequencing may change; the architectural constraints in
[PRODUCT_PRINCIPLES.md](../product/PRODUCT_PRINCIPLES.md) may not.

## Shipped

### 0.1 — Concept build

Main-owned native action framework: frozen capability registry, per-platform
adapters, permission gate, append-only audit, real runtime timeline, Matrix boot
sequence, and three deterministic Windows capabilities.

### 0.1.1 — Productization

- Morpheus application identity, installer metadata, artwork, and safe one-time
  ClawX profile import.
- Inherited update feed disabled and CLI PATH integration moved behind consent.
- Typed plan contract and deterministic interpreter.
- Strict / Balanced / Autonomous permission profiles, exact session and
  persistent grants, revocation, and Permission Center.
- Command Center at `/`; OpenClaw chat at `/chat`.

### 0.5 — Execution platform foundation *(current)*

- Main-owned sequential multi-step executor with dependency validation,
  transitive skipping, partial completion, cancellation, and real step results.
- Plan-level trust-delta evaluation and one batched consent decision for all new
  scopes. High risk is grantable; critical risk remains unwaivable.
- Nineteen controlled Windows capabilities across workspace filesystem, approved
  apps, clipboard, notifications, screenshots, system inspection, URLs, and a
  bounded VS Code project launcher. No unrestricted shell surface.
- Reusable Agent Profile contract with General, Research, and Developer starters.
- Reusable workflow contract with real sequential starter workflows.
- Morpheus-owned manual, interval, daily, one-time, and app-startup schedules.
- Global Quick Command using the same planner, policy, executor, events, and audit.
- Cross-day Activity ledger and durable artifact recovery from privacy-safe audit
  metadata.
- Permanent Matrix-accented design system and a command-first 1280×800 Command
  Center. Fresh profiles use the dark product theme by default.
- OpenClaw gateway, chat, Agents, Skills, Channels, Cron, and provider/model
  surfaces remain separate and functional.

## In progress

### Windows 1.0 Foundation

One coherent campaign: centralized objective orchestration, provider-backed
planning, structured observation/replanning, bounded context/memory, first-class
voice, usable Agent Profiles/workflows/schedules, workspace/artifact lineage,
flagship Quick Command, voice-first Command Center, Windows background behavior,
security hardening and packaged end-to-end verification.

This is deliberately not four disconnected 0.x mini-products. It reuses the 0.5
executor and trust chassis and judges completion by real packaged user journeys.

## Later

- Connected services with per-service trust scopes
- Web companion
- Android and iOS companions
- Bootable Linux USB/ISO
- Reusable AI-system templates and sharing

## Explicitly not planned

- Edition forks of the source tree
- Replacing OpenClaw
- Unrestricted shell or PowerShell as a general capability
- Provider-direct operating-system authority
- Cryptocurrency trading or wallet signing without a dedicated critical-risk
  architecture and explicit product milestone
- Any capability that weakens trust boundaries for convenience

## Standing constraints

Every milestone:

- ships production architecture, never demo scaffolding;
- preserves inherited OpenClaw functionality;
- keeps `shared/**` platform-neutral;
- keeps planning output separate from execution authority;
- keeps execution, trust, grants, schedules, and audit persistence in Main;
- evaluates permissions at plan level and interrupts only for a genuinely new or
  materially elevated boundary;
- keeps critical-risk confirmation unwaivable;
- records real transitions before emitting them to the Renderer.
