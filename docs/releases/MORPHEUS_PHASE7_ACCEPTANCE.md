> **Current acceptance, 2026-10-02:** owner rejected installed preview.5. The
> [experience specification](../design/MORPHEUS_EXPERIENCE_REVIEW.md) and single
> [Windows checklist](WINDOWS_COMPLETION_CHECKLIST.md) govern current A-E work.
> This ledger preserves historical evidence; automated/source results do not close
> observed product failures or physical/live gates.

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

### 7A.4 shared motion source/native-automation checkpoint — 2026-09-30

- Starting source: `416b47a5` in the isolated Windows worktree. One local M/orb
  artwork and CSS motion recipe now serve native and React presence. Idle uses a
  quiet halo; working/listening/speaking use restrained green motion; attention
  and error add a visible `?`/`!` cue and accessible state labels. The Main-owned
  typed bridge accepts only a finite 0–1 visual scalar, never audio or transcript.
  Main coalesces positive updates to at most 20 Hz, flushes the latest value,
  rejects duplicate zeros, and clears level when speech/capture ends. Capture
  and neural playback feed real RMS; if `captureStream()` is unavailable or the
  Windows speechSynthesis fallback is used, the level remains zero rather than
  rerouting audible output or fabricating a waveform.
- Hidden native and Main windows receive explicit visibility signals because
  Electron can leave `document.hidden` false. React orb, legacy Signal and Matrix
  rain pause visual work while hidden; optional background audio ownership is
  independent. Reduced motion removes flowing/pulsing animation and audio-driven
  opacity flicker. The narrow [shared orb motion task](../../harness/specs/tasks/morpheus-phase7-shared-orb-motion.md)
  validated against the exact diff; its dry-run passed rule checks but did not
  execute application tests. A separate review found and the source addressed
  trailing-level, duplicate-zero, audio-route and hidden/reduced-motion defects.
- Fresh Vite/Electron source build, Node/Web/managed typecheck, communications
  replay/compare and lint passed (0 errors, 12 existing Fast Refresh warnings).
  Focused unit tests passed **70/70**; full Vitest passed **284 files, 2,882 tests,
  2 skipped**. Harness CI passed **18/18**. Fourteen selected Windows Electron
  journeys passed after rebuilding, including native/React shared CSS/artwork,
  keyboard focus, scalar bridge reset, reduced motion, hidden Main/native pause,
  guarded Main-hide-to-orb handoff, compact replies and related Signal/arrival
  regressions. Earlier failed exploratory runs identified hidden-visibility and
  CSS-specificity/test-order bugs; the final fresh-build reruns are green.
- Native source-build screenshots reviewed under the parent workspace
  `phase7-evidence/shared-motion-native-idle.png`,
  `shared-motion-native-attention.png`, `shared-motion-native-level-fixture.png`
  and `shared-motion-react-compact.png`. The scalar screenshot uses a test input,
  **not** a recorded microphone or speech sample. No short motion recording,
  real microphone/monitor audition, actual tray-hardware transfer, packaged
  installer/resource validation, frame-rate measurement, paid call or live model
  result was obtained. UX-06, VO and PK gates remain open. No user profile or
  provider setting was changed. Next: 7B.1 secret migration and crash fixtures
  before any paid live-path test.

### 7B.1 protected provider secrets — partial source checkpoint, 2026-09-30

- Label: **source implementation in progress; no 7B.1 or DT-01 acceptance**. The
  linked worktree adds an app-owned, versioned Electron `safeStorage` vault for
  static provider keys. Per-account migration validates legacy records, writes
  the encrypted destination atomically, decrypts and compares it, then removes
  only matching plaintext fields. A non-secret expected-vault marker detects a
  missing encrypted file; conflicting or malformed legacy records fail with
  recoverable errors before that account is migrated. Deletion uses a tombstone
  to prevent an interrupted operation from reviving a legacy key. New app-owned
  key writes do not recreate the old plaintext copies.
- The legacy storage adapter now propagates protection and decryption errors
  instead of returning an absent key. Provider account metadata is saved only
  after a protected key operation succeeds; app-owned keys take precedence over
  imported OpenClaw credentials where both exist. Focused synthetic store,
  adapter and provider-service tests passed **33/33** across three files. Those
  fixtures cover interruption/restart, conflict, unavailable protection and
  missing-vault behavior; they do not use the owner's real profile.
