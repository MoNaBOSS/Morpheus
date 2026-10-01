# Phase 7 E3 — explicit publication and durable recovery (source fixtures)

2026-10-02 after profile continuity `3292c4e6` and adapter `e4e3827b`.
E3 is integrated in source; **live and packaged acceptance remain open**. No real
GitHub account, target, token or publication was used during development checks.
The existing interactive-site result opens a compact public-file review dialog,
not a dashboard. Static E1 sites and existing projects are not auto-published.

Main constructs a public snapshot from the disk-verified E2 template, retaining
only index.html, styles.css, app.js and a public digest marker. Project metadata,
README and unrelated workspace files are excluded. Before use, the snapshot is
recompiled from bounded content and exact digests are checked. Obvious credential
shapes are rejected locally; this is not a guarantee that sensitive prose can be
detected. Explicit exact-content confirmation is still required.

The GitHub adapter is scoped to an existing public repository, a dedicated
`gh-pages` branch already configured as the Pages root, no custom domain/workflow,
and one `sites/<slug>` directory. Account/repository numeric ids, Pages URL, current
head and directory bytes are observed before approval and checked again before
writing. A prior directory is accepted only if its files equal the recorded
previous snapshot; unrelated/manual files are not replaced. Trees use the prior
root as their base, preserving unrelated paths. Commits retain the previous head
as parent and branch updates always use `force:false`.

An adapter-created commit can be advanced once for its exact prepared target.
Lost responses require read-only head reconciliation (`applied`, `not-applied`,
`conflict`), not automatic replay. Rollback can create a new child commit containing
the previous verified snapshot, without resetting history. A branch commit is not
accepted as a live website: HTTP verification compares every file's actual bytes
and MIME type over public DNS-pinned, credential-free, redirect-free retrieval.
API access is fixed to api.github.com, forbids redirects, bounds requests/body/
response/deadline, and excludes raw credential-bearing exceptions from diagnostics.

Evidence: 21 adapter/snapshot/HTTP/transport tests and 35 adjacent template/Core/
profile tests pass (56 total). Node typecheck and scoped lint pass. The API is
fixture-injected and HTTP uses injected public addresses/bytes. No claim of live
GitHub deployment, actual service latency or end-user authorization is made.

E3.2 joins:

- Main owns one connection in a separate protected credential namespace, reusing
  the B1 vault protocol with no legacy/AI-provider/CLI/environment fallback. The
  password input clears on submission and never enters chat or receipt data.
- Five-minute one-use approval binds account/repository/site, all four public
  files and their bytes/digests, source revision, workspace and remote head. Main
  checks the source and workspace again; local permission is not publication consent.
- A bounded dedicated journal flushes exact content/previous-version intent before
  remote object creation and the exact commit before branch advancement. Corrupt
  records fail closed and remain intact. Audit/disk failure prevents writes when
  still avoidable. A lost post-write save leaves recoverable publishing intent.
- Startup never retries or polls. Explicit Check inspects the remote and verifies
  every public byte. Unknown responses are reconciled read-only. Unrelated branch
  commits do not trap the user if the exact owned site remains unchanged. Changed
  remote files are never overwritten; a different destination can be connected
  after the conflict has been observed. Rollback is a newly approved child commit,
  not a history reset or local-file rollback.
- The four-locale dialog exposes setup only on demand, exact plain-text file
  inspection, an unchecked confirmation, receipt/check and previous-version review.
  It uses an opaque responsive modal with neutral high-contrast controls; the
  Matrix companion behind it is unchanged. Closing does not cancel an already
  approved remote operation. No server/form delivery or arbitrary site publisher.

Validation:

- Full suite: **3,217 passed, two inherited skips, 311 files** (65.83s),
  `%TEMP%\morpheus-e32-full-unit.log`. Includes 21 adapter and 17 owner/journal
  tests plus exact host-surface and adjacent regressions. Corrupt journal, disk
  failure before/after effects, audit failure, expiry, replay, manual changes,
  disconnect, concurrency, protected-storage failure and rollback are exercised.
- All three typechecks, changed-file lint, build, communications replay/compare
  and diff-aware E3 harness validation/dry-run pass.
- Four native Electron locale journeys use the actual built host routes, owner,
  Windows protection/vault, journal, GitHub adapter and HTTP digest verifier.
  Only API/DNS/HTTP bytes are injected in the isolated test process. English also
  closes/relaunches the app after an applied lost response, then checks without a
  second write, and exercises update/reviewed rollback. No production fake mode.
- Desktop and 430px/reduced-motion screenshots inspected. The first screenshot
  pass exposed a transparent panel and an unscoped accent variable; both were
  corrected, with opaque-surface assertions added. Test selector initially matched
  the release marker's embedded index.html name and was narrowed to its summary.
- Retained native evidence: `E:\Morpheus-builds\phase7-e3-evidence-20261002-0056`;
  logs `%TEMP%\morpheus-e32-e2e-final.log` and `morpheus-e32-build-final.log`.

Next: F2 typed window/media controls, then G/H/I and a fresh EXE built on E:.
Live publication still needs a user-approved dedicated Pages repository and token
entered in the app. Never choose the Morpheus application/design repository as
that target implicitly. No live publication or final installer claim is made.

Primary protocol references checked on 2026-10-02:

- [Git references](https://docs.github.com/en/rest/git/refs)
- [Git trees](https://docs.github.com/en/rest/git/trees)
- [Git commits](https://docs.github.com/en/rest/git/commits)
- [GitHub Pages API](https://docs.github.com/en/rest/pages/pages)

The implementation uses the documented 2026-03-10 API header; do not silently
switch to a hosting subscription or mutate Pages configuration in this adapter.
