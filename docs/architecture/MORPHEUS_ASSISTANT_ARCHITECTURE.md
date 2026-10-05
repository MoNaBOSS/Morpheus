> **2026-10-02 owner correction:** the single current
> [experience specification](../design/MORPHEUS_EXPERIENCE_REVIEW.md) and
> [completion checklist](../releases/WINDOWS_COMPLETION_CHECKLIST.md) govern the
> experience and A-E acceptance sequence. Preserve the ownership architecture
> below. Its 100-DIP sizing, first-run order, optional speech-provider setup and
> earlier visual approval wording are historical; standard voice must be included
> without a separate user voice API key, and the owner rejected preview.5.

# Morpheus assistant architecture — Phase 7

Decision date: 2026-09-30. Source inspected: `32badea9c792863cbc9248100025f18f83d26e00`
on `codex/morpheus-phase6-managed-layer`. This is the implementation contract for
the Astra-to-Sol handoff, **not a claim that the proposed components exist**.
Read with the [execution plan](../roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md) and
[acceptance gates](../releases/MORPHEUS_PHASE7_ACCEPTANCE.md).

## 1. Product decision and boundaries

Build one persistent Windows assistant, not another dashboard and not a new agent
framework. Keep Electron, React, OpenClaw, Objective Core, the capability registry,
profiles, providers, permission records, memory and existing workflows. Do not
rewrite the backend to obtain a different animation. Hermes remains an evaluation
candidate; NerdGPT/Unrestricted activation is deferred.

The approved experience remains: quiet bottom-right orb above the taskbar; an
upward composer; compact conversation when useful; explicit expansion into a
full conversation/results workspace. Keep the existing M and approved green orb.
Use the portable [experience design](../design/morpheus-experience/index.html)
as a visual reference, not as an executable runtime.

Everyday UI shows useful work, questions and results. No Ask/Auto/Act selector,
planning-stage timeline, trust-profile dashboard, provider picker or invented
percentage. Settings and advanced tools remain reachable from a small menu.
One intelligible acknowledgement is enough; real delay/failure must still be
communicated. Do not simulate instantaneous understanding or completion.

The initial delivery is Windows x64. Public Premium additionally requires the
managed-service gates; a BYOK build is not the completed managed product. Future
Mac/mobile/bootable work shares contracts, not assumptions about desktop access.

## 2. Observed gaps, not inferred completion

| Finding at the inspected source | Required response |
| --- | --- |
| `MorpheusQuickCommand.tsx` expands on ordinary conversation; `MorpheusOperatorNavigation.tsx` redirects it to `/chat` | Conversation must stay on its current surface. Separate submitting a turn from navigation. |
| `morpheus-operator.ts` has one overwritable pending conversation slot | Correlated turn admission/acknowledgement; never lose one request when another arrives. |
| Native `resources/morpheus-orb/` hover is a clickable preview | Implement a real editable upward composer with a narrow presentation bridge. |
| React and native orb have separate implementations; native receives state, not audio level | Share motion rules/assets; ephemeral level projection for actual capture/playback. |
| Windows wake helper recognizes the name; command transcription follows wake | Prove same-breath wake+command and real barge-in, including capture start/device latency. |
| Core plans use 22 registered actions; existing agent/chat capabilities are a separate route | Add a bounded worker adapter, not an ungoverned second execution engine. |
| `web-browser-api.ts` admits local HTML only; site verifier rejects scripts/forms/external resources | Add separate browser/research and interactive-site paths; preserve the safe static viewer. |
| Provider secret store writes `providerSecrets` and legacy `apiKeys` to electron-store | Protected, crash-safe migration across all consumers before distribution. |
| Managed identity/ledger exists but runtime model/voice routes and billing are not complete | Finish bounded paid-path coverage and live service acceptance separately. |
| Updater feed is null; Windows signature verification is disabled in builder config | Signed release/update acceptance is still a gate, not a source-build result. |

Current positive foundation: Main-owned task identity, bounded provider attempts,
resource coordination, conservative recovery, exact remembered scopes, usage
evidence, streamed TTS and opt-in local wake are present. Build on these.

