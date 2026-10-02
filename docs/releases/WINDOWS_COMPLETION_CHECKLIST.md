# Current Windows experience completion checklist

Updated 2026-10-02, Asia/Dhaka. Preview.7 qualification in progress; **commercial release is not yet qualified**.
This is the single current checklist. Requirements and baseline evidence live in
[the experience specification](../design/MORPHEUS_EXPERIENCE_REVIEW.md). Previous
checklist detail is recoverable at `3bcad683`; historical preview.5 evidence is
retained in [its handoff](WINDOWS_PREVIEW5_HANDOFF.md).

`VERIFIED` applies only to the stated test boundary. `IMPLEMENTED` is source,
`SIMULATED` is fixture behavior, `OPEN` is untested or unaccepted, and `BLOCKED`
requires external inputs. Automated counts never imply physical PC acceptance.
The owner authorized a combined final review and then autonomous completion/testing:
complete the work and simplify without reducing capabilities. Separate component
review pauses are superseded. Preview.6 evidence below remains a preserved baseline.
An end-of-work preservation recheck confirms both historical source checkouts are
still clean at `fa988f06` and `3bcad683`. The historical Program Files and per-user
Morpheus installation paths and uninstall registration are now absent; the cause
is unknown. This task has not executed an installer/uninstaller on the owner host.
Historical preview.5 installed identity remains baseline evidence, not current state.

## Preview.7 current autonomous qualification

| Component | Current evidence |
| --- | --- |
| Included speech responsiveness | IMPLEMENTED: short first phrase, bounded sentence groups, validated PCM24 playback and up to eight available CPU threads. 69 focused voice checks passed, including actual engine transcription, cancellation and first-segment cleanup. Actual UI/package timing qualification is pending; segmented CPU synthesis may leave audible gaps on slower hardware. |
| Honest voice guidance | VERIFIED in native Windows: real progressive included PCM sample completes with microphone muted, without a provider/account; ordered segments arrive before completion and actual presence reports speaking, never listening. Local engine identity is independent of WAV/PCM format; local errors direct to speakers/installation repair. Four locale strings supplied. |
| Conversation ordering | VERIFIED in four actual localized native views: compact and expanded chat/task exchanges share Main admission/creation chronology; tasks retain their request position. Latest replies are in the viewport on open/send; intentional scroll-up remains fixed during passive reply updates. Existing selection/stop controls remain. Older undated ACP history retains its original order. Screenshot inspection caught both the missing scroll behavior and a fixture that had forced English; these were corrected and final en/zh/ja/ru cases pass. ACP replies are fixtures; the intervening system-information task is real. |
| Public capabilities | VERIFIED: actual pinned HTTPS GETs retrieved Example/IANA pages, generated source-bound citations and saved/reopened the report through real file.create. Real native Chromium observed IANA controls and clicked its public Reserved Domains link without owner cookies/host bridge. Seven native browser/site cases and two affected final Main artifact journeys pass: create/revise/preview/reopen/rollback/manual-edit protection. Other control/planning cases use explicitly bounded network/synthesis fixtures, not paid models. Publication remains untested. |
| Recovery/network | IMPLEMENTED: reject research URLs with credentials before dispatch, bounded validated-address retries only on connection errors, incomplete website marker survives cancellation or external edits during final verification. No TLS/HTTP-content retries or overwritten manual changes. |
| Reload during an active reply | REJECTED `5b93a145`: a real packaged renderer reload failed to restore its live ACP session and sent the same admission twice. Its EXE/logs are preserved under `E:\Morpheus-builds\experience-preview6\evidence\rejected-preview7-5b93a145`. Replacement VERIFIED in 149 focused checks and seven fresh native cases: Main consumes matching completed/cancelled/uncertain-failed dispatch independently of renderer lifetime; bounded recent settled receipts do not rewind generation, active receipts are never evicted. Fresh renderer restores original pending authority cards and Stop, then replays original existing history after completion; recovery cannot create an empty session before list hydration. Switching conversations supersedes old recovery waits. Compact/full/Advanced answer and Stop each consume the original admission once; changed-content identity fails, same-content retry sends no inference. These cases use actual Main service/admission/access owners with a bounded fake connection. Real packaged replacement still pending; every previous live stream chunk is not replayed. |
| Required checks actually execute on Windows | VERIFIED: replay/compare previously exited zero without invoking their entry point because file-URL pathname handling was wrong on Windows. All three communication scripts now resolve with `fileURLToPath`; real metrics and comparison were generated, all thresholds pass, three focused checks pass, and the checked-in reference baseline is unchanged. Earlier Windows zero-exit invocations are not treated as executed replay evidence. |
| Installation/update safety | IMPLEMENTED: uninstall verifies product markers before recursive removal; updater requires credential-free HTTPS and independent signing readiness. Signature checks enabled; feed remains absent. Guarded hosted Windows NSIS install/reinstall/uninstall qualification prepared; no owner installation is modified. Actual run pending. |
| External service gates | BLOCKED: owned signing/update infrastructure, task-model live credentials, hosted funding/operations, pricing/business country, Stripe/crypto merchant services and NerdGPT integration. No false checkout or entitlement. Physical voice/DPI/display taste and previous-version owner upgrade remain unverified. |

