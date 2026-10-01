# Phase 7 E1 — static site revision source checkpoint

2026-10-01, Windows source build. No publication, installer or live-provider claim.

Main registers site.revise and site.rollback through existing workspace policy,
action execution, artifacts and audit. The planner receives only logical bounded
parameters and an observed SHA256 project revision. Fresh built-in profiles gain
these actions; existing narrowed profiles are not expanded.

A revision stages up to 16 changed text files in private app storage, runs the
unchanged static verifier, then checks the original project digest again before
mutation. Every affected original is recorded before replacement. A durable
journal supports interrupted-change reconciliation and exact-revision rollback;
later manual edits cause a conflict instead of being overwritten. Active content,
config scripts, traversal, symlinks and excess file/byte limits are rejected.

The simplified conversation workspace had dropped the original preview affordance.
It now shows useful file/site result cards and the existing isolated read-only
preview, without restoring a dashboard or execution-mode controls. Standalone
action artifacts and restored history remain accessible when no objective is
selected. Reports retain their existing result presentation.
The preview now has an accessible dialog title and skips the slide animation in
reduced-motion mode; native screenshots are taken only after it is inside the window.
Visual review then found the route-level HTML guest covered by the modal sheet.
The same Main-owned guest now portals into the modal anchor, preserving its focus
and accessibility boundary. Superseded navigation cannot report a false error.
The final journey verifies that the actual guest is topmost, not aria-hidden,
and has no error toast; the final native screenshot shows the revised content.

Evidence:

- Nine revision units passed, covering staging, conflict, active-content refusal,
  rollback, failed verification, restart reconciliation and manual-edit retention.
- Four fresh Electron journeys (en/zh/ja/ru, keyboard and reduced motion) invoke
  actual Main verification/revision, preview the real revised HTML, inspect its
  rendered content at 1024/390 CSS-pixel widths, roll back, and reject a stale edit.
- The pre-existing restored-site preview journey passed on the fresh build.
- Seven host units cover modal placement and superseded navigation; the final
  five Electron site journeys pass with screenshots in `test-results/e1-settled-preview/`.
- Three typechecks, lint and communication regression checks passed. Combined
  source-suite evidence is in MORPHEUS_PHASE7_ACCEPTANCE.md.

No paid model, owner profile or arbitrary generated code was used. The responsive
check proves this fixture, not all generated websites. Interactive templates and
authorized public deployment remain E2/E3; the static verifier is not loosened.