- The candidate OpenClaw static-key SecretRef/runtime path, image-relay
  protected save, OAuth startup replay guard and SQLite-authoritative profile
  merge are implemented in source. Combined full typecheck, lint (0 errors;
  12 existing Fast Refresh warnings), 178 focused tests across 11 files,
  communications replay/compare, and narrow harness validation/dry-run passed.
  The first full unit run exposed one stale mock expectation; after correction,
  a full rerun passed **2,911** tests with two skipped across 286 files. A fresh
  Vite/Electron build succeeded and its isolated provider-lifecycle automation
  passed **7/7** journeys. No owner-profile legacy upgrade, packaged build,
  live provider or paid call was verified. Existing user profiles and provider
  settings were not changed.
- Scope limit: upstream-managed OAuth token storage is separate from the
  app-owned static-key vault. Adding or replacing an app-owned static key may
  need an owned Gateway restart to refresh its child-process environment; an
  attached Gateway is not restarted by the app. At the time of this September
  source snapshot, raw `openclaw.json` rotation recovery was still open;
  unprovenanced
  legacy image-relay credentials remain untouched. The upgrade snapshot stays
  plaintext until an owned Gateway reaches readiness. Do not claim all provider
  credentials or runtime copies are encrypted. Next: add exact-match pre-commit
  and pre-spawn reconciliation with crash fixtures, then run the exact
  [7B.1 task spec](../../harness/specs/tasks/morpheus-phase7-b1-provider-secret-migration.md)
  and combined checks, then perform a protected Windows restart and safe
  existing-profile upgrade rehearsal before DT-01 or 7B.1 acceptance.

### 7B.1 source continuation — 2026-10-01

- Label: **source checks passed; B.1 and DT-01 acceptance still open**. A
  protected old key is reconciled to a stable runtime env reference before
  replacement, and every owned Gateway launch exact-matches old raw
  `openclaw.json` and per-agent `models.json` values against protected keys
  before spawn. A conflicting/imported value is preserved and blocks ambiguous
  launch; an unavailable protected store does not silently fall back to raw
  credentials. Sequential atomic file writes are idempotent after interruption.
  OAuth startup synchronization no longer replays an older app token over a
  present OpenClaw token. Synthetic rotation, conflict, restart and delete
  fixtures were added; the original checkout/profile was untouched.
- Image-relay rotation now converts exact old auth/config/model keys before
  replacing the protected value; an owned Gateway that cannot restart with
  the old key aborts replacement. A first protected key rejects conflicting
  legacy credentials, while an explicitly re-entered exact key can be adopted.
  Pre-spawn reconciliation retries image auth-profile cleanup if interrupted.
  Older relay auth profiles have no reliable ownership marker, so untouched
  unverified raw keys are not silently imported or described as protected.
- Latest combined verification: full typecheck passed; lint had zero errors
  and 12 existing Fast Refresh warnings; full unit suite **2,925 passed, two
  skipped, 287 files**; communications replay/compare passed; narrow B.1
  harness validation/dry-run passed; fresh Vite/Electron build passed; isolated
  provider-lifecycle Electron journeys **7/7**. The added relay and pre-spawn
  tests are included in that full rerun. A separate Windows Electron
  E2E used a synthetic key in an isolated test profile, verified encrypted
  ciphertext lacked the key and decrypted it after same-user app relaunch
  (**1/1**). This is source-build evidence, not packaged or real-profile proof.
- Final-review source fixes now select one stable enabled account per runtime
  provider (explicit default first), preserve sibling vault keys, activate
  current OAuth without replaying stale tokens, and avoid exporting unrelated
  SQLite-only credentials into compatibility JSON. Key/vendor deletion removes
  exact owned refs before the protected value and refreshes the owned child's
  environment afterward. Changed-secret refreshes serialize without ordinary
  cooldown suppression; unchanged owned environments are successful no-ops.
  Protection deletion failures are reported rather than hidden.
- Final combined B.1/C.1 source check on October 1: **2,959 passed, two skipped,
  288 unit files**; full typecheck; lint (zero errors, 12 existing warnings);
  communications replay/compare; umbrella diff-aware harness validation/dry-run
  and 18 harness regressions; fresh Vite/Electron build. Provider journeys
  passed **8/8**, including a copied synthetic legacy secret profile migration,
  metadata/default preservation, plaintext cleanup and same-user Windows
  DPAPI decryption after restart. No owner profile or paid API was used.
