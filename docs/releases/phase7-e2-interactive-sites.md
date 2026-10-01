# Phase 7 E2 — pinned interactive client websites

2026-10-02 Windows source checkpoint after D3 `2ce98f5e`. This is a bounded
client-site capability, not arbitrary full-stack development or publication.

`site.createInteractive` runs through the existing Core planner, workspace write
policy, resource leases and audit. It accepts a bounded data-only `studio-v1`
specification and creates six actual project files without overwriting a folder.
The small deterministic compiler uses app-owned HTML/CSS/JS; it never loads a
project configuration, dependencies, package hooks or generated executable code.
There is no build subprocess to grant shell authority to. Invalid data, interrupted
writes and verification failures retain files rather than silently replacing them.
A creation marker identifies interrupted output; retries require a new folder.

The template has working category filters, keyboard-accessible FAQ disclosures
and local brief validation (including whitespace-only input). The UI explicitly
says the brief is not sent. No server, analytics, payment handling or form-delivery
service is implied. Content changes can create a new folder/revision, preserving
the previous project; in-place interactive revision/rollback is not implemented.
Static site verification/revision/rollback remains unchanged and separate.

Preview re-resolves an enabled, available Main-registered workspace, checks the
exact revision, bounded UTF-8 files, inventory and pinned content, and audits before
opening. The guest serves only three verified memory assets at a virtual HTTPS
origin. It has no preload, Node, host API, personal session, devices, external
network, downloads, popups, frames or workers. CSP and a rejecting fallback proxy
also block loopback/non-HTTPS bypass. Only one controller-owned preview is active;
concurrent opens are rejected and close/expiry releases its session. Later disk
edits cannot alter the memory snapshot. This does not loosen the local HTML viewer.

Artifacts carry their interactive type and revision through real execution and
privacy-safe audit restoration. The existing result preview button dispatches the
typed host route; changed projects show a localized error while preserving files.
The bottom-right companion, explicit expansion and existing engines are unchanged.
Only new starter profiles gain this capability here; existing customized profiles
are not expanded or reset. Untouched historical starter upgrade is a separate
continuity check before final packaging.

Evidence and limits:

- Unit fixtures cover schema bounds/escaping, maximum escaped content, actual
  files/digests, no overwrite, partial creation, cancellation, links, oversized
  files, injected package scripts, stale revisions and strict memory transport.
- Real Core + provider protocol fixture produces the actual site with one fixture
  model request and normal permissions/audit. Preview authority tests cover unknown
  roots, extra fields, stale/manual changes, concurrent opens and audit failure.
- Five fresh Electron journeys: real Chromium filters/FAQ/form, desktop/narrow
  layouts, reduced motion, no host privileges/network; en/zh/ja/ru app creation,
  keyboard preview, real audit restoration after reload and changed-file rejection.
  Four existing static revision/preview/rollback journeys are regression gates.
- Full suite: 3,174 passed, two inherited skips, 309 files. All typechecks,
  changed-file lint (one inherited warning), build, communications and diff-aware
  harness validation/dry-run passed. The combined Electron run had one older
  static-preview mount timeout, then its exact isolated recheck passed; retain as
  a packaging watchpoint. The final five interactive journeys passed again with
  retained screenshots at `E:\Morpheus-builds\phase7-e2-evidence-20261002-0010`.
  Desktop and compact output were visually inspected. The existing installer
  has NOT been rebuilt for this source yet.
- No paid model, live publication or personal profile was used. The fixed template
  is English content/layout; Morpheus controls/errors are localized in four languages.
  Broader templates, server-backed forms and arbitrary app builds are not claimed.

Next: E3 exact-target authorized publication, then F2/G/H/I. Preserve this source
checkpoint instead of repeating the D3/E2 discovery or testing the old installer.