The exact next step is to correct the observed reload failure, finish its focused
native regressions, then rebuild and qualify the replacement preview.7 EXE and
disposable installation. The first hosted installer run built successfully but
stopped before installation because the runner already had `.openclaw` data;
runtime qualification will use a fresh isolated profile and preserve that data.
New results and
identity will replace pending states here. No installer/uninstaller is executed on
the owner host; only isolated test profiles and reversible source changes are used.

## A — preserved baseline

| Item | Result |
| --- | --- |
| Identity and safe fetch | VERIFIED: Morpheus origin and authorized branch. Prior worktree clean at `4a9f25e9`, documentation baseline `3bcad683`; original checkout clean at `fa988f06`, behind 31 at inspection. No reset, stash, clean, forced update or lost work. |
| Installed preview.5 | VERIFIED payload identity: Program Files EXE/app.asar/orb/runtime matched delivered `c8d021dd` candidate. Owner rejection confirmed by native inspection. |
| Real root causes | VERIFIED: task-only empty CSS hid conversation, ordinary Settings/Chat exposed inherited navigation, 100-DIP orb, no inactivity fade, provider/key detection presented as voice readiness. |
| Isolation/storage | Separate `E:\Morpheus-builds\experience-preview6\source` from `3bcad683`. Original source, prior worktree and installed app untouched. Credentials/profiles never copied into evidence. C/E checked before builds; large artifacts on E. |

## B — connected experience

| Component | Implementation / evidence boundary |
| --- | --- |
| Orb and compact | IMPLEMENTED: preserved artwork, 56-DIP native orb, 16-DIP work-area gap, upward composer, 440x400 compact, active state motion and audio-driven light. Native E2E verified actual current work-area geometry and compact/full transitions. Other physical taskbar edges/DPI/display changes OPEN. |
| Continuous conversation | VERIFIED in native fixture journeys: original Main/ACP session and draft persist compact -> full -> back, reload and four-language history. The CSS hiding ordinary replies is removed. Model replies are SIMULATED by isolated fixtures. |
| First launch | VERIFIED native journey: name -> secure Connections -> included Voice controls -> personality -> first command; skip/persistence/restart. API testing UI reuses existing protected owner; live account test OPEN. |
| Contextual Settings | VERIFIED native UI: Connections, Voice, Personality, Account & Plan, Advanced. Ordinary conversation/history stays simple; full technical Chat/settings/tools remain available explicitly under Advanced. |
| Appearance / motion taste | Actual packaged native recording VERIFIED: breathing/orbit, partial fade, hidden animation pause, restored opacity/motion and reduced motion. Mic/ambient stayed muted. The 16-second enlarged clip labels native hidden padding and isolated Main restoration. Real Michael/Heart WAV samples delivered. Owner visual/voice acceptance OPEN. |

## C — real first journey

