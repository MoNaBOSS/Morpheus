# Morpheus experience specification

Updated 2026-10-03, Asia/Dhaka. **Approved design; implementation authorized. The owner
has rejected the preview.7 UI/UX as well as the earlier preview.5 experience.**
The owner subsequently approved the recommended direction: Floating companion
by default, opening into the Conversation card, with temporary editable voice
captions. They requested a more animated opening page and visibly animated existing
M logo. This advances the connected motion study; it does not accept the rejected
application or qualify live voice. Computer control stopped when the owner pressed Escape.
The owner then accepted the connected study ("It's great") and requested the final
production application, connected settings, and major voice/animation improvements.
This supersedes the design-only hold. Implement without another design restart;
qualify the actual Windows package, and retain explicit hardware/service evidence limits.
This is the single current experience specification, reconciled from the existing
design review and the owner's October 2 correction. The single current execution
checklist is [WINDOWS_COMPLETION_CHECKLIST.md](../releases/WINDOWS_COMPLETION_CHECKLIST.md).
Historical plans, prototypes and automated results remain evidence, not approval.
## Preview.8 integration — current source, qualification in progress

The approved design is implemented through the original runtime owners. The exact
M logo animates on arrival; the 56-DIP orb uses smooth contours and actual RMS.
Compact/full share conversation, draft and tasks. Settings preserve their origin,
including Voice repair and Advanced return. Caption visibility is a persisted UI
preference only; it never changes microphone consent. Personality exposes existing
proactivity/quiet controls. Manual typing cancels capture/output before editing.
Main now accepts fixed cursor-based drag and keyboard placement actions, saves
bounded relative display placement, and opens the conversation inward. No arbitrary
renderer coordinates or additional execution authority enter that bridge.
Live voice-origin ACP replies correlate their original admitted turn and live
completion, then speak once through the existing queue. Restored/typed replies stay
silent. The pinned local Kokoro worker reuses a bounded native process, starts only
for addressed speech, unloads after 60 seconds idle, and dies on cancellation/quit.
A local-only 450 ms initial PCM buffer reduces phrase gaps; short completed answers
flush immediately. Physical acoustic barge-in is **not implemented/qualified**:
manual microphone, typed input and Stop interrupt; capture while speakers play
remains suppressed until a real echo-safe design is tested.

The following baseline findings explain the rejected build and are historical;
they do not describe the completed source changes above or qualify their package.

## Preserved preview.7 baseline

The delivered implementation baseline was **1.2.0-preview.7**, application source
`757f71c5f7e98d560624657a12875dba4330c7ac`. Actual normal packaged startup, held
active-reply reload with exactly one inference, full restart, original tagged-persona
history, canonical task/chat chronology, visible latest compact reply, draft and
contextual settings passed. The model reply is a bounded loopback fixture; original
Gateway/ACP/Core/history and native controllers are real. No new conversation owner.
Main owns admission settlement and retained authority; it does not replay every
missed live stream chunk or automatically approve an unanswered permission.

Real generated English speech -> Main STT -> Core execution -> original renderer
playback passed. All 137,640 declared PCM bytes were received, scheduled and
naturally ended; typed Stop interrupted another reply in 82 ms. This tests generated
input, not physical recording-owner dispatch, microphone, wake or speaker audibility.
October 3 source audit confirms a missing product connection: voice-origin ACP
conversation can receive a text answer, but automatic speech watches Core objective
summaries/clarification only. Ordinary ACP replies and their spoken follow-up are
not connected. The successful Core command test does not qualify general voice chat.
Included synthesis starts a fresh offline engine for each phrase, then emits the
finished phrase's PCM; it is not continuous synthesis from incoming model tokens.
Motion preserves static artwork with CSS light/halo movement. Quiet motion updates
five times per second and audio drives a modest halo scale/opacity, not organic
artwork deformation. These are implementation limits, not proof of the owner's
current microphone/device failure. Standalone voice samples join actual PCM without
live generation gaps; the orb review clip enlarges 56 DIP sixfold. Neither proves
ordinary desktop conversational fluency.
Actual muted native motion and continuous-interface recordings are 16/20 seconds;
simulation, hidden padding and isolated Main restoration boundaries are labelled.
Scope-specific installed Windows install/reinstall/uninstall passed on a disposable
runner; the CI EXE differs from the statically verified local delivery EXE.

The local EXE is 480,418,659 bytes, SHA256
`19a0bafe7e9c8d1792876d127dc05d63962142938464fddcd6b72b0fa70a82e2`.
Archive integrity, all 40,896 paths/sizes and 44 selected hashes match qualification.
It is unsigned. **Commercial launch is not qualified**: signing/update, hosted
operations/funding and payment setup are absent; NerdGPT is deferred. Physical
hardware/owner upgrade/live paid-provider/publication and long-session gates remain
open. Fresh Gateway startup was 62.827 s; returning window/Gateway 2.756/7.679 s.
Local CPU speech can leave generation gaps; no low-power latency/quality promise.