- Remaining: verify packaged upgrade and live-provider behavior, and handle
  upstream OAuth/unknown legacy image-relay credentials without false
  protection claims. Transient upgrade snapshots can contain plaintext until
  owned Gateway readiness. A final Windows installer `.exe` has not been built
  or handed over at this source checkpoint; packaging uses a spacious checkout because C: had only
  about 2.1 GiB free (D:/E: had ample space). No paid API call occurred.

### 7C.1 wake/capture source automation — 2026-10-01

Local addressed wake-plus-command passes a bounded ephemeral suffix through Main,
audits before emission and dispatches once through the existing route without a
second STT call. Pending mic acquisition cancellation, capture-admission recheck,
device-loss cleanup and localized recovery (en/zh/ja/ru) preserve typing/local work.
59 focused tests, full typecheck, focused lint, communications checks and narrow
diff-aware harness validation/dry-run passed. A fresh build passed six selected
Electron voice journeys, including duplicate wake-event suppression/zero extra
capture/STT and localized missing-input recovery. Native screenshot is retained
under ignored test-results, not treated as actual microphone evidence. Details:
[C.1 source evidence](phase7-c1-source-checkpoint.md).

On the actual Windows host, the installed English System.Speech engine also
loaded the addressed wake-plus-dictation grammar successfully without opening
a microphone. This validates local grammar compatibility, not speech accuracy.

This establishes source/native-fixture behavior only. Actual System.Speech accuracy,
speaker echo, mute/lock and unplug/replug on physical devices, voice listening
quality and the exact packaged candidate remain unverified. No paid call, real
provider key or owner profile was used. Next source checkpoint is C.2 bounded
neural auditions/no-speech checks; build a fresh internal Windows installer.

### 7C.2 bounded neural audition and silence source checks — 2026-10-01

The three existing neural voice choices now audition a bounded greeting, light
joke and explicitly labelled example update, localized in four languages. Each
click remains one speech request with Windows fallback forbidden. 21 focused
audition/player/dialogue/playback units, web typecheck, changed-file lint,
communications and narrow harness checks passed. One Electron journey used a
zero-valued synthetic MediaStream with production Chromium analyser/recorder/VAD:
the no-speech timeout released input and emitted no provider/task request.
Details: [C.2 source evidence](phase7-c2-source-checkpoint.md).

This is not a human neural audition, physical mic, ambient-hours cost measurement
or speaker-echo/barge-in result. Those exact packaged/live gates remain open.
The final package build must include the new locale samples. No paid calls or
owner-profile changes occurred; Phase 7 remains incomplete.

### Internal package and C3 source checkpoint — 2026-10-01

Internal installer source `6e19fadc49b94dd014c1b9f22cc6e717bf748a3a`, version
1.1.2, built with `package:win --publish never` in the isolated E: checkout.
Installer: `E:\Morpheus-builds\phase7-20261001-prepare-0120\candidate\release\Morpheus-1.1.2-win-x64.exe`.
SHA256: `70D4584E2CDCC15B0A847DCCF5C65F01CA32524C02864AF39A18471A743C119B`.
Windows Authenticode result is `NotSigned`. Final source suite at that revision
passed 2,966 tests, two skipped. Packaged payload smoke used reduced E2E startup,
isolated synthetic profiles, actual Main provider routes and Windows protected
storage; restart/delete passed. This does not prove a real NSIS installation,
owner-profile upgrade, physical voice or normal full Gateway startup. C3 is
excluded from this installer; a final updated installer remains required.

C3 subsequent source verification: 177 focused unit passes, all three typechecks,
lint zero errors/12 existing warnings, fresh build and seven Windows journeys
(returning DND/daily, task answer continuity, full setup/profile/quick restart,
four locale name-skip/reduced-motion journeys). Communications replay/compare,
diff-aware harness validation/dry-run passed. Details and source limits:
[C3 checkpoint](phase7-c3-source-checkpoint.md). Next C4 → D–I. No paid API calls
or owner-profile changes. Phase 7 remains incomplete.

Earlier Astra documentation checkpoint validation: Phase 7 spec validation and dry-run passed;
18 harness unit tests passed across 2 files. All 21 relative Markdown links in the
7 new documents resolved. All 9 referenced harness rules exist. Git whitespace
check passed. Dry-run intentionally skipped application build/type/lint/tests;
these results certify the handoff structure, not the implemented product.

