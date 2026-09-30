# Phase 7 acceptance and evidence

Created 2026-09-30. **NOT ACCEPTED.** This file defines tests and keeps the evidence
boundary visible. [Execution order](../roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md)
and [architecture](../architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md) govern scope.

## Candidate identity

Populate for every candidate, never copy values from the old 1.1.2 installer:

```text
Source commit and clean/dirty status:
Version + candidate/build id:
Lockfile hash / build command / Node-pnpm-Electron versions:
Installer path + SHA256 / installed executable path:
Windows edition/build / CPU / RAM / GPU / power mode:
Display layout + DPI + taskbar placement:
Input/output device + driver / provider-model-voice aliases:
Test profile (isolated clean / migrated clone / owner-approved real):
Test timestamp / tester / source or packaged mode:
```

No credentials, raw audio, transcripts, private browsing content or copied profile
files go into committed evidence. Export diagnostic metadata through redaction;
keep private recordings/screenshots local if they contain personal information.

## Acceptance matrix

All **Phase 7 results are pending** until evidence is recorded against a candidate.
Existing source tests are useful regression coverage, not a pass for these rows.

| Gate | Repeatable scenario | Required outcome/evidence |
| --- | --- | --- |
| UX-01 | Fresh install; name/skip; interests; voice audition; real small task | Minimal first-run setup after installer; Matrix welcome; no fake trial; actual provider/voice identified. |
| UX-02 | Relaunch quickly, return same day, return next day, cross midnight while active | No repeated first-run setup or repetitive daily greeting; persisted preferences preserved. |
| UX-03 | Wake, hover, move into panel, click/type, Escape, reopen, compact/full | Bottom-right work-area anchor; no hover/wake focus theft; real composer; same draft/conversation/task and restored full bounds. |
| UX-04 | Ask ordinary question in compact while research runs | Reply stays compact; no automatic Chat/full navigation; rapid turns not overwritten. |
| UX-05 | Genuine question then silence/typing/speech; bare wake silence | Choices once after 8 seconds following completed question; cancelled by input; no invented choices on bare wake. |
| UX-06 | Reduced motion, 200% text/DPI, keyboard/IME, screen reader, touch | No clipped controls; visible focus; caption/state not color alone; typing works without hover or mic; no motion loops when disabled. |
| UX-07 | Voice joke/check-in; DND; ignored invitation; busy fullscreen app | Orb/caption enough; no unwanted panel; DND holds unsolicited speech; no claims of sensed emotion. |
| VO-01 | At least 20 addressed wake+command trials per selected device; quiet and normal room noise | No missing first words or duplicate dispatch; report success count/latency, not just recognizer-ready. Test speakers and headphones. |
| VO-02 | Speak over response; stop talking; cancel named research; follow-up | Old audio/generation stops; task continues unless named cancel; follow-up stays bounded; echo does not trigger itself. |
| VO-03 | Mute/unmute, denied mic, unplug/replug, default-device change, sleep/lock/resume | No capture when disabled/locked; clear recovery, no busy loop/cloud-monitor fallback; local controls/typing remain usable. |
| VO-04 | Listen to greeting/joke/work update for 3 available voices | Owner/Larry chooses acceptable natural English output on real device. An automated score cannot approve taste. |
| OP-01 | Open requested browser/app during a live research/build task | Direct launch needs no planner call or repetitive confirmation, independent task continues. Unknown app target is not invented. |
| OP-02 | File create/read/organize, reminders, clipboard, screenshot, configured workflow | Real observed outcomes, scoped prompts only when needed, existing data preserved, denied/unsupported cases accurate. |
| OP-03 | Named window/media controls with competing foreground task | Correct target observed before action; lease prevents wrong-window input; no UAC/security bypass. |
| RE-01 | Research question requiring multiple independent sources, save report | Actual retrieved supporting sources; citations open safely; saved artifact verified; unsupported/blocked source labeled. |
| RE-02 | Hostile webpage/instruction, cross-origin redirect, download/login request | Content cannot change tool authority; scope enforced; no secret/cookie transfer or silent private-network access. |
| WB-01 | Create business site, preview at 360/768/1280 widths, revise while preserving manual edit | Actual responsive files and interactions; revision conflict/snapshot handled; no invented “deployed” state. |
| WB-02 | Interactive site with malicious script/dependency/path attempt | Isolated preview cannot reach host IPC/secrets/files; build can't run arbitrary install hooks; original static verifier unchanged. |
| WB-03 | Publish approved revision, visit result, revise+publish, timeout/restart, rollback | Correct account/target/content verified with receipt; no duplicate external effect; prior version recoverable where supported. |
| RC-01 | Two disjoint tasks; conflicting files/windows; cancel one; delayed stale reply | Independent work persists; conflicting resource queues; stale reply cannot complete/speak/update cancelled task. |
| RC-02 | Crash after intent, after side effect, before result checkpoint; restart | Verified completion not replayed; uncertain effects reconciled or surfaced; no blind publication/send retry. |
| RC-03 | Network loss, provider 401/429/timeout, gateway/worker crash, audit/disk failure | Bounded retry; safe fallback only; accurate partial/unknown state; UI/stop/local read-only recovery remains responsive. |
| DT-01 | Real legacy-profile clone migration and interruption at every secret-migration stage | Providers/model metadata/tasks/grants/memory intact; no new plaintext copies; encryption unavailable fails without deleting keys. |
| DT-02 | Inspect/correct/delete/export memory; account sign-out/deletion | No unrequested full-history relationship memory; deletion scopes are clear; no plaintext token/PII in logs or diagnostics. |
| CO-01 | Direct, conversation, worker, STT/TTS, cron, retry and failure samples | Every paid attempt has correlation/outcome/cost or explicit unknown; direct and idle paths incur no model calls. |
| CO-02 | Economy vs stronger route on matched tasks; escalate/cancel | Report quality/success, p50/p95 latency and cost per successful task including failures; no silent account switch. |
| MS-01 | Live login → eligible trial → task → speech → receipt; restart/logout/expiry | Real service identity/provider responses and held/settled allowance; token never exposed to renderer; BYOK still works independently. |
| MS-02 | Concurrent cap use, duplicate/unordered payments, refund/revoke, backup/restore, account deletion | No overspend/double dispatch, server-owned entitlements, reconciled billing and real operator recovery. |
| PK-01 | Clean install without dev tools, offline first run, upgrade cloned old profile, uninstall/reinstall | Bundled runtimes work; paths/spaces/non-ASCII valid; no lost data; uninstall retention honored; no old candidate mistaken for new. |
| PK-02 | Single/multiple monitors, negative coordinates, 100/125/150/200% DPI, taskbar variants, RDP/sleep | No off-screen orb/panel, no stolen focus, no duplicate capture/worker after resume. Document unavailable hardware explicitly. |
| PK-03 | 60-minute mixed-use run + idle samples; exit with worker/audio active | No leaked listeners/windows/processes or runaway memory; cancelled children exit; predictable session recovery. |
| RL-01 | Signed installer and authorized update feed; tampered package; interrupted update/rollback | Publisher verified; tamper refused; profiles survive; old ClawX feed never enabled. |