Rejected candidates remain evidence: `5b93a145` duplicate reload dispatch,
`23d7bae9` truncated playback and `24945c32` restart chronology/viewport failure.
Their EXEs/payloads/logs are preserved under the corresponding rejected/pre-scroll
directories in `E:\Morpheus-builds\experience-preview6\evidence`. The correction
uses original settled start times from the existing bounded transcript supplement;
invalid, reversed or ambiguous dates remain unknown. Only deliberate reading
gestures suspend following, and native regression measures the clipped viewport.
Preview.6 results below are a preserved baseline; the current checklist records
the final candidate and exact evidence boundaries.
No meaning is inferred from standalone historical A/B/C/D answers whose questions
are unavailable. The original design review is recoverable in Git at `4a9f25e9`.

## Product and preservation contract

**Approved direction: a movable floating companion and connected conversation card.**
Default to a small companion on the desktop; open a compact conversation when
needed and expand for substantive work. Remove the continuous Matrix-rain wallpaper
from ordinary conversation. Use near-black solid surfaces, restrained emerald light,
comfortable readable type and spacing governed by content. Reserve the brief Matrix
arrival for introduction. Keep the existing M and green/black identity.

The owner's current screenshot rejects the oversized empty conversation, static
greeting, stretched composer and decorative background. Live October 3 inspection
confirmed the installed per-user preview.7 EXE and app.asar match the delivered
payload. The merged old text visible in history needs investigation; its root cause
has not been reproduced. Do not clear or rewrite owner history to hide it.

Default companion character: capable, warm, quietly witty. Ordinary status must
describe the user's activity only when useful. Do not show "thinking", "planning",
model names, or internal reasoning in the normal experience. Longer work still needs
honest progress, cancellation and actionable failure feedback. Advanced diagnostics
remain available. No false human identity or fabricated understanding/progress.

Morpheus is a polished Windows desktop assistant and companion. Preserve the
existing M logo, selected green/black orb and restrained Matrix identity. Use
excellent spacing, typography, feedback and fluid motion; decorative rain cannot
substitute for interaction design. Preserve Electron/React, OpenClaw, Objective
Core, agents, tools, tasks, history, browser/provider integrations, profiles,
credentials and settings. Main retains authority, audit, permissions and recovery;
renderer calls use the existing typed host boundary. No second conversation engine.
Shared contracts remain portable; delivery is Windows only. Existing advanced
capabilities stay available under Advanced without dominating ordinary navigation.

## First-user journey

The installer stays practical. Personalized setup happens after installation.

1. Brief, skippable animated "Welcome to the Matrix" arrival; introduce Morpheus,
   ask what to call the user, and retain the answer. Do not repeat full onboarding.
2. Obvious Connections step: detect existing configuration and preserve it; securely
   connect the task-model API in the application, test the connection, and explain
   precise errors. Explain BYOK versus hosted plans. Never request secrets in chat.
3. Standard voice is included for every user, including Basic, without a separate
   voice API key. Provide microphone selection, permission guidance, a real input
   test and audible natural English sample. Detect configured does not mean tested.
4. Default personality: capable, warm, humorous. Movie/anime/One Piece references
   are welcome when relevant. Offer lightweight choices with brief examples and
   real voice previews when available. Persist across surfaces and model routing;
   Personality settings revisit choices without restarting onboarding.
5. Guide one real first success, such as opening an installed app or website.
   Show a few capabilities actually available on this PC. Setup may be skipped,
   but clearly identify unavailable functions; never call an unconfigured app ready.

Settings connect to activity: **Connections, Voice, Personality, Account & Plan,
Advanced**. A failure opens its relevant repair step, preserves the interrupted
conversation/draft/task, and returns there after repair. No detour into Models or
an inherited technical workspace for ordinary setup.

## Presence and continuous interaction

Orb -> upward-opening compact conversation -> expanded conversation/results ->
compact or hidden. Retain the same conversation, draft, task state and personality.
Expansion gives more space and richer results. Composer, readable responses, mic
feedback and controls must be deliberately arranged; avoid a stretched input across
empty space. Explicitly opened workspaces remain readable until the user leaves.

The small bottom-right orb sits safely inside the actual display work area above
or beside the taskbar. Verify taskbars on each edge, DPI/text scaling, display
changes and removal, auto-hide, small work areas and sleep/resume. A usable target
can be larger than its visible artwork. Historical 100-DIP size is not approval.

