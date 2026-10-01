# G2 runtime joins — ongoing, not live Premium

2026-10-02, after F2 `068dc9c2`.

## G2.1 planner

Main now supplies the existing managed runtime getter to the existing Core planner
selector. Direct/local and explicitly deterministic work stay local. Explicit
managed mode resolves before any BYOK account/key enumeration. BYOK's current
protocols, profiles, context and behavior are retained.

Managed and BYOK use one typed plan/review factory: same permitted capabilities,
untrusted observation treatment, source/citation review and strict JSON parser.
The managed adapter pins one objective and service generation, chooses a logical
planning/complex route and permits at most four calls / 12,288 reserved output
tokens / 48,000 prompt characters. Failed attempts count; no automatic personal
key or alternative-route fallback. The server owns actual models, rates and caps.

Started audit precedes dispatch; completion records real model/token counts,
request/objective correlation and receipt amounts/rate evidence. Failed or
cancelled unknown usage remains unknown. Receipts do not certify task success.
Logout/mode invalidation now aborts text/STT requests and prevents late session
resolution from dispatching; streamed speech also checks before dispatch.

**47 focused tests pass**, including the actual authenticated gateway/ledger/
provider-route implementation with injected provider responses, strict authority,
review, budgets, missing owner, audit failure and no-BYOK-fallback. Node typecheck
passes. All three typechecks, zero-error scoped lint, communications and diff-aware
harness validation/dry-run pass. Three fresh-build account regression journeys
pass in 10.7 seconds (missing configuration, fixture sign-in/out and cancellation).
These do not establish live or conversation/voice integration. No hosted account
or paid provider was used.

## G2.2 voice — 2026-10-02

The original Main voice service now resolves explicit managed mode before personal
accounts. No BYOK fallback, new microphone owner, alternate conversation log or
background paid poll was added. Existing voice settings remain on disk unchanged;
status projects the real service models/curated voices and entitlement. A shared
15-second metadata cache avoids repeated preflight round-trips; dispatch still
checks server allowance. Managed settings hide irrelevant personal-provider controls.

The existing renderer recorder locally decodes/resamples completed recordings into
mono PCM16 WAV. Main and server share canonical sample-based duration validation.
The existing speech owner streams bounded PCM24k through Web Audio, schedules split
samples contiguously and meters actual output. Streamed audio is not returned a
second time as a large buffered payload. Audio is not persisted. Receipt/model/
timing evidence shares request and speech IDs; missing cost remains unknown.

Account/mode invalidation aborts input/output, stops local wake, emits a Main-owned
authority revision and clears buffered renderer playback/capture. Late status and
decoder results cannot upload/submit. Ambient startup is single-flight and checked
against stop/settings/authority revisions. Stop now releases playback timers even
if a transport never settles; managed failure never switches to Windows robot voice.

Validation: **3,292 unit tests passed, two inherited skips, 318 files** (66.30s),
all three typechecks, scoped ESLint with zero warnings/errors, communications
replay/compare and a fresh build. Seven fresh Windows journeys passed in 32.1s:
four locales use actual Chromium recording/resampling/playback, Main voice owner,
managed client/bridge and authenticated gateway/ledger/provider routes with only
the upstream response and microphone source substituted; three account regressions.
No physical microphone, speakers or paid provider was used. Output was muted.
The actual test transcript appears without executing it, and account invalidation
stops pending synthesis. Page identity/content, no overlay, page/console errors,
reduced motion and 430x740 settings with sidebar collapsed were checked. English
desktop and Russian compact screenshots were inspected. The initial narrow test
with the advanced sidebar expanded overflowed; user-collapsed-sidebar behavior is
verified, **automatic settings/sidebar responsiveness remains an H-stage polish item**.
An existing WAV-envelope rejection test was updated to reject unsupported FLAC;
malformed WAV is now rejected at the Main/provider validation boundaries.

Evidence: `E:\Morpheus-builds\phase7-g22-evidence-20261002-0213`.
Logs: `E:\Morpheus-builds\phase7-scratch-20261002\g22-*.log`.
Source fixture success is not hardware voice taste, hosted identity/billing or
packaged acceptance. The old installer does not include these joins.

## Next exact work

G2.3: preserve the existing ACP conversation/
history owner when routing managed conversation. Do not create a parallel chat
history or pretend a planning endpoint replaces OpenClaw tools.
The pinned OpenClaw ACP adapter forwards `session/prompt` to Gateway `chat.send`;
session model changes go through `sessions.patch`. Its original runtime owns tools
and transcripts. The current managed text schema lacks tool calls/results. Extend
the bounded protocol and connect through that runtime, not by bypassing ACP and
writing assistant replies directly into a new store. Then G1 paid-path coverage,
H reliability/performance and I fresh Windows installer acceptance.

`runtimeReady` deliberately remains **false** until these remaining joins and
negative tests pass. G1 full paid-path coverage/economy qualification and G3/G4
deployed identity/trial/billing remain open. No final installer claim.