## Performance targets (engineering targets, not achieved claims)

Record baseline on the actual target PC before optimization. Use at least 30
samples for local latency p50/p95, report cold and warm separately. For paid
voice/model tasks start with 10 bounded trials and raw distributions; do not call
the p95 stable until sample count is adequate. Report network/provider delays
separately from local latency. Measure total application process tree, not only
the renderer. Keep instrumentation content-free and monotonic-clock based.

| Metric | Initial gate/target | Measurement boundary |
| --- | --- | --- |
| Hover or click feedback | p95 <=100 ms after event/dwell completes | Native event received → first visible state; dwell separately reported |
| Local direct command dispatch | p95 <=250 ms, including one heavy task running | Validated input received → OS adapter dispatch; app's own load time separate |
| Audible interruption | p95 <=150 ms after local barge-in/stop detection | Detector/control event → playback silence; speech-detection delay separately reported |
| Active animation | Target 60 fps; p95 frame interval <=20 ms on reference hardware | Native active presence, 30-second traces; reduced-motion mode has no recurring effect loop |
| Idle cost | Zero model requests; <=1% total CPU unarmed, <=2% locally armed target | 5-minute settled averages over process tree, normalized to total CPU capacity; no active jobs |
| Warm UI availability | Target <=1 s | Launch → responsive input/presence, independent of Gateway readiness |
| Cold UI availability | Target <=3 s on recorded reference PC | Process start → responsive input/presence; runtime/browser warm-up separately reported |
| First audible response | Target <=2.5 s median / <=4 s p95 on chosen live route | End of user utterance → actual playback; report STT/reasoning/TTS contributions and success rate |
| Memory stability | No monotonic growth; settled post-soak footprint <=10% above warmed baseline | Same process set/workload, caches bounded; choose a MB ceiling after baseline rather than invent one |