**New confirmed requirement: freely movable companion. Proposed behavior:** drag
to reposition, optionally snap gently to a safe display edge, and remember the
placement per display. Distinguish click from drag; offer a keyboard Move command
and Reset position. Clamp saved coordinates into the current work area when a
monitor disconnects or scaling changes. A panel opens inward from the saved position,
upward at the default bottom-right dock. Keep its focus and hit target stable while
the animated surface changes shape.

Compact should show recent dialogue, a transient editable transcript, the current
result when useful, and one composer with mic, send/stop and expand. Suggested width
360-420 DIP, height based on content with a work-area cap; these dimensions are for
prototype review, not approved implementation constants. Expanded view gives the
same conversation more room and an optional results pane. Ordinary history/results
must remain recoverable without an Advanced detour. No permanent hero above history.

**Retained behavioral requirements; implementation acceptance remains open:**

- Visible artwork about 48-56 DIP, with at least a 44-DIP interaction target;
  initial 16-DIP work-area inset, adjusted if actual taskbar/scaling tests require.
- Fade after about 10 seconds of inactivity following a completed interaction.
  Keep visible while listening, playing speech or awaiting the user's answer.
  Editing/reading/focused compact UI should not disappear unexpectedly.
- Background work does not hold the orb open. Completion uses a restrained
  notification under the user's preferences; do not steal focus.
- Explicit shortcut, tray click or enabled wake phrase restores the companion.
  Wake listening runs only when enabled. Manual microphone mute always wins.
- Hover preview never takes keyboard focus; click/tap/typing shortcut does.
  Preserve the draft through dismissal. Hidden visual loops stop.
- Genuine spoken clarification leaves time to answer; initial clickable fallback
  approximately eight seconds after question playback ends. Cancel on speech or
  typing; no invented options for bare wake silence or ignored social check-ins.

Dismiss hides presentation and preserves work. Tray keeps the application running.
Mute stops microphone capture/wake; visibility never implies unmuting. Stop speech
cancels playback/generation; task cancellation stops only the selected task. Quit
ends application/audio and performs orderly task shutdown/recovery. Label each
control clearly and verify its actual lifecycle behavior.

Animate idle, listening, working, speaking, question, error and dismissal. Actual
capture/playback state and bounded audio level drive listening/speaking feedback.
A prototype may demonstrate these states with an explicit simulation label;
production must never fabricate audio activity or progress. Respect reduced motion,
keyboard/IME, screen readers, readable contrast and high text scaling. Motion should
be noticeable during active interaction and quiet while idle. Hidden animation costs
must be measured across the process tree.

**Proposed motion score — review at actual desktop size and in reduced motion:**

| Moment | Visual behavior | Source of truth |
| --- | --- | --- |
| Idle | Slow, smooth changing contour and internal green light around the stable M | Presentation only; never suggests an open microphone |
| Listening | Surface opens slightly; light and contour respond to real input with controlled attack/release | Actual selected-mic capture and energy, with optional live transcript |
| Request accepted | Brief settling gesture flows into the relevant next state | Final transcript accepted and routed, not a partial guess |
| Executing | Directional current; a short action label only if useful or delayed | Real action lifecycle; no fake percentage or planning narration |
| Speaking | Asymmetric pulses distinct from listening, preserving the same geometry | Real scheduled playback, including silence and generation gaps |
| Question | An open, expectant shape with concise question/options; sufficient answer time | Actual unresolved clarification or authority request |
| Done / failure | Brief resolve-and-settle; failure holds a clear repair affordance | Verified outcome or reported failure; never silence over a consequential error |
| Open / move / dismiss | The same orb anchors the panel and carries position/momentum between surfaces | Actual window state; no focus theft or fabricated window morph |

Use a shared presentation component and motion parameters for native orb, compact,
expanded view and introduction. The approved artwork need not be replaced to animate
the surrounding silhouette and light. Benchmark smooth motion at real size; a larger
exported video is not appearance acceptance. Hidden decorative rendering stops.

## Proposed voice and interaction architecture — not implemented

Preserve the existing Main assistant-session, ACP conversation/history, Core actions,
provider secrets and task authority. Extend the existing voice coordination boundary
to follow the same original live turn through conversation or action execution.
Do not create a second conversation history or competing action router.

```mermaid
flowchart LR
  I[Voice or typed request] --> T[Existing Main turn identity and authority]
  T --> D[Direct known action through Core]
  T --> C[Conversation through ACP]
  T --> W[Longer work through existing tasks and tools]
  D --> E[Correlated outcome and reply events]
  C --> E
  W --> E
  E --> P[Shared presentation state]
  E --> S[Speech queue when a reply is appropriate]
  S --> P
```