## 3. Ownership: one assistant, multiple projections

```text
orb / upward composer / compact / full workspace / voice
                  | typed input + correlated turn id
                  v
Main assistant session + event projection
     |                          |
conversation adapter       Objective Core
(no hidden tool authority)      | policy + checkpoints + resource leases
     |                         +-- registered native actions
     |                         +-- bounded browser / research worker
     |                         +-- site build / verification / publish worker
     +-------------------------+
           real events, artifacts, usage receipts
                  |
        shared presentation + optional speech
```

Main remains the authority for execution, consent, provider disclosure, routing,
worker admission and task state. The assistant-session service coordinates existing
services; it does not own another planner, executor, permission database or copy
of OpenClaw history. Conversation-only replies need no fake Objective. If an agent
conversation wants tools, tool work must enter the explicit task/worker boundary.
Do not claim inherited unrestricted agent tools are already governed by Core.

### Session and event contract

Add platform-neutral contracts under `shared/morpheus/` and typed host methods in
the existing host registry. Recommended fields, not new runtime code yet:

- `conversationId`, `turnId`, `clientRequestId`, optional `objectiveRunId`,
  `workerRunId`, `speechId`; never use the displayed/selected task as implicit
  correlation for incoming events.
- Main issues or resolves identities; repeated identical submissions return the
  existing admission/result. A reused request id with different content fails.
- Ordered event envelope: `schemaVersion`, `sequence`, `generation`, timestamp,
  type and bounded typed payload. Reconnect obtains a snapshot plus cursor.
  Ignore duplicates and stale generations. Sequence gaps request resync.
- One conversation may link several independent objectives. “Cancel the research”
  resolves the named task; ask only if several candidates remain. “Stop talking”
  cancels that speech generation and queued playback, not the research.
- Bound queues and surface backpressure truthfully. Never replace an unconsumed
  turn silently. Cancellation invalidates pending generation before later output
  can publish a result or speak.
- Conversation history stays with its existing persistence owner. The projection
  keeps references and bounded recent display data, not a duplicate full history.

Draft authority must be explicit across windows: one Main-session draft projection
with revision checking and per-conversation selection, mirrored by renderer
stores. Preserve drafts across hover/dismiss/compact/full transitions. Persist
drafts only according to existing local retention policy, not to audit/telemetry;
never silently copy a draft to hosted memory. Maintain old session/provider ids
through migration. Existing OpenClaw Chat remains an advanced destination.

## 4. Presence state machine and motion contract

Treat these as orthogonal states, not one giant enum:

- Surface: `tray`, `orb`, `composer-preview`, `compact`, `full`.
- Attention: idle, listening, working, speaking, genuine question, recoverable error.
- Microphone: disabled, locally armed, addressed capture; not implied by visibility.
- User pin/focus, reduced motion, DND and application visibility are independent.

| Event | Required presentation |
| --- | --- |
| Returning/startup with setup complete | Quiet saved presence; no repeated onboarding or automatic full window. Startup/ambient settings remain opt-in. |
| Accepted wake | Orb only, local acknowledgement, no foreground focus theft. |
| Hover | Upward input preview, no focus. Moving from orb into panel must not collapse it. |
| Click/tap composer or explicit typing shortcut | Pin panel and focus the real input. IME/composition works; Enter cannot submit an unfinished IME composition. |
| Ordinary reply or submitted task | Stay compact. No automatic navigation to `/chat` or full workspace. |
| Genuine question unanswered | At 8 seconds after question playback ends, reveal compact clickable answers once; cancel timer on input. No options for bare wake or ignored social check-in. |
| Explicit expand | Full workspace with same conversation, selected task and draft; restore full-window geometry. |
| Escape/dismiss | Collapse presentation; keep draft and independent work. Explicit voice-stop and task-cancel stay distinct. |
| Task complete while user is working elsewhere | Quiet orb/result badge or queued notification; no unsolicited focus or forced panel. |
| Tray handoff | Short animation, live tray verified before hiding. Never implicitly enable mic/startup. |

