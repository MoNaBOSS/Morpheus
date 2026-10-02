# Current Windows experience completion checklist

Updated 2026-10-02, Asia/Dhaka. **Preview.5 rejected by owner; product not accepted.**
Single current checklist. Requirements and evidence are in the reconciled
[experience specification](../design/MORPHEUS_EXPERIENCE_REVIEW.md). This replaces
the previous "fixed release" queue, not its historical evidence. Preserve the
existing backend, identity, capabilities, profiles, history and credentials.

Status: `VERIFIED` means evidence exists for the stated boundary only;
`IMPLEMENTED` means source exists; `SIMULATED`, `OPEN`, `REJECTED`, `BLOCKED` and
`AWAITING OWNER` cannot be counted as production acceptance. No enormous completion
phase. Small coherent components, relevant tests, owner review before proceeding.

## Checkpoint A — baseline

| Item | Current result |
| --- | --- |
| Current directory and repositories | VERIFIED: chat directory is projectless; reused clean detached phase7 worktree at full `4a9f25e9e2a715572cd0a75c9205b9de681f82f4`; original checkout clean at `fa988f06`, branch behind 31 at inspection. |
| Origin / branch / safe fetch | VERIFIED: Morpheus origin; fetch completed; authorized remote `codex/morpheus-phase6-managed-layer` matched baseline. No reset, stash, clean, divergent checkout overwrite or force push. |
| Installed build identity | VERIFIED: Program Files preview.5 executable, app.asar, motion CSS and OpenClaw manifest match delivered candidate hashes; application source `c8d021dd`, later baseline commits docs only. |
| Owner rejection | RECORDED: spacing, motion, taskbar, continuity/navigation, voice, setup, discoverability and plan presentation remain unaccepted. Earlier automated counts do not rebut this. |
| Native inspection | VERIFIED scoped inspection: orb/upward composer -> compact -> expansion -> Settings. Large empty layout, generic voice error/readiness mismatch, hidden conversation on expansion and inherited technical sidebar observed. |
| Source root causes and reuse map | VERIFIED scoped source review in specification. Full history hidden by task-only empty-state CSS; Settings chooses inherited Sidebar. Existing Main session/ACP, secure provider, motion, Core and voice adapters remain reusable. |
| Taskbar / scaling / hardware voice | OPEN: owner's overlap report remains; this inspection did not verify actual screen work area/taskbar edges, DPI changes, recording, playback, interruption or device recovery. |
| Storage / builds | VERIFIED: C: ~9.5 GiB free, E: ~156 GiB at baseline. No build/install/download ran. Future artifacts/intermediate profiles on E:; check storage again before each build. |
| Specification and checklist | UPDATED in place; historical plans/handoff point here. Application code, dependencies and profiles not edited. |
| A acceptance / next slice | AWAITING OWNER: review baseline and proposed B1 scope below. No B implementation yet. |

## Checkpoint B — interaction design, separately accepted slices

| Slice | Smallest coherent review / required evidence | Status |
| --- | --- | --- |
| B1: orb and compact conversation | Existing M/orb, smaller target, intentional upward composer and readable thread; real rendered motion, expand/back history/draft continuity, hide/reopen and reduced motion. Short motion recording; synthetic task/audio states explicitly labeled. | PROPOSED / AWAITING OWNER |
| B2: introduction and Connections | Brief skippable arrival, name, existing-config detection, BYOK/hosted distinction, obvious secure setup and skip consequences in the same interface. Real key entry/tests wait for C; simulations labeled. | OPEN; after B1 acceptance |
| B3: voice and personality controls | Connected mic selection/input-test/sample controls, brief personality examples, specific repair-and-return states. Real voice samples identify engine and evaluation conditions; no fabricated neural previews. | OPEN; separate owner review |
| B4: contextual settings and expansion | Connections, Voice, Personality, Account & Plan, Advanced within approved experience. Expanded results give space without technical-dashboard navigation; all surfaces share state. | OPEN; separate owner review |

Proposed B1 defaults: approximately 48-56 DIP visible orb / >=44 DIP target,
16-DIP work-area inset, ~10-second fade after completed idle interaction; keep
visible for listening/speaking/questions and intentional typing/reading. Work
continues hidden; notify under preferences; manual mute always wins. These are
**proposals**, not settled owner choices or verified native behavior.

## Checkpoint C — make the first journey real