1. One selected microphone governs capture and wake. Share consistent device identity
   and failure guidance. Partial recognition can provide editable feedback, but
   only finalized, addressed requests can cause actions. Qualify real echo/noise
   handling and same-breath wake plus command; do not infer them from generated input.
2. Keep the included local inference models warm during an enabled voice session,
   under measured idle memory/CPU and unload rules. The current offline CLI exits
   after each phrase; genuine persistence requires a qualified worker/binding.
   Incremental recognition likewise needs a capable recognizer, not a renamed batch
   call. Benchmark alternatives before choosing or promising quality.
3. Ordinary voice-origin ACP answers must feed the same cancellable speech queue as
   Core replies. Enqueue stable sentences as they become available; synthesize ahead
   of playback. Suppress internal planning/tool text, duplicate segments and historical
   replay. Preserve turn/generation identity through reload, interruption and routing.
4. Simple commands execute quietly. Rich answers and necessary questions are spoken
   when enabled. Local results should say what happened rather than "completed one
   step and produced one artifact". Persona informs concise wording without adding
   an extra model call to every action; acoustic expressiveness must be auditioned.
5. A confirmed spoken interruption stops current output and invalidates stale queued
   audio, then admits the new turn. Stopping speech does not silently undo an action
   already completed. Task cancellation remains explicit and correlated. Manual mute
   blocks all capture/wake; follow-up listening is bounded and visibly indicated.
6. Presentation observes actual events and audio; it never owns microphone authority,
   task execution or secrets. Short recognition/synthesis gaps must be represented
   truthfully, while motion transitions stay visually continuous.

Standard voice remains included without another user API key. First evaluate a warm
local architecture for quality, latency, accent handling, offline privacy and resource
use. Product-funded hosted voice is a separate optional service decision requiring
cost, privacy, allowance and operational agreement. Existing BYOK is task-model access.
Neither a key purchase nor a hardware upgrade is the remedy for missing reply wiring.

Proposed acceptance targets on an agreed Windows PC: warm first audio within 1 s
of stable speakable text, avoidable generation gaps below 200 ms, typed Stop below
150 ms, confirmed spoken interruption below 300 ms, and zero duplicate action or
historical speech replay in the exercised journeys. These are targets, not results
or guarantees. Measure end-of-user-speech to audible answer separately, including
recognition and provider delay; report cold startup and p50/p95, not a best sample.
Owner acceptance of naturalness and real microphone accuracy is required.

## Included voice architecture — preview.6, refined in preview.7

Preview.6 bundles sherpa-onnx 1.13.8 static Windows executables, Whisper tiny.en
int8 recognition and Kokoro v1.0 int8 synthesis. English is the included standard;
Michael is the default warm voice, Heart an alternate. No voice API key, account,
download on first use or service payment is required. Existing provider speech
adapters remain available in Advanced; their stored configuration is preserved.
Windows System.Speech provides opt-in local wake detection, not the default narrator.

Each addressed recording is canonical mono 16 kHz PCM WAV. Main owns a bounded,
cancelable subprocess and temporary utterance directory, removed on success,
failure and cancellation. Audio stays local. No persistent engine process runs
while idle. Local wake uses the Windows default microphone; the selected device
applies to command/test capture. Manual mute blocks both wake and input. Output
samples remain usable while input is muted. Recording tests never execute commands.

This CPU implementation trades install size and startup latency for offline privacy
and zero per-utterance service cost. Preview.7 generates a short first phrase followed
by bounded sentence groups and streams validated 24 kHz PCM through the existing
audio player. Up to eight available CPU threads replace the fixed four-thread TTS
setting after a real sequential engine benchmark (25-word baseline: 13.075 s at four,
9.508 s at eight). This is segmented speech, not token-by-token model streaming;
generation can still outlast playback on slow CPUs. Genuine gaps show zero audio
activity and do not reopen microphone capture while synthesis continues.
Main declares streamed PCM chunk count and byte length; renderer completion waits
for that whole ordered sequence before finishing playback. Cancellation or malformed
streams cannot resynthesize automatically. Native qualification compares all received
PCM bytes with actually scheduled and naturally ended AudioContext frame bytes.
Tiny English recognition can mishear accents,
noise and speaker echo. Actual microphone accuracy, naturalness, echo/interruption
and low-power hardware acceptance remain owner tests. Hosted speech could offer
stronger recognition or faster streaming, but no service account, funded allowance,
retention policy or operating arrangement has been supplied; no hosted voice is live.

Pinned artifact hashes and provenance are in `scripts/prepare-local-voice.mjs` and
the packaged `local-voice/manifest.json`. Sherpa/Kokoro are Apache-2.0, Whisper and
ONNX Runtime MIT; the independent eSpeak phonemizer is GPL-3.0. License texts and
corresponding upstream source/build archives ship with the executables. Source is
unmodified. These records identify distribution inputs, not a legal certification.
Primary documentation: https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html
and https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.8 .

