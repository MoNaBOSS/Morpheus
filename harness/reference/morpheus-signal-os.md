# Morpheus Signal OS Reference

Canonical product design: `docs/design/MORPHEUS_SIGNAL_OS.md`.

The Signal OS redesign changes projection and interaction hierarchy, not
execution authority. Durable invariants:

1. Presence, Mission, Command and Chat project one Objective Core.
2. The Morpheus Signal reflects real state and never invents progress.
3. Voice, Quick Command and Command Center submit objectives through typed
   host-invoke APIs; they do not execute capabilities in Renderer.
4. Trust remains plan-level, exact-scope and Main-owned.
5. Chat stays functional but is a secondary product surface.
6. Existing routes remain reachable even when primary navigation is simplified.
7. A fresh-profile packaged journey is the product acceptance boundary.