| Slice | Required real behavior | Status |
| --- | --- | --- |
| C1: task API | Preserve existing accounts; secure add/edit/test and understandable error; Basic usable without hosted account. Secret never enters chat/history/renderer diagnostics. | Existing foundation IMPLEMENTED; approved flow OPEN |
| C2: included standard voice | Evaluate local neural speech with actual natural English samples/latency/resource/licensing evidence; evaluate funded hosted route when service inputs exist. No separate user voice key. Explain privacy/quality/funding tradeoffs. | OPEN; current configured API adapters insufficient |
| C3: mic and command | Select/test actual input; specific permission/device repair; spoken simple command executes directly once and returns factual result plus audible reply. | OPEN physical acceptance |
| C4: conversation and persistence | Interrupt speech, typed follow-up, saved name/personality/voice/provider, same history/draft/task across surfaces and restart. Fix task-only empty-state regression. | Source owners IMPLEMENTED; observed continuity REJECTED |
| C5: presence/wake lifecycle | Fade/reopen, background notifications, tray, shortcut, opt-in wake, manual mute, taskbar/DPI/display change/lock/sleep; hidden loops stop. | OPEN |

Give the owner exactly one short PC instruction at each physical test, record its
actual outcome, and pause for the answer. No bundle of mic/DPI/live workflow tests
at the first component review. No paid calls without a bounded approved test.

## Checkpoint D — remaining product connection

| Slice | Required behavior | Status |
| --- | --- | --- |
| D1: capabilities/results | Preserve app/browser/tools/agents/tasks/history/providers; connect real task/results presentation, cited research, supported website create/revise/preview/publication and explicit status labels. | Existing source/fixtures; connected acceptance OPEN |
| D2: recovery and Advanced | Specific error -> repair -> return; cancellation and partial outcomes; advanced inherited features reachable without ordinary exposure. | OPEN |
| D3: Account & Plan | Basic/Premium/Unrestricted clearly presented; account entitlement, personality and availability separate. No invented price, active subscription, live checkout or NerdGPT integration. | Guarded managed foundation; simple presentation OPEN |

External service decisions: prices, business country, server/domain, payment
accounts, Stripe/crypto setup, hosted funding/operations. NerdGPT integration is
deferred. These block their own live gates, not local UI/BYOK or local voice work.

## Checkpoint E — actual release acceptance

| Gate | Required evidence | Status |
| --- | --- | --- |
| E1: source/package | Relevant regression on final approved changes; candidate source/version/lock/runtime/EXE/hash/notices/signing identified. Exact package, not stale source captures. | Historical preview.5 only; new candidate OPEN |
| E2: installed Windows | Setup, input/output/interruption, real audio-driven animation, scaling/taskbar/display changes, navigation continuity, task execution, persisted settings, tray/wake/mute, errors/recovery and mixed-use stability. Retain profiles and credentials. | OPEN / experience REJECTED |
| E3: delivery | Exact EXE path/version/build identity; implemented/tested scope, limits/external blockers and one short final PC acceptance checklist. | OPEN; no new EXE at A |
| Public distribution / hosted | Signing/update ownership and isolated install/upgrade evidence; managed ACP/full usage/identity/billing/operations if offered. | BLOCKED on external setup and unfinished implementation |

Historical installer:
`E:\Morpheus-builds\p7-preview5\candidate\release\Morpheus-1.2.0-preview.5-win-x64.exe`.
Version `1.2.0-preview.5`, app source `c8d021dd`, SHA256
`cf82b227b90299bc1be1cf01bacfe7421be267449f37cf7c9cfd90e98b60b9c4`.
Unsigned, no owned update feed. Installed-payload identity was checked; that is
not retrospective certification of installation/upgrade/uninstall behavior.

Historical [preview.5 handoff](WINDOWS_PREVIEW5_HANDOFF.md),
[H/I evidence](phase7-i-windows-candidate.md) and
[acceptance ledger](MORPHEUS_PHASE7_ACCEPTANCE.md) retain bounded synthetic/package
results. No new full unit, build, E2E, hardware or live-provider campaign ran at A.

## Exact next step and checkpoint record

**Next:** owner reviews A and B1 proposal. On acceptance, build only B1 in an
isolated review harness using application-intended components. Show the smaller
orb/upward compact exchange, motion recording, expand/back continuity and proposed
fade; label all simulated audio/tasks. Pause for appearance/transition approval
before broad integration or the next component. Do not install over the owner app.

For each accepted slice update its row here and the current record in the spec:
source and dirty state; change; actual tests/evidence; simulated/unverified parts;
paid calls and bounded cost without secrets; owner result; exact next step.
Do not repeatedly retest or redesign approved work without a demonstrated regression.