The owner subsequently authorized autonomous completion and testing. Preview.7
addresses demonstrated speech delay, misordered task exchanges, credential-bearing
public-research links, pinned connection fallback and cancellation during final
website verification. An isolated hosted Windows runner qualified install, runtime,
same-version reinstall and default uninstall at final source `757f71c5`, without
writing the owner's Windows registration. Evidence is recorded in
the same current checklist; no new competing experience plan is introduced.

| Candidate | Required evidence and tradeoffs |
| --- | --- |
| Local neural STT/TTS | Natural English taste, accuracy, download/install size, CPU/RAM/GPU use, startup and response latency, offline behavior, licensing. Addressed audio remains local; verify network behavior. |
| Product-funded hosted STT/TTS | Real quality/latency, audio destination and retention, transport/privacy, hosting account and service operation, metered cost, abuse limits and a funded allowance. No user-supplied voice key. |
| Windows speech fallback | Useful recovery only with truthful voice identity; do not label robotic output as the approved natural voice. |

Measure microphone selection/permissions, speaker echo versus headphones,
same-breath wake+command, interruption, typed follow-up, silence, mute, unplug,
lock and sleep. Specific failure -> repair -> resume. Included cloud speech still
costs money; hosted funding/allowance are unresolved and must be disclosed. Those
inputs must not block independent local voice evaluation or BYOK interface work.

## Behavior, capability honesty and cost

Clearly requested app/website actions use existing direct execution without
unnecessary questions, model planning or approval dialogs. Ask for meaningful
ambiguity or consequential authority. Unrestricted never bypasses user control,
secure handling or payment approval. Support cancellation, natural interruption,
typed follow-ups and understandable partial failure/recovery. Optional jokes and
check-ins adapt to explicit preferences; never claim emotional awareness.

Use deterministic dispatch and capable inexpensive routes for simple work; bounded
stronger routes for complex work. Preserve context/personality across routing and
keep unknown usage distinct from zero. Do not add an extra model pass for humor.

**Confirmed browser requirement:** "Open YouTube" opens in the user's existing
normal Chrome session/profile, with a brief visual acknowledgment and no planning
speech, approval ritual, technical browser workspace or isolated profile. Prefer
the relevant active Chrome window; if multiple profiles make selection ambiguous,
offer a one-time profile preference. If Chrome is not running, open its chosen normal
profile. Specify and test actual focus/tab behavior in the browser adapter: the OS
default-browser opener alone does not prove it chose the active Chrome profile.
Actual browsing automation requires an explicit connection to the selected browser
context. Preserve isolated automation for workflows that need it, without silently
copying cookies or exposing all personal tabs to an agent.

**Proposed companionship defaults:** occasional situational humor, and one optional
daily check-in at the first suitable interaction or a user-selected time. Reuse saved
preferences and frequency/quiet-hours controls. No catch-up burst after absence, no
repeating greetings on each launch, and no interruption during calls/fullscreen/DND
where that state is known. A silent acknowledgement stays silent; jokes do not block
actions. Show a short example during Personality setup. Movie/anime references are
occasional, not the default answer to every request. Never infer emotions.

The first journey should finish with one actual command and its verified outcome,
then show a small capability selection based on actual availability. Repair settings
must return to the originating surface and interrupted interaction. Focused editing,
an unfinished draft and explicit reading must suspend automatic dismissal.

The following inventory records Checkpoint A's historical preview.5 findings.
Current preview.7 verification is in the single completion checklist.

| Capability group | Existing owners to reuse | Checkpoint A / preview.5 evidence boundary |
| --- | --- | --- |
| App/website actions; window/media/volume; files/clipboard/reminders/system checks | `shared/morpheus/actions/registry.ts`, `electron/services/morpheus/index.ts`, Win32 adapters and Core | Implemented source; prior synthetic/local qualification. This inspection did not execute commands or approve all hardware effects. |
| Conversation, draft, tasks and history | Main assistant-session, original ACP/history, conversation/command stores | Prior packaged fixture evidence; installed compact turn became hidden on expansion in this inspection. |
| Public browser and cited research | Worker port/browser adapter, research report and results renderers | Implemented bounded public paths; live quality and authenticated account scope remain unverified/unfinished. |
| Website create/revise/preview/publish | Existing static verifier, pinned interactive templates, revision snapshots and protected GitHub publication owner | Source/local fixtures; arbitrary full-stack and form delivery not supported; live target/publication acceptance open. |
| Providers and secure setup | Provider service/settings, protected secret store and migration, typed validation API | Implemented protected foundation; connection testing exists but is difficult to find. Existing account detection must be reused. |
| Introduction, personality, voice and check-ins | Activation/onboarding store, persona context, voice service/player/wake, social policy | Implemented fragments; connected first journey and included voice remain unaccepted. |
| Tools, agents, channels, schedules and existing administration | Current OpenClaw routes and advanced pages | Preserve functionality; move ordinary navigation away from technical surfaces. |

