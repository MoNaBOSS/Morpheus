# Phase 7 E3.1 — publication adapter boundary (not exposed yet)

2026-10-02 after profile continuity `3292c4e6`. **E3 is not complete.** No live
GitHub account, target, token or publication was used. This is the first tested
adapter checkpoint; durable approvals/receipts and application connection remain
E3.2, and no Publish button is being advertised from this foundation.

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

E3.2 continuation:

1. Main-owned protected GitHub connection; never reuse Codex/CLI credentials or
   assume the Morpheus application/design repository is a publication target.
2. Exact public-byte preview and short-lived explicit user approval, bound to
   account/repository/site/source revision/digest/current head. Recheck workspace
   and project before executing; no ambient workspace grant authorizes publication.
3. Durable write-ahead intent **before** advance, receipt/update/reconcile/rollback
   with crash and audit/disk-failure fixtures. An unknown outcome never blindly
   republishes. After restart, reconcile; do not replay the adapter's write.
4. Typed host routes and a minimal existing-artifact dialog, four localized labels,
   disabled/unconfigured guidance, real Electron acceptance with fake transport.
5. Only then mark E3 source integrated. Live target/HTTP and final package remain
   separate acceptance gates. F2 and G/H/I still follow.

Primary protocol references checked on 2026-10-02:

- [Git references](https://docs.github.com/en/rest/git/refs)
- [Git trees](https://docs.github.com/en/rest/git/trees)
- [Git commits](https://docs.github.com/en/rest/git/commits)
- [GitHub Pages API](https://docs.github.com/en/rest/pages/pages)

The implementation uses the documented 2026-03-10 API header; do not silently
switch to a hosting subscription or mutate Pages configuration in this adapter.
