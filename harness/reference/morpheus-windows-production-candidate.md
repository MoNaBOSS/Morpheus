# Morpheus Windows Production Candidate Reference

Canonical product contract:
`docs/product/MORPHEUS_OPERATOR_CONTRACT.md`.

Canonical architecture:
`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md` and
`docs/architecture/MORPHEUS_OPERATOR_PRIVATE_ALPHA_ARCHITECTURE.md`.

Durable invariants:

1. Every actionable surface enters one Main-owned Objective Core.
2. Known deterministic objectives do not wait for a provider.
3. Provider output is an untrusted proposal and never receives operating-system
   authority.
4. Planning, execution, and optional review have separate safe timings and
   bounded cancellation.
5. Review is retained when semantic evaluation is required and omitted when a
   conclusive result makes another provider round trip redundant.
6. Voice audio and raw transcripts remain ephemeral regardless of latency work.
7. Routine work inside exact trust remains interruption-light; critical
   boundaries remain unwaivable.
8. Updates remain inert until a Morpheus endpoint, signature verification, and
   authorized release process exist together.
9. OpenClaw Chat and Gateway remain operational but do not own native execution.
10. Contracts, placeholder diagnostics, mocked providers, and synthetic progress
    do not count as production behavior.