| Item | Result |
| --- | --- |
| API setup | Protected provider implementation preserved, configured accounts detected, secure form and connection testing exposed. No keys requested in chat; no live paid-provider request made in qualification. |
| Included speech | IMPLEMENTED and real engine VERIFIED: pinned static sherpa-onnx, Whisper tiny.en int8, Kokoro v1.0 int8. Default English Michael / alternate Heart. No voice key or hosted account. Actual synthesis, exact generated-command transcription and cancellation cleanup passed. |
| Mic / audible output | Device selection, real input test, output sample and specific repair guidance implemented. Physical microphone accuracy, naturalness, speaker echo, same-breath wake and spoken execution OPEN owner gates. Samples are real neural audio, not Windows narrator or simulated sound. |
| Persistence / routing | Existing personality/context model owners retained. Native tests verify profile changes, restart and draft/history. Normal packaged runtime verified original ACP reply, full/settings/compact continuity, reload and restart without a fresh inference. The model answer is a loopback fixture. |
| Disappear / wake / mute | Ten-second completed-idle fade; busy audio/question states hold, hidden tasks continue. Typed clarification stays open with mic muted. Repeated show rearms the idle timer. Input mute wins; local wake opt-in uses Windows default mic. Native timer/work-area tests and actual muted orb recording pass; physical wake/lock/sleep OPEN. |

## D — retained product

| Item | Result |
| --- | --- |
| Capabilities/results | Existing action registry, Objective Core, browser, research citations, website create/revise/preview/publication, artifacts and tasks preserved. Full technical tools/agents/channels/schedules/skills remain accessible. No speculative income claims or guaranteed autonomous success. Live provider/research/publication acceptance OPEN. |
| Recovery | Voice failure -> Voice settings -> same conversation/draft. Existing task cancellation, clarification and recovery owners retained. Contextual navigation verified; physical mic unplug/permission repair OPEN. |
| Plans | Basic BYOK + included local voice available. Premium hosted and future Unrestricted/NerdGPT presented separately as unavailable/planned. Account entitlement, personality and actual service availability remain distinct. No invented prices, subscriptions or checkout. |
| External blockers | Pricing/business country, server/domain/payment accounts, Stripe/crypto setup and hosted funding/operations absent. NerdGPT API deferred. They block their own service gates, not local BYOK or included voice. |

## E — release evidence

| Gate | Result |
| --- | --- |
| Source regression | VERIFIED at stated boundaries: full implementation baseline `d67f5980` passed 324 unit files / 3,336 tests (two skipped), including real engines. Subsequent voice/presence checks passed, including a 16-test wake suite. Typecheck passed; lint zero errors / 12 existing warnings. Comms replay/compare after Main fixes and harness CI/task validation/dry-run passed. Native setup/history/locales/Advanced journeys passed; final three-test navigation/typed-question/motion run passed, plus the explicit pointer-leave retest. An exact-link test selector and a native hover precondition were corrected; earlier failure evidence is retained. |
| Fresh package | VERIFIED at application source `12a3689806d6bfe87cdc63f4b6600ecea21c2093`: normal packaged startup, real Gateway, local execution, real local neural playback/cancel control, protected synthetic loopback provider, original ACP compact reply, full/settings/compact draft/history, reload and quiet restart. No E2E mode, owner profile, paid provider, physical mic or installer execution. Gateway 20.183 s on this launch; returning window 2.691 s / Gateway 7.615 s; UI sample generation + playback 19.085 s. |
| Identified EXE | VERIFIED: `E:\Morpheus-builds\experience-preview6\source\release\Morpheus-1.2.0-preview.6-win-x64.exe`, 477,650,761 bytes; SHA256 `599f8d29628efcfafdfe7837cf72dabb7ab8bbf99efa1af8704e5416a83cb07e`. All 40,896 embedded paths/sizes, archive integrity and 44 selected hashes match the qualified payload. EXE/app.asar/orb/motion hashes also match normal qualification. Voice notices/source provenance included. Unsigned; no owned update feed. |
| Installed upgrade / hardware | OPEN: installer execution, upgrade/uninstall with owner profile, physical mic/echo/interruption, DPI/taskbar positions/display removal/sleep, live paid provider/publication and long mixed-use session. Do not label source or fixtures as installed acceptance. |

## Current record and exact next step

All implementation stays in the E: worktree; original checkouts remain clean at
`fa988f06` and `3bcad683`, and no owner installation/profile is replaced. The exact
verified EXE, specification/checklist exports, motion/transition recordings, real
voice samples, package identity and one short PC acceptance checklist are delivered
under the current chat's `outputs` directory. Application source is `12a36898`;
subsequent handoff commits change documentation only.

**Exact next step:** finish autonomous preview.7 packaged, generated-speech and
disposable installation qualification. The preserved preview.6 results above are
a historical baseline, not acceptance of the rejected preview.7 candidate.
Physical microphone/display taste, owner-profile upgrade and external service
inputs remain explicitly unverified. No separate competing plan.