### C4/D1/E1/F1 integration and G2 foundation — 2026-10-01

Base `8115f199`, same isolated Windows worktree and authorized application branch.
No owner profiles, credentials or original PC checkout changed; no paid API calls.

- Full source suite: **3,083 passed, two skipped, 302 files**. Initial integration
  found five failures (compound explicit memory, typed host handlers, action
  examples); fixes passed focused reruns and the complete boundary suite. The
  skips are the macOS JXA enumeration and non-Windows placeholder in
  `attachment-open-with-native.test.ts`, not counted as passes.
- All three typechecks, fresh build and lint pass (zero errors, 12 pre-existing
  warnings). Unit environment still reports canvas stubs and listener warnings;
  these are not live Electron/microphone acceptance.
- Seven fresh Electron memory/native check-in journeys pass, including actual
  Main export/correction/deletion and quiet native caption with no forced window,
  keyboard/reduced motion and en/zh/ja/ru.
- The site journey caught a real missing preview affordance in the simplified
  workspace. Restored result controls now pass four localized actual-Main
  verify/revise/preview/rollback/conflict journeys, rendered at 1024/390 widths,
  plus restored-site preview regression. Original static safety remains intact.
- F1: 92 focused app-discovery/files/reminder/workflow/runtime units pass. No
  executable fixture was run and no real installed-app acceptance is claimed.
- D1: bounded HTTPS source observations, authority/worker identity, independent
  native work, cancellation and recovery pass the combined suite. Full DOM
  browser, cited synthesis and report delivery remain D2/D3.
- G2: managed server routes/bridge/receipts pass fixture tests. Three existing
  account Electron regressions pass. The subsequent Main/UI readiness guard keeps
  activation unavailable until actual planner/conversation/voice integration;
  31 focused bridge/harness units, two readiness-guard units and three fresh-build
  account journeys pass after the guard. No live server,
  trial, billing or end-to-end managed runtime is claimed.
- Communications replay/compare and umbrella diff-aware harness validation/dry-run
  pass. Evidence screenshots are in ignored `test-results/c4-native/` and
  `test-results/e1-settled-preview/`; logs are in the host's temporary directory.
- Final visual review caught the HTML guest behind the modal sheet despite a
  loaded DOM. Modal-scoped placement and stale-navigation suppression fix it;
  seven host units and five fresh site journeys pass, including topmost/accessible
  guest and zero-error-toast assertions. The final screenshot was visually checked.
  These readiness/preview deltas follow the full 3,083-test boundary; final-candidate
  full-suite/package checks must include them.

Next: D2 interaction worker, D3 source-grounded reports, E2 interactive templates,
E3 publication, F2 desktop controls, G runtime/billing joins, H reliability/perf
and fresh I installer/acceptance. The old `6e19fadc` installer is not this code and
must not be handed over as the completed version. External gates remain unchanged.

### D2.1 isolated public Chromium foundation — 2026-10-01

C4/D1/E1/F1/G2 integration was committed/pushed as `f0f2b11c`. The subsequent
D2.1 boundary passes 19 network units, all typechecks, scoped lint and two actual
Chromium journeys (observed DOM actions, keyboard navigation, stale controls,
restricted requests, deadlines and owned-resource cleanup). Source module is
bundled into the test app's Main; network payloads/DNS are deterministic fixtures.
No live account/site, paid call, native installer or Core capability integration
is claimed. See [D2.1 evidence and next work](phase7-d2-browser.md).

### D2.2 Core public-browser integration — 2026-10-01

Public inspect/interact now run through the existing permission/audit/worker and
bounded planner-review owners. Task/generation ownership, stale controls, unknown
effects and cleanup are enforced. Readable result presentation hides internal ids.
All 3,112 unit tests passed (two inherited skips, 304 files), 118 focused units,
seven fresh Windows journeys, typechecks, scoped lint, build, comms and diff-aware
harness checks passed. See [D2 evidence](phase7-d2-browser.md) for fixture scope.
No live account, paid calls or new package acceptance. Next: D3 cited research;
account-session support and final-candidate tests remain open.

### D3 source-bound research/report checkpoint — 2026-10-01