Do not meet an animation/CPU budget by breaking wake detection, dropping final
events, hiding failures or reducing real output quality. Hidden visual loops can
pause while the explicitly enabled audio owner stays alive. Define a supported
reference hardware floor from evidence before advertising speed. Investigate each
miss; adjustments require recorded rationale, not silently lowered gates.

## Commands and evidence rules

At final candidate, from a verified clean checkout:

```powershell
pnpm install --frozen-lockfile
pnpm run ext:bridge
pnpm run typecheck
pnpm run lint:check
pnpm test
pnpm run comms:replay
pnpm run comms:compare
pnpm run harness:ci
pnpm run build:vite
pnpm exec playwright test --workers=1
pnpm run security:check
pnpm run package:win
```

Inspect each command's exit code/results. Run tests in their intended isolated
environment; review tests that need live credentials before executing them. A
full E2E suite skip or unsupported host is recorded, not treated as a pass.
Packaging downloads/bundles dependencies; it does not publish (`--publish never`
in the current Windows script). Choose a new candidate id/version deliberately;
do not run release/version scripts that push tags or publish as a routine test.

Installer acceptance uses the resulting package and isolated Windows test profile
or VM first. Profile upgrades use synthetic legacy secrets or an OS-protected
backup envelope for real data; do not create new plaintext credential copies.
Never erase the owner's real profile to simulate clean install. Manual real-device tests are scheduled with
the owner and must not silently activate their mic or publish a website.

For each gate record `source-only`, `fixture`, `native-automated`, `manual-hardware`,
or `live-provider/service`, source SHA, actual result, evidence path, date and
remaining limitation. Source builds do not prove installer behavior. Auth fixtures
do not prove live login; a deployment receipt alone does not prove content served.

## Release decision

- Larry candidate: UX/VO/OP/RE/WB/RC/DT/CO and PK gates pass for advertised Windows
  features, including human voice acceptance. Managed incompleteness is disclosed.
- Public BYOK: candidate plus RL, security/dependency review, support/privacy docs
  and approved distribution. No implied managed trial/subscription availability.
- Public Premium: public gates plus MS and operational/payment setup pass. All
  advertised supported paid paths are metered and enforce the allowance.
- Any credential-loss, unapproved action, duplicate external effect, fabricated
  completion or uncontrolled-spend defect blocks release. No arbitrary number
  of passing tests waives these failures.
- NerdGPT and platform expansion are excluded by explicit product decision, not
  silently marked complete. A full Phase 7 claim identifies the accepted release
  scope and the exact candidate; “bulletproof” is not a verifiable claim.

## Evidence ledger

2026-09-30: documentation/architecture pass only. Current application baseline is
`32badea9`; historical source evidence is linked in the execution plan. No new
package, live paid workflow, acoustic trial or Phase 7 gate pass is asserted.
Append implementation records here or link a compact per-candidate evidence file.

### 7A.1 source checkpoint — 2026-09-30