Every capability presentation labels **available**, **unconfigured**,
**experimental**, or **planned** using actual runtime evidence. Do not advertise
speculative income generation or autonomous success as guaranteed functionality.

## Account, plans and NerdGPT

Keep account/subscription entitlement, personality preference and actual service
availability separate. One application/runtime serves all plans.

| Plan | Intended presentation | Actual current service state |
| --- | --- | --- |
| Basic | Bring your own task-model API; included standard voice | BYOK foundation preserved; included local recognition/synthesis bundled in preview.6, pending owner microphone/quality acceptance. |
| Premium | Hosted quality models and supported voice | Unavailable; incomplete runtime/accounting and no supplied hosted operations. |
| Unrestricted | Premium plus future NerdGPT spicy humor, profanity and roast personality | Planned; NerdGPT is the owner's platform and integration is deferred. |

Optional evil-Morpheus animation may accompany an appropriate future experience;
never imply NerdGPT is connected or a purchase activated. Stripe and crypto are
requested payment methods, not configured services. No prices, fake entitlement,
trial balance or working checkout. Pricing, business country, server/domain,
payment accounts and hosted funding/operations remain open external decisions.
Local plan presentation and BYOK work can proceed without them.

## Checkpoint A evidence — 2026-10-02

- Current chat directory is projectless. Verified application worktree:
  `C:\Users\monir\Documents\Codex\2026-09-18\morpheus-experience-reset\morpheus-phase7`.
  It was clean/detached at `4a9f25e9e2a715572cd0a75c9205b9de681f82f4`.
  Verified origin `https://github.com/MoNaBOSS/Morpheus.git`; fetched without
  reset/stash/checkout. Remote authorized branch matched that full commit.
- Original `C:\Morpheus\morpheus-core` was clean on the application branch at
  `fa988f06ebeb41d070accc337cee1cea7cad0b39`, behind 31. It is preserved.
- Installed/running `C:\Program Files\Morpheus\Morpheus.exe`, registry version
  `1.2.0-preview.5`, executable file version same. Installed executable, app.asar,
  motion CSS and OpenClaw manifest hashes exactly match delivered candidate
  metadata. App.asar SHA256:
  `63efecda7b5e267275342310436efcd2510171c834779569e5fffd0f3d63ccf1`.
  Delivered installer SHA256:
  `cf82b227b90299bc1be1cf01bacfe7421be267449f37cf7c9cfd90e98b60b9c4`.
  Candidate application source `c8d021dda41d7abfeff8511bc1988b17b794ecad`;
  subsequent commits through baseline modify documentation only.
- Storage checked before any build: C: 10,221,359,104 bytes free (~9.5 GiB);
  E: 167,552,888,832 bytes (~156 GiB). No build/install/dependency download ran.
- Read AGENTS, Sol/CLAUDE orientation, required Phase 7 plan/architecture/ledger,
  H/I evidence, Windows checklist, preview.5 handoff and relevant source owners.
- Computer Use inspected actual installed orb/upward composer, compact,
  expansion and Settings. Owner interrupted the first pass with physical Escape;
  interaction stopped, then resumed only after explicit owner authorization.
  No credentials entered, mic enabled, paid request, command or subscription test.
  Screenshots/trees appeared in chat; no private transcript or credential copies
  were saved as deliverables or committed.