After D2.2 `7a64592c`, actual retrieved source observations feed bounded synthesis
and a normal permission-gated file plan. Main rejects invented citation ids;
denied/failed/missing saves do not complete. A real Core/adapter/provider-protocol/
filesystem fixture creates a report while an independent app command remains free.
Four fresh localized Windows journeys cover readable source cards, actual saved
Markdown preview, safe external citations, keyboard and reduced-motion behavior at
desktop/narrow widths. Source/citation open calls are intercepted; no live source
or paid model was used. Final preview screenshot was visually inspected.

Full regression: **3,145 passed, two inherited skips, 307 files**. All typechecks,
scoped lint, build, communication checks and diff-aware harness validate/dry-run
passed. See [D3 evidence and limitations](phase7-d3-research.md). The existing EXE
still excludes these changes. Next: E2 interactive client-site creation/preview.

### E2 client-interactive website checkpoint — 2026-10-02

The existing Core/provider/workspace policy creates a real six-file pinned client
project; no generated code or package hooks execute. Separate ephemeral preview
checks the approved workspace, disk revision and audit before serving verified
memory assets with no host privileges or external network. Real filters, FAQ and
local-only form validation work; UI labels do not imply delivery or publication.
Artifacts restore their interactive identity from real audit history. Static
verification/revision/local HTML preview is not weakened.

Full regression: **3,174 passed, two inherited skips, 309 files**. All three
typechecks and changed-file lint pass (one existing SupportedActions fast-refresh
warning). Fresh build and communications replay/compare pass. Five new Electron
journeys pass, including four locale create/preview/reload/edit-conflict paths.
Combined run: eight passed, one older Russian static-preview mount timed out;
that exact scenario passed in a subsequent isolated run without source changes.
Treat this intermittent mount as a final-package reliability watchpoint, not a
universally clean combined campaign. Desktop/narrow screenshots were inspected.
No live model/publication/profile or newly built installer acceptance is claimed.
See [E2 details and limits](phase7-e2-interactive-sites.md). Next: E3, F2, G/H/I.

### Existing-agent continuity follow-up — 2026-10-02

After E2 `ebe8e537`, complete known historical starter definitions are upgraded
in memory; customized permissions, planner choices and unknown variants remain
unchanged. Loading does not rewrite disk or issue grants. This corrects the old
unconditional offline-to-auto override for built-in ids. Ten focused profile/Core
tests and Node typecheck pass. See [scope/evidence](phase7-profile-continuity.md).
Owner profiles remain untouched; final copied-profile/package acceptance is open.

### E3.1 publication adapter foundation — 2026-10-02

After profile continuity `3292c4e6`, 21 publication adapter/snapshot/HTTP/transport
tests pass (56 with adjacent source/profile/Core tests), plus Node typecheck and
scoped lint. Tests use fixture GitHub/API/HTTP responses: no real account/token or
publication was used. Exact target/head/content, remote-edit rejection, non-force
write, lost-response reconciliation, previous-version rollback bytes, public HTTP
digests/MIME and token diagnostic isolation are covered. This is NOT app-integrated:
E3.2 protected connection, approval UI and durable receipts remain next. See
[E3 scope/continuation](phase7-e3-publication.md). No new EXE acceptance claim.

### E3.2 publication integration — 2026-10-02

Existing interactive artifacts now join Main-owned protected connection, exact
five-minute user approval, flushed write-ahead receipts, non-force update,
read-only recovery and reviewed rollback. Full source regression: **3,217 passed,
two inherited skips, 311 files**. All typechecks, scoped lint, build, communications
and diff-aware E3 harness checks pass. Four fresh-build locale journeys use actual
Main/Windows protection/persistence with injected network bytes; restart after a
lost response does not republish. Opaque desktop/compact dialog screenshots checked.
No real repository/account/paid call or final package was exercised. E3 source is
automated; live deployment and final installer acceptance remain open. See
[exact scope, recovery and evidence](phase7-e3-publication.md). Next is F2, G/H/I.

### F2 Windows controls — 2026-10-02

Source after E3 `95167aeb`: typed named window/Spotify/default-output controls,
deterministic no-model commands, exact target/state checks and localized short
confirmations. Final suite: **3,258 passed, two inherited skips, 313 files** in
61.40 seconds. Three typechecks, scoped lint (zero errors, one inherited warning),
communication replay/compare and diff-aware F2 harness validation/dry-run pass.
Four fresh-build native journeys pass in **29.4 seconds**, with real owned-window
effects and read-only Windows audio discovery. 1280×800/430×740/reduced-motion
screenshots inspected. No user applications/documents/playback/volume were altered.

