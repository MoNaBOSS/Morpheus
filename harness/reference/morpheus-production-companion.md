# Morpheus Production Companion Reference

The production companion adds ambient voice, proactive attention, Goals and
Systems without adding another planner, executor or permission path. Canonical
architecture: `docs/architecture/MORPHEUS_PRODUCTION_COMPANION_ARCHITECTURE.md`.

Durable invariants:

1. Ambient voice is explicit, visible, provider-disclosure-aware and never
   persists audio or transcript.
2. Proactive state is derived from real Main projections and has no direct
   native authority.
3. A Goal organizes Missions but cannot execute or grant authority.
4. A System composes existing Agent Profile, workflow, workspace and schedules;
   activation requires a successful real test and never grants trust.
5. Every background execution enters Objective Core, plan trust, sequential
   capability execution and Audit.
6. Renderer may request logical operations only and cannot author state results.