| Gap | Evidence / cause | Qualification |
| --- | --- | --- |
| Oversized empty compact/composer | Native installed capture; `MorpheusQuickCommand.tsx` stretches a flex log into a 440x520 default and anchors input below it. Full empty mode centers a very wide composer. | Observed plus source-confirmed layout. |
| Compact history absent after expansion | Native settled full capture. `CommandCenter/index.tsx:59` sets `data-empty` from task runs only; `globals.css:1269` hides all messages when there are no objective runs, including ordinary ACP conversation. | Reproduced installed failure; precise source cause. |
| Technical navigation in normal Settings | Native settings route reveals system-builder/OpenClaw sidebar. `MainLayout.tsx:21-40` excludes `/settings` from product surfaces and uses inherited Sidebar. | Reproduced installed failure. |
| Voice unavailable and poor recovery | Installed existing generic error shown; Settings simultaneously says "Ready through OpenAI" based on configuration. Status checks key presence, not successful speech service/device test; generic categories omit specific permission/security/recording repair. | Error/readiness mismatch observed; exact underlying device/provider failure not yet isolated. |
| No included default speech | `voice-service.ts:383-429` resolves configured eligible API accounts; `morpheus-voice.ts:537` rejects capture before audio acquisition if transcription is unavailable. | Source-confirmed requirement gap; existing OpenAI configuration was detected in installed Settings, not erased. |
| Connection/personality/voice fragmentation | Settings is one long technical page; connections in Models; configuration repair links to `/models?addProvider=1`; onboarding has no secure connection step. | Source-confirmed; installed hierarchy inspected. |
| Motion not convincing | Shared native/React motion exists: small stepped idle halo and active aurora under artwork; the intended art can obscure effects. | Implementation present; perceptual/hardware audio acceptance remains rejected/unverified, no new motion recording. |
| Oversized orb/taskbar overlap | Source default is 100 DIP. Work-area formulas and display listeners exist, but listeners reposition orb only, not active compact/full surfaces. | Size source-confirmed; owner's overlap report retained; actual taskbar/DPI/display changes not verified in this pass. |
| Companion remains visible | Persistent `wantsVisible`; inspected presence owners have no post-interaction 10-second inactivity policy. | Source-confirmed lifecycle gap. |
| Subscription incomplete | Installed managed access unavailable; runtime guard and deferred billing exist without the required simple three-plan journey. | Observed unavailable service; no fake checkout. |

Historical [preview.5 handoff](../releases/WINDOWS_PREVIEW5_HANDOFF.md) and
[Phase 7 ledger](../releases/MORPHEUS_PHASE7_ACCEPTANCE.md) remain valid only for
stated historical synthetic/package checks. They do not override owner rejection.
The browser [prototype](morpheus-experience/index.html) is a historical simulation,
not the installed app, real voice or current visual approval.

## Review sequence and exact next step

**Current authorization:** on October 3 the owner approved the recommended Floating
companion + Conversation card direction and asked for an eye-pleasing animated
opening and logo. The preview.7 UI/UX remains rejected. The next design deliverable
is a connected arrival/companion/conversation study before application integration.
Required gates:

1. Direction APPROVED: Floating companion + Conversation card; automatic editable
   captions with optional hiding and persistent microphone-state feedback.
2. Review one connected motion study at actual desktop size: drag/dock, listening,
   quiet Chrome action, question/answer, interruption, compact/expanded return and
   dismissal. Prototype behavior must be labelled; include a real voice audition
   with generation waits retained, plus a reduced-motion version.
3. After design approval, qualify one ordinary spoken conversation and one simple
   Chrome command through the existing owners, including interruption and mute.
4. Integrate approved presentation, first journey, contextual repair, history/results
   and optional companionship in small checks; preserve Advanced.
5. Package and verify the actual Windows build, with physical/hardware and commercial
   service gates recorded separately. Do not equate a prototype or test count with
   approval or readiness.

Current motion study: `C:\Users\monir\.codex\visualizations\2026\10\02\01a0fc17-f1d1-72d1-ba71-dae8a942f04b\morpheus-connected-arrival.html`.
It reuses the existing M artwork: staged light/reveal, brief first-visit welcome,
shared logo travel into the 56-pixel companion, draggable placement, upward/inward
card, compact/expanded draft continuity, temporary captions, quiet action current,
distinct speaking contours, preferences, mute and reduced motion. Returning launch
can be previewed separately. It is a browser motion study, with no microphone,
provider, OS browser action, onboarding completion or new application runtime.
No voice audition, taskbar/DPI acceptance or installed-app verification is implied.
Browser review checked the 736- and 320-pixel content widths, opening/compact/
expanded transitions, draft retention through preferences, keyboard focus, mouse
drag and arrow-key movement, typed replies while simulation-muted, stop, reduced
motion (zero running animations after settling), and long wrapped content retaining
the composer. The browser console is clean. The simulated Chrome result remains in
the same preview card. A recording of actual rendered study motion is saved at
`C:\Users\monir\Documents\Codex\2026-10-02\continue-morpheus-from-the-existing-project\outputs\design-review\morpheus-connected-motion.webm`.
That recording is silent, contains simulated actions, and is not installed-app or
audio-latency evidence. No application source, profile or credentials were changed.

The following implementation narrative is historical preview.6/preview.7 evidence
from the separate E: worktree at
`E:\Morpheus-builds\experience-preview6\source`, based on `3bcad683`. The original
checkout and prior application worktree remain untouched. No owner profile is used
for testing and no installer is run over the owner app.

