# Phase 7 D3 — retrieved sources to a saved cited report

2026-10-01 Windows source checkpoint after D2.2 `7a64592c`. No live provider,
search vendor, paid call, publication or installer acceptance is claimed.

Provider-planned public retrieval now enters the existing bounded review instead
of completing at “page retrieved.” Main assembles up to six source observations
from this task's actual source/browser artifacts, with URLs, retrieval times,
digests and bounded excerpts. Blocked/failed sources remain a separate list.
Source content is explicitly untrusted data. The provider returns a strict report
with source ids, not citation URLs or a filesystem destination. Main rejects
invented/foreign ids, credential-bearing/private URL shapes, excess output and
active links in prose; it escapes generated Markdown and inserts observed links.
Citation provenance is validated, not the semantic truth of every generated claim.

The report uses an ordinary Main-compiled `file.create` plan in the same objective,
agent boundary, workspace permissions, no-overwrite writer, checkpoints and audit.
Only a successful file artifact completes the save. Denial, failed saves, missing
file evidence and ungrounded completion prose remain incomplete. No request or
iteration ceiling was increased: the fixture needs one plan and one review call.
Direct deterministic page reads still avoid a paid synthesis call.

The existing result surface now shows readable source cards. Saved files have a
keyboard-accessible preview button. Only explicitly opted-in artifact Markdown
previews enable public citation buttons through the typed external-link route;
the shared BrowserLink/default Markdown behavior and local HTML viewer remain
unchanged. Unsafe links stay inert and failed opens show a localized error.

Evidence:

- Full regression: **3,145 passed, two inherited skips, 307 files**. All three
  typechecks, changed-file lint, communications replay/compare, fresh renderer/
  Main build and diff-aware task harness validation/dry-run passed.

- Focused Core/research/provider/preview checks cover strict parsing, bounded
  evidence, unavailable sources, fake citations, denied/missing report saves,
  inert default links, safe explicit opens and failure feedback.
- A production-Core workflow test runs the real public-source adapter with
  injected DNS/HTTP and real provider protocol parsing with fixture responses;
  real policy, filesystem creation and audit produce/read a Markdown file. An
  independent app command completes while source transport is intentionally held.
  App launching is a stub in that test, not a physical application claim.
- Four fresh Windows Electron journeys cover en/zh/ja/ru, reduced motion,
  1280x800/430x800, source cards, actual approved-file preview, keyboard access,
  external source/citation dispatch and no inline webview navigation. UI restored
  history is a fixture; filesystem preview uses a real file. Screenshots live in
  the host temporary directory `morpheus-d3-citation-evidence` and were inspected.
- The first source-link fixture mistakenly forwarded to Chrome; four owned
  isolated test Chrome processes were closed after exact command/profile checks.
  The corrected fixture intercepts the typed route. Owner browser/profile unchanged.

Remaining: live research quality/latency, search discovery, authenticated browser
sessions and exact packaged acceptance. Source retrieval failures are truthful;
the strict public reader is not a promise to access every site or paywall.
Next independent checkpoint: E2 pinned interactive client-site worker/preview.
