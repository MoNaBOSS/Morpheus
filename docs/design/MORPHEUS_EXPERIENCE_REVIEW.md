# Morpheus experience specification

Updated 2026-10-02, Asia/Dhaka. **Current owner requirements; preview.5 experience rejected.**
This is the single current experience specification, reconciled from the existing
design review and the owner's October 2 correction. The single current execution
checklist is [WINDOWS_COMPLETION_CHECKLIST.md](../releases/WINDOWS_COMPLETION_CHECKLIST.md).
Historical plans, prototypes and automated results remain evidence, not approval.
No meaning is inferred from standalone historical A/B/C/D answers whose questions
are unavailable. The original design review is recoverable in Git at `4a9f25e9`.

## Product and preservation contract

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

**Proposed defaults for owner validation, not accepted implementation:**

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

## Voice architecture decision gate

Current source requires a compatible configured API account for STT/neural TTS;
Windows System.Speech covers wake recognition and Windows speech is a fallback.
That foundation does **not** fulfill included standard voice. Keep existing adapters
and cancellation/audio ownership while evaluating a viable included default.

Before choosing the default, test a bounded local neural STT/TTS candidate and a
hosted product-funded candidate when hosted service inputs exist. Check current
primary documentation, licensing, redistributable models, supported hardware and
real samples. No engine/vendor is selected or installed at Checkpoint A.

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

| Capability group | Existing owners to reuse | Current evidence boundary |
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
| Basic | Bring your own task-model API; included standard voice responsibility | BYOK foundation exists. Included standard voice not yet delivered. |
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

**A:** preserve/identify baseline and reconcile this spec/checklist. No application
rewrite. **B:** review connected application-intended moving components in small
slices. **C:** make first journey real, one integration/physical PC test at a time.
**D:** connect preserved capabilities/results/recovery/plans to approved experience.
**E:** verify actual packaged/installed Windows app and identify the resulting EXE.
Each slice records implemented/simulated/unverified/blocked separately and stops
at the owner's meaningful acceptance gate. Do not redo approved work without a
shown regression. Run only relevant validation; no broad test/build campaign here.

**Next proposed slice B1, awaiting owner acceptance of the scope:** small orb and
upward compact conversation/composer, with visible idle/working/question/error
motion, reduced motion, expand/back continuity and the proposed 10-second fade.
Reuse the actual artwork, motion component, typed surface and draft owners.
Use a clearly labeled isolated design-review harness with synthetic content and
simulated task/audio states; do not replace the owner's installed profile. Show
short motion recording plus rendered views. Expansion must retain displayed
history and draft, including conversation-only history with zero objective runs.
First owner review is appearance/size/composer/transition/dismissal; broader
integration waits. Subsequent B slices connect introduction/setup, voice/personality
and contextual settings into this same interface, each separately reviewable.
Real voice samples belong to bounded engine evaluation and must be labeled with
actual engine/output; simulated audio states cannot pass voice acceptance.
