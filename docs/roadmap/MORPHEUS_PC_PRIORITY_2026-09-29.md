# Morpheus: PC priorities and honest readiness

Updated 2026-09-29. Active branch: `codex/morpheus-phase6-managed-layer`.
This supersedes older placement choices, not the established product use cases.

## Product direction

A quiet Windows companion for basic and intermediate work: open the browser,
research, create and improve websites, manage files and keep independent work
running. Business and investing workflows follow after these are dependable.
The first investment workflow should be research and paper trading; connecting
a broker or authorizing transactions is a separate product scope. No income or
return is guaranteed by a successful task or by adopting an agent framework.

The bottom-right corner is the default. The orb sits above the taskbar; short
conversation grows upward along the right edge. Full workspace opens explicitly.
Hover must not steal keyboard focus. Click/tap focuses typing; drafts survive
dismissal. Quiet mode, reduced motion, cancel-task and stop-speech are distinct.

## What is built versus what is accepted

| Area | Built evidence | Remaining acceptance or implementation |
| --- | --- | --- |
| Native execution | 22 registered actions; typed plans, permissions, verification and audit | Real Windows workflow coverage; opening a browser does not prove browser interaction |
| Browser | `web.openUrl`, app launch, separate OpenClaw/browser facilities | One task flow for browse/extract/cite/interact with reliable cancellation and results |
| Website work | Workspace files, `site.verify`, registered project launch | Native website contract currently rejects scripts/forms/remote resources; interactive apps, revision loops and publication need a reviewed execution path |
| Task system | Objective records, Missions, independent task controls and restart checkpoints | Run actual research plus a quick app command concurrently; fixture success is not research acceptance |
| Design | Interactive desktop, native orb hover preview, motion alternatives and preference surfaces | Native preview clicks into focused compact typing; chosen motion tied to real audio/task state, full hover-input parity and unobtrusive returning/startup behavior remain to integrate |
| Voice | Wake/record/speak lifecycle and interruption paths | Real microphone/headset, wake accuracy, latency, voice choice, device changes and sleep/resume |
| Accounts and usage | Protected desktop account flows; account service; SQLite reservations/receipts | Live identity deployment, managed inference/voice routes, real trial, complete cost coverage and operations |
| Release | Mac build and automated test checkpoint | Windows-only tests, installer/upgrade, signing, updates/rollback and sustained use |

We are at an integrated foundation and internal Windows acceptance stage. A
single completion percentage would hide unfinished end-to-end paths. The shared
website is a design artifact; it does not certify the application's capabilities.

## September 29 changes

The [Windows continuation checkpoint](MORPHEUS_PC_CHECKPOINT_2026-09-29.md)
records the verified source, first native hover implementation and source-level
test results. It does not supersede the PC workflow and hardware acceptance below.

- Browser design: smaller bottom-right orb, upward composer and a short hover
  dwell to avoid accidental openings. Completion cards clear the orb and taskbar.
- Native code: wake orb and all compact entry triggers use the bottom-right
  display work area. Placement handles negative monitor coordinates and small
  work areas; expanding restores the prior full-window bounds.
- Regression coverage: edge placement, secondary display, constrained dimensions,
  tray/shortcut/wake consistency, and updated Windows native E2E expectations.

## PC order: finish complete workflows

1. Fetch the existing branch without overwriting PC changes. Follow the
   [source and account handoff](MORPHEUS_PC_RETURN_2026-09-28.md).
2. Accept native presence: taskbar on each edge, monitor/DPI changes, wake without
   focus theft, compact/full restoration, keyboard input and quiet mode. Connect
   native hover and the chosen animation with real state before claiming parity
   with the shared design. Keep startup presence small after completed onboarding.
3. Prove browser open/navigation, then source-backed research saved as an artifact.
   Reuse existing browser infrastructure behind Objective ownership; do not create
   a second task history or bypass permissions/cancellation.
4. Prove website creation → local view → requested revision → verification →
   authorized publication. Add a scoped development worker for interactive sites;
   removing the current verifier's script restriction alone is not an implementation.