C: scratch exhaustion required E: scratch; that exposed and fixed a pre-existing
cross-drive log path guard. Initial failures and final evidence are recorded in
[F2 details](phase7-f2-desktop-controls.md). Real media effects, installed-app,
hardware/performance and newly packaged acceptance remain open. Next: G1/G2
runtime joins and usage; H/I. No full-version or new-EXE acceptance is claimed.

### G2.1 managed planner join — 2026-10-02

After F2 `068dc9c2`, Main injects the managed getter into Core selection.
Managed and BYOK share typed plan/review validation; managed selection resolves
before BYOK keys, binds objective/generation/budgets and records correlated
receipt amounts. Invalidation aborts text/STT dispatch and session-resolution
races. **47 focused units**, three typechecks, scoped lint (zero errors), comms
and diff-aware harness checks pass. Three fresh-build account regression journeys
pass in **10.7 seconds**. Provider replies/auth are fixtures, not live services.
The last full suite was F2 (3,258 + two skips); it has not been rerun for this
checkpoint. See [G2 joins](phase7-g2-runtime-joins.md). Voice/conversation joins
remain next and activation is still disabled, not silently routed to personal keys.

### G2.2 managed voice join — 2026-10-02

Existing capture, Main voice and playback owners now consume managed routes with
canonical sample-derived input, bounded streamed output, shared persona delivery,
correlated receipt usage and account-generation cancellation. Personal settings
are preserved, and managed failures never fall back to personal keys/robot speech.
**3,292 units passed + two inherited skips (318 files)**; all typechecks, zero-error/
warning scoped lint, comms and fresh build pass. Seven native fixture journeys pass
in **32.1s**, including four locale voice capture/playback/invalidation paths with
synthetic input and muted output. Actual gateway/client/voice code runs with
injected upstream responses. Hardware/taste/live service/package are not established.
Read [the scope, initial failures and evidence](phase7-g2-runtime-joins.md).
G2.3 original conversation join is next; activation remains guarded. No new EXE yet.

### G1.1 offline usage evidence — 2026-10-02

Matched settled Core/STT/TTS managed charges now remain separate from runtime
estimates and unknown spend. Cancelled transcription is counted. Ten script tests
pass; contradictory/unmatched/invalid receipts cannot imply known cost or a complete
cap. [Remaining paid-path/live qualification gaps](phase7-g1-usage.md) are explicit.
Proceed to H/I on the roadmap's BYOK candidate track; managed G2.3/G3/G4 are still
required for managed-ready acceptance. No live spend or new installer in this pass.

### H native fixes / I installation preparation — 2026-10-02

Native presentation now acknowledges applied editability; Escape does not reopen
from stationary-pointer resize; reload restores visible state. Six final native
journeys pass, including four locales/reduced-motion screenshots and compact/full
continuity. Five legacy device journeys now assert the current task surface and
pass; the initial broad run was 42/48, not a full pass. Details and the first warm
30-sample click/hover baseline are in [H evidence](phase7-h-native-readiness.md).

The inherited installer cleanup was narrowed to checked literal targets, retained
rollback/failed-extraction folders and no process killing or profile deletion.
32 focused tests include actual PowerShell fixtures. Full suite: **3,298 passes,
two inherited skips, 319 files, 62.04s**. Three typechecks, zero-error scoped lint,
comms replay/compare and fresh source build pass. Existing canvas/listener warnings
are unit-harness output, not a measured app-leak result.

[I preparation](phase7-i-windows-candidate.md) records the changed installer scope.
Version is now `1.2.0-preview.1` to distinguish the new candidate from the old 1.1.2.
Fresh EXE/hash, compiled NSIS/normal startup, hardware/load/idle/soak and live gates
are not yet accepted. Next exact action is build/inspect the reviewed source on E:.

### Genuine first launch — 2026-10-02

Removed the old setup-wizard prerequisite from normal Morpheus arrival. Main's
saved profile remains the completion authority; keyboard focus is contained.
Ten fresh/returning four-locale native journeys pass in 51.0s, including real
system-information completion and profile-preserving relaunch after renderer
storage removal. See [H first-run evidence](phase7-h-native-readiness.md).
The preview.1 NSIS build from d5954e6c succeeded, but predates this correction.
`1.2.0-preview.2` is the next candidate; packaged/runtime/hardware gates stay open.

