# Morpheus Companion and Mission Reference

The compact companion, Command Center, voice, and Chat execution are Renderer
projections over one Main-owned Objective Core. See
`docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md`.

Durable invariants:

1. A Mission projects real Objective Core state; it cannot execute a capability.
2. Projects select existing workspace ids; they cannot establish path authority.
3. Memory is bounded, inspectable, deletable, sensitivity-labelled, and filtered
   in Main before provider context is created.
4. Deterministic supported intents route before remote planning, but still enter
   the same plan trust and sequential execution path.
5. Compact-window mode never creates a second privileged renderer and must
   restore the prior window state.
6. Objective, Mission, permission, action, and artifact displays are sourced
   from real Main state and audited transitions only.