Implementation choice for Sol: a lightweight local companion renderer entry, using
the same shared presentation components/tokens as the full app, in the existing
native presence lifecycle. Expose only presentation/snapshot/draft/submit/control
methods through a validated preload bridge. Validate sender/frame and schema in
Main; do not expose generic IPC, shell, URL execution, credentials or arbitrary
HTML. Retire preview-only custom-scheme signals as the real composer takes over.
Do not mount a second Gateway, task executor or audio capture owner in this window.
Keep the existing full renderer for current audio ownership until a tested audio
lifecycle change is justified by measurement.

Use display work-area geometry, never primary-screen dimensions or raw pixel
assumptions. Keep the orb's bottom-right anchor fixed while the panel grows upward
and left. Current 100-DIP orb, 20-DIP inset, 360-DIP hover width and 440x520 compact
are starting bounds, clamped on small screens; do not silently redesign scale.
Remember full-window bounds separately. Reconcile display removal, DPI changes,
auto-hidden taskbar and sleep/resume. Keyboard and touch must not depend on hover.

### Selected motion direction

Use **fluid aurora for active states plus a quiet breathing halo for idle**, derived
from motion-study B/A. This is the September 30 engineering selection for native
review, not a fabricated earlier user approval. Siri-like means responsive,
continuous motion; retain Morpheus's silhouette and green/teal identity, not an
Apple logo or copied asset. No whole-screen border effect by default.

- Idle: subtle slow halo; settled/static in low-power or reduced-motion mode.
- Listening: smooth small energy response from current mic RMS; no jitter/random
  fake waveform. Speaking responds to actual playback, not generation start.
- Working: restrained continuous drift without fabricated progress.
- Attention/error: small clear state cue with caption/icon, never color alone.
- Hover/compact transition: approximately 160–220 ms; state changes 120–180 ms.
  These are tunable defaults, not measured claims. Reduced motion uses an
  immediate state swap or short opacity change, no flowing rain or pulsing scale.
- Reuse one local artwork/motion recipe. Prefer compositor-friendly transforms
  and opacity; avoid whole-window blur, large animated SVG filters or multiple
  continuously running canvases. Pause invisible rain/orb render loops.
- Level updates: bounded 20 Hz maximum across process boundaries, scalar only,
  no audio/transcripts; interpolate locally without high-frequency React renders.

Visual acceptance includes native screenshots AND short recordings on the target
machine. A browser prototype or a pretty still cannot pass voice/focus/motion.

## 5. Voice and personality

Retain the current voice service/provider adapters; do not build a new speech
vendor backend. Keep a VoiceEngine contract for detection, addressed capture, VAD,
transcription and speech so an engine can change without changing UX or authority.

Local wake remains opt-in and local; no silent cloud-monitor fallback. The October
4 correction replaces independent default-device capture with selected Chromium
PCM, resampled to mono 16 kHz by a fixed AudioWorklet. Main accepts bounded,
sequenced 200 ms frames under a fresh session token; only acquired audio and a
ready helper permit armed state. System.Speech supplies an addressed sample range,
never executable dictation. Included Whisper verifies the original audio and exact
wake prefix before routing once. A volatile rolling buffer holds at most 21.5
seconds (one bounded 20-second utterance plus context/recognition delay), replacing
the initial 1.5-second pre-roll proposal. Unaddressed audio is never written or
uploaded; addressed audio uses existing guarded temporary WAV cleanup. Keep 300 ms
of available context around the range so recognition does not clip the name.
Clear on mute, lock and session end; foreground chat/Settings suspend automatic
input. Generated PCM/native tests do not prove physical mic, echo or accent quality.

STT currently receives completed recordings. Add streaming only through an adapter
whose actual protocol/price/behavior is verified. Partial transcripts are display
only; dispatch the final utterance once. Preserve buffered STT if streaming fails
without retranscribing/spending twice. A streaming label alone is not speed.

Keep the shared follow-up constants (already unified), Main-bounded session turns,
generation checks, manual stop, no-speech cancellation, streamed TTS sequencing
and truthful fallback identity. Stop playback immediately on barge-in, abort
pending TTS, then admit one addressed user turn. Avoid echo-triggered self-wake;
test speakers as well as headphones. Microphone disabled means no capture, not
just a muted animation. Never call a OS fallback voice the selected neural voice.