Preview.6 simplifies the existing root conversation, removes the task-only CSS that
hid conversation history, adds a retained-history drawer and readable Markdown,
and gives Settings five contextual groups. Native compact/full transitions use
the same Main conversation and draft owners. Technical Chat and all inherited
tools remain under Advanced. Existing task/results, research and site execution
owners remain in place; no executor, capability registry or provider secret store
has been replaced. Simple local actions still bypass model reasoning.

The first launch connects name -> secure Connections -> real Voice tests ->
personality -> first command. Skipping persists and explains missing model access.
Personality is revisitable and shared by existing routing. Voice failure links to
Voice repair while keeping the conversation/draft. Three plan cards distinguish
BYOK/included local speech from unavailable hosted service and deferred NerdGPT.

The native orb is 56 DIP, with a 16-DIP work-area inset. Compact defaults to
440x400 DIP. Orb/compact fade after ten seconds of completed idle interaction;
pointer, keyboard and scrolling refresh compact inactivity. Listening, speech,
active answers and questions hold it open. Explicit full workspace stays open.
Hidden motion pauses; reduced motion is respected. Aurora/halo now sit visibly
around the preserved artwork, with actual microphone/playback audio levels.
Visible idle and quiet states both breathe and orbit; quiet keeps the microphone
asleep. Native Electron evidence exposed a load-order bug: `isLoading()` remains
true inside `did-finish-load`, which skipped initial state/visibility projection.
The orb now uses its established DOM-ready flag; Main visibility sync waits for
`did-stop-loading`. Fade restoration resets opacity as well as visibility.
The native regression verifies advancing transforms, reduced motion, the actual
ten-second hide and visible reappearance. No global throttling override is used.
Typed clarification and pending authority also hold compact open when the
microphone is muted. Advanced voice distinguishes the included local engine from
an explicitly configured provider; changing a provider or preset selects that
engine while preserving saved accounts. Local voice controls show only its two
bundled voices and disclose Windows-default-microphone wake behavior.
Display changes reposition the active compact window as well as the orb; pure
layout tests cover changed work areas, while physical DPI/taskbar-edge tests remain open.

Preserved preview.6 verification: 324 unit files passed, 3,336 tests passed and two skipped,
including real bundled synthesis/transcription and cancellation. Native Electron
journeys cover setup, persisted personality, same conversation/draft through
compact/full/reload, four-language history and explicit Advanced access. Model
answers in fixture journeys are simulated and do not certify live model quality.
Real generated English voice samples are separate, not simulated audio.
Normal preview.6 packaged qualification at application source `12a36898` passed real Gateway startup, included
voice playback/cancel control, local task execution, protected loopback provider,
original ACP compact reply and history/draft persistence through full/settings/
reload/restart. The loopback model reply is simulated; the speech engine is real.
The 25-word UI sample took 19.085 seconds including generation and playback on
the final run; an earlier qualified run took about 16 seconds.
Separate 21-word Michael/Heart samples used about 317/310 MiB peak working set;
generation took 12.8/13.7 seconds during concurrent checks on i5-14600K. These are
scoped observations, not minimum-hardware promises or approved naturalness.
The final native motion recording verifies real quiet breathing/orbit, partial
fade, hidden pause, restored visibility and reduced motion. Its 16-second clip
enlarges the 56-DIP orb for review, explicitly labels hidden-window padding and
uses an isolated Main show/hide for restoration. It does not claim physical wake.
Both microphone input and ambient listening remained muted.

The compiled preview.6 NSIS EXE is 477,650,761 bytes, SHA256
`599f8d29628efcfafdfe7837cf72dabb7ab8bbf99efa1af8704e5416a83cb07e`.
Static verification passed all 40,896 embedded file paths/sizes and archive CRCs,
plus 44 extracted identity hashes. Exact EXE/app.asar/motion/orb hashes match the
normal-runtime qualification at `12a3689806d6bfe87cdc63f4b6600ecea21c2093`.
The installer is unsigned and no owned update feed is configured. Included voice
models, notices and corresponding upstream source archives are verified payload.

**Exact next step:** implement the approved motion through actual application state,
connect contextual settings and original ACP spoken replies, improve included speech
latency, and qualify the packaged Windows candidate. The four-step `Morpheus-PC-Acceptance.md` remains
beside the identified preview.7 EXE and real media. The checklist identifies every
autonomous test boundary and open gate. After direction and the connected motion/voice
study are approved, fix demonstrated gaps without redoing approved work.
Physical microphone/wake/echo/audibility, other DPI/taskbar/display/sleep,
owner-profile previous-version upgrade, live provider/publication and long mixed-use
performance are not declared passed. Hosted pricing/funding, Stripe/crypto merchant
services, signing/update and deferred NerdGPT require external inputs; their UI is
honest and unavailable, not a fake working commercial service.