- Baseline source: `fa988f06`; the linked `morpheus-phase7` worktree is uncommitted
  while A.2/A.3 work proceeds. Label: **source-only and fixture**, not packaged or
  live-provider acceptance.
- Main now projects selected conversation, revision-checked local draft, correlated
  admissions and a bounded pending delivery snapshot. Duplicate request ids return
  their prior admission; changed text/conversation rejects; stale, duplicated and
  gapped result events cannot publish into the projection. The legacy renderer
  handoff uses a bounded FIFO instead of one overwritable slot.
- Focused unit tests: 10/10 in assistant-session/operator-store; adjacent API,
  chat-input and voice-store regression tests: 92/92. Node and Web typechecks
  passed after extension bridge generation. `git diff --check` showed no
  whitespace errors. No paid calls, credentials, hardware, package or acoustic
  trial were used.
- Harness validation remains to be rerun against the combined checkpoint: the
  narrow A.1 harness spec rejects unrelated A.2/A.3 dirty files in the shared
  worktree. The Phase 7 umbrella and
  the exact checkpoint diff must be checked before commit. A.1 does not close UX-03,
  UX-04, RC-01, package or live gates.
- Next: finish 7A.2 native composer and 7A.3 compact reply continuity, then run
  fresh-build Electron evidence on the combined source. Existing profiles and
  provider settings were not changed.

### 7A.2–7A.3 combined source/native-automation checkpoint — 2026-09-30

- Starting source: `fa988f06` on the authorized application branch; implementation
  was built in a separate linked Windows worktree. Main owns bounded assistant
  admissions and drafts. The sandboxed native orb has a fixed sender/frame-checked
  snapshot/draft/admit/presentation bridge, not generic host/Gateway access.
  Hover remains inactive, explicit click focuses real text input, Escape preserves
  the Main draft, and duplicate request IDs admit one turn. Native hit shape excludes
  transparent gaps. Typing remains available with ambient microphone disabled.
- Ordinary questions now use the existing ACP conversation owner. The native
  bottom-right compact window displays the fixture reply without `/chat` navigation,
  while the same draft/reply survives explicit full expansion and dismissal. The
  existing Chat page and Objective Core remain separate, reachable owners.
- Verification after the fresh Vite/Electron build: Node/Web/managed typecheck
  passed; lint passed with 12 existing Fast Refresh warnings and no errors;
  communications replay and compare passed; Phase 7 umbrella harness validate
  and dry-run passed, all three narrow specs validated structurally, and harness
  CI passed (18/18 tests). Full Vitest suite passed: **284 files, 2,872 tests,
  2 skipped**. The initial broader run exposed three outdated translation mocks;
  these were fixed and the whole suite rerun green. Two focused Windows Electron
  journeys (native orb and compact conversation) passed, plus 11 related routing,
  Chat-presence and reduced-motion journeys. The first compact test run also caught
  a React render loop from an uncached empty selector; it was fixed before the
  fresh rebuild and passing reruns.
- Local native screenshots: `phase7-evidence/native-wake-orb.png`,
  `native-orb-hover-composer.png`, `native-orb-editable-draft.png`,
  `native-compact-command.png`, `native-compact-reply.png` in the parent workspace
  beside the isolated worktree. Tests can recreate them; they do not contain
  credentials and are not a packaged-app recording. No paid provider call,
  live microphone, hardware voice audition, installer build or profile migration
  was used. UX-03/04 and package/live gates remain open despite source automation.
- Next: 7A.4 shared motion and real ephemeral mic/playback level with hidden/reduced
  motion controls, then 7B.1 protected provider-secret migration. The original PC
  checkout and user profile/provider settings were not modified.

Documentation checkpoint validation: Phase 7 spec validation and dry-run passed;
18 harness unit tests passed across 2 files. All 21 relative Markdown links in the
7 new documents resolved. All 9 referenced harness rules exist. Git whitespace
check passed. Dry-run intentionally skipped application build/type/lint/tests;
these results certify the handoff structure, not the implemented product.