Personality is one versioned, bounded instruction/context composer, not a separate
expensive “personality model.” Apply it consistently to conversation and spoken
summaries; keep planner schemas and tool instructions free of forced jokes.
Persist chosen name, voice, humor (Gentle/Cheeky/Unfiltered), proactivity
(Quiet/Balanced/Talkative), explicit dislikes and recent greeting/check-in state.
Do not override existing preferences during migration. No second model pass just
to add a joke. Natural humor, relevant film/anime references and warmth are allowed;
drop jokes in serious tasks or after negative feedback. No mood surveillance.

First launch is after installation: name/skip → Matrix welcome → useful work and
optional interests → natural voice auditions (greeting, joke, task update) → small
real trial or truthful provider setup. A prepared example is identified as such.
Account is optional for BYOK; do not promise a hosted trial until it works. Missing
voice credentials yield setup/typing, not a paid call or robotic voice disguised
as a preview. A voice choice remains subject to a human listening acceptance.

Prefer one compatible provider account for reasoning/STT/TTS when its actual
capabilities permit; never demand two keys as a blanket onboarding requirement.
Allow separate voice configuration only when needed, under advanced settings.
Everyday settings group voice, companion preferences, and account/usage; expert
tools remain accessible without turning setup into a technical checklist.

Quick restart is not a first greeting. Persist last meaningful interaction and
daily greeting state; midnight during an active session does not cause a new
greeting. Check-ins follow local availability, cooldown, ignored responses and
DND; no model polling for social opportunities. OS busy detection is best effort
with manual quiet control, not a claim to know every call/game/emotion.

Memory is local, inspectable/correctable/exportable/deletable. Add bounded automatic
preference extraction only when evidence is useful; distinguish explicit facts,
inferences and rejected suggestions. Do not turn all transcript history into
relationship memory or delete existing chat history. Selected-memory sync remains
later; cross-device Git source continuity is not user-profile sync.

## 6. Bounded worker integration

Extend Core through one `WorkerAdapter` boundary outside the deterministic action
runtime. Start with the bundled OpenClaw/browser facilities; do not introduce
Hermes or a second framework by default. Current sequential steps inside a plan
remain valid; independent objectives retain resource coordination.

Main resolves a typed worker request containing objective/attempt ids, kind,
canonical workspace/project, exact capabilities/service/origin scopes, deadline,
step/token/cost limits, cancellation generation and provider-route reference.
Renderer/provider content cannot supply executable argv, environment or grants.
Workers emit bounded progress, source observations, artifact references, usage and
terminal outcomes. Main validates them, verifies output existence/content as
appropriate, records checkpoints/audit, then projects UI events.

Represent worker operations as explicit, compiled-in typed capability descriptors
with narrow parameters, risk and resource scopes; never a generic `run anything`
capability. The plan executor delegates through an injected worker port wired in
Main composition. The worker port returns typed results into the existing plan
observation/artifact path. Native runtime modules still import no Gateway/provider
implementation. Provider planners see only supported registered descriptors.

No success from prose alone. Require machine-observed evidence: opened target,
retrieved page, verified file digest/build result or publication receipt. Preserve
unknown effect/usage explicitly. Restart reconciles before retrying side effects.
Bound all tool output; redact credentials. Page/repository instructions are data,
never new user authority. Cancellation stops the owned worker/process tree and
pending provider requests without interrupting other tasks.

Initial scheduling keeps existing ceilings (32 admitted, 4 planning, 4 disjoint
native plans) but allows only **one heavy browser/build worker concurrently**
until target-PC measurements justify more. Direct app commands must not wait for
the heavy-worker semaphore. Browser session/project/file leases are separate from
foreground desktop leases; do not hold the desktop throughout network research.

Inspect the existing 10-runs/minute rate limit when testing bursts. Keep bounded
abuse admission, but separate local controls/navigation from paid-work quotas so
stopping speech or opening an app cannot be blocked behind model traffic. Record
throttled attempts distinctly; don't exclude them to make latency look better.

