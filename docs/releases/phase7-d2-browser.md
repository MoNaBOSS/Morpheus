# Phase 7 D2.1 — public Chromium boundary

2026-10-01 Windows source checkpoint after `f0f2b11c`. **Not yet a registered
Core capability, full D2 completion, packaged or live-site acceptance.**

The existing bundled Electron 41 Chromium runs a hidden temporary task session,
without focus theft, personal cookies, Node, preload, plugins or device permissions.
Main supplies the exact HTTPS origin and lifetime. HTTPS uses a session-specific
protocol handler backed by the D1 validated/pinned Node TLS transport. Other
network paths use an owned rejecting proxy with loopback bypass removed;
non-proxied WebRTC UDP is disabled. No DIRECT fallback or TLS bypass exists.

Public requests are GET-only, with no browser cookies/auth headers forwarded and
no Set-Cookie/auth/refresh response authority. Private/mixed DNS, unapproved
origins, credential-bearing query keys, downloads and unsupported content types
are rejected. Response CSP intersects site CSP; frames/workers/media/device and
cross-site resources stay blocked. Limits: 128 requests, 2 MiB per response,
8 MiB total including in-flight reservations, 24 operations and two minutes.

Fixed isolated-world routines return bounded observed text and up to 100 controls.
Main-created revisions and actual node fingerprints bind click/fill/select/press;
stale/changed/covered controls fail. Typed keyboard events target only that guest.
No model-supplied JavaScript, selectors, executable paths or browser partition.
Cancellation, expiry, failed startup and renderer failure close owned resources.

Evidence:

- 19 focused network units: DNS revalidation, redirect scope, credentials/header
  stripping, method/content/byte/request limits and cancellation.
- Two actual Windows Electron/Chromium journeys: real DOM fill/click/select and
  Enter navigation, changed/stale controls, restricted links/downloads, blocked
  write/private/cross-origin attempts, absent privileged APIs/cookies, hidden
  task window, proxy/UDP policy, cancellation and cleanup after denied DNS,
  redirects and stalled DNS/transport deadlines. Companion stays available.
- All three typechecks and changed-file lint passed. Most network responses are
  injected deterministic fixtures; this is real Chromium, not live website proof.
- Communications replay/compare and diff-aware harness validation/dry-run passed.
- Implementation follows the version-matched
  [Electron session protocol API](https://github.com/electron/electron/blob/v41.10.3/docs/api/protocol.md).

Next: integrate through the existing worker/plan permission, audit, scheduling and
observation path; add explicit account-session authorization before authenticated
operations. Current strict public-origin policy will not support every website.
Do not claim arbitrary browser automation or relax the local HTML artifact viewer.