### Real Gateway launch boundary — 2026-10-02

Normal preview.1 startup found Electron rejecting undefined provider-env entries.
The original Gateway launch now removes cleared entries after account overrides,
including Windows aliases, with no inherited-key fallback. The real Electron
utility child regression passes and port overrides now isolate the Gateway owner.
Read [I runtime evidence](phase7-i-windows-candidate.md). Rebuild preview.2 with
both this correction and 37095e95; preview.1 is not a usable handoff candidate.

### Quiet startup / normal runtime follow-through — 2026-10-02

Returning startup now follows the approved non-focusing orb contract, with explicit
tray handoff kept distinct from close-to-orb. Five locale/startup native journeys
and seven focused units pass; see [H evidence](phase7-h-native-readiness.md).
The preview.2 package from 208eff4d starts its real Gateway (14.1s in this fixture),
shows approved first-run UI, completes a real local task and selects a protected
synthetic provider. ACP then incorrectly connected to default port 18789 instead
of the isolated Main-owned port. This remains a real connection bug to fix before
claiming packaged conversational readiness. No paid inference was made. Preview.2
does not contain this quiet-startup correction and is not the final handoff build.

### Original ACP endpoint correction — 2026-10-02

ACP uses the validated Main-owned loopback endpoint and its child-env token,
without token argv or replacement session/history logic. Forty-two focused ACP
units, three typechecks and scoped lint pass. Preview.3 combines this fix with
quiet startup; real packaged conversation remains unverified until its normal
local-provider fixture succeeds. [I evidence](phase7-i-windows-candidate.md).

The e7636b70 unpacked preview.3 failed the pinned runtime's CLI-URL/env-auth
combination. Both values now use the owned environment; 44 focused checks include
the real bootstrap and inherited-alias exclusion. Rebuild remains required;
this failed candidate is not a usable installer. See I evidence above.

### Real ACP reply / history follow-through — 2026-10-02

The 3fe59e0c normal unpacked candidate delivers a real local-provider ACP reply,
without paid calls, but loses its visible timeline on renderer reload. Source now
loads existing ACP history without another prompt or a second store. Six native/
four-locale journeys and 97 related units pass; I evidence records boundaries.
Rebuild before claiming the exact package passes reload/recovery.

50437715 preview.3 subsequently passed normal local-provider reply, reload and
full quiet relaunch with preserved provider/history and only one local inference.
3,312 units pass + two skips. Visual review found generated persona text in the
restored user bubble; therefore it is not the final handoff despite those passes.
Preview.4 adds explicit display metadata without rewriting history or stripping
untagged user content. See I evidence for timings and exact scope.

### Fixed Windows candidate delivered — 2026-10-02

The [fixed completion checklist](WINDOWS_COMPLETION_CHECKLIST.md) now identifies
the actual **1.2.0-preview.5 / c8d021dd** Windows x64 EXE. It is a Larry/BYOK
acceptance candidate, not a completed public Premium release. The approved
bottom-right companion, original agents/tools/history and green M identity remain.

Final source: **3,329 unit passes / two platform skips**. Actual normal package:
approved welcome/local task, protected local fixture provider, original compact
ACP reply, renderer reload and full quiet restart with one inference total.
Controlled outage/recovery, unavailable Premium, no duplicate history, clean
console/process exit and 312.4s idle pass (0.915% total CPU, zero provider calls).
Embedded channel dependencies caught by final inspection were backported in both
packaging paths, not bypassed; all 197 checked loaded modules resolve in the payload.
Compiled EXE integrity, inventory, selected extracted hashes and patched versions
match. [Handoff](WINDOWS_PREVIEW5_HANDOFF.md) records the SHA256, unsigned status,
full local path and one short PC checklist; [I evidence](phase7-i-windows-candidate.md)
retains failed intermediate candidates and verification boundaries.

**Not closed:** actual installer/upgrade, physical voice/mic/DPI/sleep, 60-minute
mixed use, live model/research/publication quality and startup-performance targets.
Authenticated-browser scope and hosted managed ACP/accounting/identity/payments
remain unfinished; Premium cannot activate. No external accounts are supplied.
NerdGPT remains deferred. Do not restart discovery or claim full Phase 7 completion.