5. Run mixed tasks, cancel/restart, speech interruption and offline recovery.
   Measure actual cost of successful outcomes, including retries and external tools.
6. Complete real account/trial/provider paths if the first release requires managed
   service. BYOK can support an internal trial while these remain incomplete.
7. Build the Windows candidate from the accepted commit and test installation and
   upgrade with existing user data. Release only after those records exist.

## Hermes decision

Assumption: Hermes means **Nous Research Hermes Agent**, not a Hermes model.
Current official documentation describes browser automation, model/provider
choice, skills and memory, and native Windows support. Those make it a candidate
for the browser/coding worker gap, not evidence of compatibility with Morpheus.

Recommendation: retain Morpheus's Objective/permission/account boundary and
current OpenClaw integration. Benchmark Hermes in isolation before adopting an
adapter. Do not migrate profiles, import API keys or enable a second unrestricted
executor merely to compare it. This checkpoint does not install Hermes.

Compare current execution and Hermes on the same model/provider, workspace and
12 cases below, at least three runs per case. Record successes, corrections,
first useful output, wall time, tokens, search/browser charges and failed attempts.
A faster or cheaper engine must still preserve cancellation, artifact verification
and one task identity. Adopt it only if evidence justifies the additional runtime,
packaging, updates, permission mapping and usage accounting.

Sources checked September 29, 2026: [Hermes repository](https://github.com/NousResearch/hermes-agent),
[browser tools](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser/),
[provider configuration](https://hermes-agent.nousresearch.com/docs/integrations/providers/).
Framework choice alone cannot establish cheaper API use.

## First acceptance set

| Case | Pass evidence |
| --- | --- |
| Open browser | Requested installed browser launches; direct action uses no planner call |
| Open exact URL | Correct page opens; no unrelated tab/session damage |
| Research | Read multiple relevant sources; save a summary with traceable citations |
| Compare options | Current facts, source dates and clear uncertainty; no invented prices |
| Static site | Real responsive files verified and opened locally |
| Interactive site | Requested interaction works in a browser; tests and artifact exist |
| Revise site | Requested edit applied, existing behavior preserved |
| Publish site | Authorized provider reports success and resulting URL loads |
| Parallel task | Quick app launch works while research continues |
| Cancel/restart | Stops only selected task; no duplicate completed effects after restart |
| Voice and presence | No wake focus theft; correct recognition and prompt speech interruption |
| Cost and outage | No retry storm; failed calls counted; missing costs remain unknown |

Use the existing [Phase 5 evaluation format](MORPHEUS_PHASE5_EVALUATION.md).
Unimplemented cases are blocked, never recorded as successful from design clicks.

## Keep API cost low

Use direct native actions for exact simple commands; avoid inference to open a URL.
Use search/extraction for factual research, interactive browsers only when needed.
Select an economical model from measured task success, escalate difficult work,
cache stable context where supported, bound tool loops and avoid duplicate planning.
Include voice, search, browser services and failed attempts in cost per success.
The owner allows evaluation spending, but inexpensive operation is the product
goal. No complete global cap or cheap production route is currently certified.

## Validation recorded on Mac

September 29: 10 focused placement/controller tests and 18 harness tests passed;
Node typecheck, scoped lint, application build, harness CI and updated task-spec
validation passed. Electron visual checks: 3 passed, 2 explicitly Windows-only
cases skipped (native orb and screenshot permission). The screenshot permission
case previously failed on Mac because `screen.capture` is registered only for
Windows; it now declares that platform dependency and must run on PC. The three
native orb lifecycle unit cases are likewise Windows-only and skipped on Mac.

Browser checks passed for upward opening, taskbar clearance, retained drafts,
390×844 and 1280×600 layouts. The application build reports existing bundle-size
and mixed-import warnings. No live provider, microphone or Windows acceptance is
claimed from these checks. The earlier 2,828-test full-suite result is dated
September 28; the full suite was not rerun for this placement change.