Long-running heavy computation belongs outside Main. Electron utility processes
are a possible host for trusted app-owned worker code, not an OS sandbox for
generated code. Verify packaging and shutdown against the repository's pinned
Electron version. [Electron 41 utility-process API](https://github.com/electron/electron/blob/v41.10.3/docs/api/utility-process.md).

### Browser and cited research

Keep ordinary `web.openUrl` local and immediate. For interaction/research, use a
task-owned browser session with no imported personal cookies by default. Login is
explicit and tied to an approved account/site; never bypass CAPTCHA, MFA or UAC.
If an existing browser session is intentionally connected, describe its scope and
keep account-bound writes separate from public browsing. Revalidate redirects,
downloads, popups and final URLs. Block unintended localhost/private-network/file
and custom-scheme access from remote content; user-authorized local preview is a
separate capability. Do not change the local HTML preview into a general browser.

Search discovery is not a citation. Store bounded source observations: original
and final URL, title, retrieval time, retrieved excerpt/location and optional
content digest. Generated claims link to the source actually read. Answer citations
must resolve; paywalls/blocked pages are reported, not fabricated. Render source
links through an explicit safe external-link action, without reopening forbidden
navigation in local HTML previews. Save a report artifact with those references.

Do not retain URL passwords, access tokens or signed-query credentials in source
metadata/diagnostics. Keep private source content inside its approved local task
scope; public citation/report exports must not disclose it unintentionally.

### Website creation, revision and publication

Use two explicit paths. The existing restricted static-site capability stays
safe and useful. A separate interactive-site worker supports reviewed templates,
scripted functionality and tested responsive previews without loosening the
static verifier.

Baseline interactive delivery: pinned app-owned client-side templates/build steps,
no arbitrary dependency installation or unreviewed lifecycle scripts; isolated
preview origin/session, no Morpheus preload/Node/credentials, network/device access
denied unless explicitly scoped. Generated files are untrusted. Main canonicalizes
paths, rejects traversal/symlink escapes, imposes file/size/time limits and keeps
builds away from user secrets. A separate working directory or Node child process
alone is **not** an OS sandbox. Arbitrary Node/server code requires a genuinely
isolated execution backend before being offered; if unavailable, disclose the
supported client-side scope rather than claim full-stack support.

Build configuration/plugins are app-owned, outside generated content. Disable
project config auto-discovery and lifecycle hooks; generated Vite/PostCSS/loader
configuration or package metadata must not become executable build configuration.
Test a malicious config fixture before calling a template worker constrained.

Revision is an explicit patch against a verified project revision/hash, with a
recoverable snapshot and conflict detection. Preserve unrelated user edits. Keep
destructive/overwrite policy; an old workspace grant must not silently authorize
replacing new content. Preview/test widths, keyboard operation, real interactions,
console errors and navigation before declaring verified.

Publication is a separate `PublishAdapter` (prepare, confirm target/change, publish,
query receipt, rollback when supported). Implement the already available GitHub
Pages path first for supported static builds; don't silently invent a hosting
subscription. Authenticate through existing approved credentials, never prompt
for secrets in chat. Bind approval to exact account/repository/site/revision and
public data. Do not publish secrets, private source or non-static code. A returned
URL is not success: verify the deployed revision/content over HTTP, retain the
deployment id and previous version, reconcile timeout before retry. Custom domains
or new paid hosts require their own actual setup/authority.

Remote/generated preview content must not receive privileged Electron APIs;
keep context isolation, sandboxing, restrictive navigation/permissions and sender
validation. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## 7. Local secrets, costs and managed service

Keep the `SecretStore` interface; migrate its implementation to OS-protected
storage and stop legacy plaintext writes. Inventory every consumer and generated
OpenClaw/plugin configuration before claiming completion. Steps: read/validate
legacy records → encrypt into a versioned destination → atomic write → decrypt
and compare in memory → mark committed → remove only migrated legacy fields.
Crash/restart at every stage must recover without loss or double migration.
Never print/commit keys, plaintext backups or raw configs. If protection/decryption
fails, preserve original data, fail the affected provider operation with a recovery
message and leave typing/local work usable. Do not silently fall back to plaintext.

Upgrade/rollback fixtures use synthetic secrets or OS-protected backup envelopes,
not new plaintext copies of the owner's profile. Downgrades must respect a minimum
readable schema; never restore legacy plaintext merely to run an old binary.

Use the API of pinned Electron 41, not an unreviewed latest-version upgrade. Its
Windows storage uses DPAPI; it does not protect against another app running as
the same user. No “bulletproof” or portable cross-device-encryption claim.
[Version-matched safeStorage documentation](https://github.com/electron/electron/blob/v41.10.3/docs/api/safe-storage.md).

Keep authoritative configuration in Main, secrets out of renderers/workers/model
context. Where an upstream runtime genuinely requires secret materialization,
prefer an app-owned credential broker; otherwise document the minimum protected
runtime-file lifetime/ACL/cleanup and migration limit. Do not certify encrypted
storage while leaving permanent plaintext copies elsewhere. A profile copied to
a different OS/user must request reconnection, not destroy undecryptable records.

Direct local requests cost zero planning tokens. Deterministic dispatch chooses a
capable economy route for suitable tasks, not a model call to select a model.
Keep one owner route per task; escalate with a bounded handoff of goals, verified
facts/artifacts, constraints and remaining budget. No repeated full transcript
or silent billing-account switch. Pin model/rate/version per attempt; qualify
quality and latency on matched task sets before changing defaults.

All paid paths need a task/turn/speech correlation and accounting: Core, ordinary
conversation, workers, tools/search/images, STT, TTS, cron/background and retries.
Reserve before dispatch where the service controls spend; unknown usage stays
held for reconciliation. Never display unknown cost as zero. BYOK hard currency
caps can only be promised for routes with enforceable maxima; otherwise use
bounded request/token limits and clearly labeled estimates. No paid idle polling.

Basic/BYOK remains available without a hosted account. Premium shares this same
runtime with server-owned identity, routes, allowances and receipts. Complete
Phase 6 carry-over: real issuer/Google-email login, managed inference and voice,
trial eligibility, renewal/top-up/refund/revocation, account deletion, abuse/spend
controls, backup/restore and payment webhooks. Single-host SQLite remains adequate
for a bounded pilot; migrate transactional invariants before multi-host scaling.
Never turn unfinished billing into a fake successful purchase. NerdGPT is later.

## 8. Evolution without a rewrite

Add versioned contracts/adapters only where a real Phase 7 flow needs them. Keep
current JSON stores and managed ledger until a measured requirement warrants a
storage migration. Maintain migrations, rollback compatibility and old-profile
fixtures. No microservice fleet, new event bus or native-shell rewrite now.

Future capabilities describe support, scope, cancellation, observation and side
effects through the registry. Add macOS/Android/bootable device adapters separately;
unsupported permissions remain typed outcomes. Remote companions require explicit
device pairing, authentication, revocation and per-device grants, not exposed
local host IPC. Managed entitlement affects service access, not OS authority.

Measure startup, input-to-feedback, dispatch, audio, worker load, memory and idle
CPU with privacy-safe timers. Main must remain responsive during builds, network
failures and large artifact inspection. Use bounded streaming/event batching,
lazy-load advanced pages, virtualize long histories and release transient audio,
DOM snapshots and inactive browser resources. The exact targets and final
completion boundary are in the acceptance document, not adjectives in the UI.
# October 5 optional hosted speech component

The existing task planner/Core, ACP conversation and provider accounts remain
the reasoning/execution owners. `deepgram-connection.ts` saves a separate
protected voice credential through SecretStore and safe metadata; it cannot
select a task model or unmute. `deepgram-voice.ts` owns fixed service endpoints,
transient recognition/speech and sanitized failures. Voice Main admits sequenced
selected-microphone PCM, natural finals and one result consumer. Existing
AudioWorklet/meter/playback drive real audio feedback; provider partials never
dispatch. Local wake remains consented and Main verifies original addressed
audio using the selected recognizer. Key/model/mute changes cancel old work.
This optional connection is not the hosted entitlement or an all-user funded key.
Evidence and unresolved acceptance live in the single experience specification
and Windows checklist; the historical architecture below remains preserved.
