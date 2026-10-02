# Current Windows experience completion checklist

Updated 2026-10-03, Asia/Dhaka. Preview.7 autonomous candidate qualification complete at the boundaries below; **commercial release is not yet qualified**.
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

## Preview.7 final candidate — application source 757f71c5

| Component | Current evidence |
| --- | --- |
| Included speech / real command | VERIFIED on the exact `757f71c5` normal package: real included synthesis generated a 1,615-ms command; Main recognition took 706 ms and routed it to real Core system.report. Two voice-origin runs and one typed follow-up completed. Original renderer playback received, scheduled and naturally ended all 137,640 declared PCM bytes / three chunks, with no premature stop/close. PCM duration 2,868 ms; first PCM 4,128 ms, first actual speaking 4,164 ms, total generation/playback 7,019 ms. Typed Stop interrupted the second reply in 82 ms and stopped all scheduled sources. Input was generated speech through Main; physical recording-owner dispatch, microphone, echo and audibility are not qualified. |
| Honest voice guidance | VERIFIED in native Windows: real progressive included PCM sample completes with microphone muted, without a provider/account; ordered segments arrive before completion and actual presence reports speaking, never listening. Local engine identity is independent of WAV/PCM format; local errors direct to speakers/installation repair. Four locale strings supplied. |
| Continuous conversation / restart | VERIFIED: twelve Main timing checks, fifteen timing/projection checks and five fresh native cases pass; pre-fix tests reproduced both failures. Actual normal packaged full restart restores original Core -> original ACP user -> original reply, using canonical transcript starts with zero short-lived admission refs. Original tagged-persona input aligns without exposing its context. Compact/full/Voice Settings/back keeps the latest reply in the actual clipped viewport, with settled native bounds/opacity; the draft and exact original history bytes, including the trajectory file, remain unchanged. Deliberate real wheel-up stays on old history during passive updates. Four localized views pass. The model answer is a loopback fixture; Core execution, controllers and history are real. |
| Public capabilities | VERIFIED: actual pinned HTTPS GETs retrieved Example/IANA pages, generated source-bound citations and saved/reopened the report through real file.create. Real native Chromium observed IANA controls and clicked its public Reserved Domains link without owner cookies/host bridge. Seven native browser/site cases and two affected final Main artifact journeys pass: create/revise/preview/reopen/rollback/manual-edit protection. Other control/planning cases use explicitly bounded network/synthesis fixtures, not paid models. Publication remains untested. |
| Recovery/network | IMPLEMENTED: reject research URLs with credentials before dispatch, bounded validated-address retries only on connection errors, incomplete website marker survives cancellation or external edits during final verification. No TLS/HTTP-content retries or overwritten manual changes. |
| Reload during an active reply | REJECTED `5b93a145`: a real packaged renderer reload failed to restore its live ACP session and sent the same admission twice. Its EXE/logs are preserved under `E:\Morpheus-builds\experience-preview6\evidence\rejected-preview7-5b93a145`. Replacement VERIFIED at `23d7bae9` in 149 focused checks, seven fresh native cases and actual normal packaged runtime: Main consumes matching completed/cancelled/uncertain-failed dispatch independently of renderer lifetime; bounded recent settled receipts do not rewind generation, active receipts are never evicted. Fresh renderer restores original pending authority cards and Stop, then replays original existing history after completion; recovery cannot create an empty session before list hydration. Switching conversations supersedes old recovery waits. Compact/full/Advanced answer and Stop each consume the original admission once; changed-content identity fails, same-content retry sends no inference. Focused native cases use actual Main owners with a bounded fake connection. The normal package uses the real Gateway and a held loopback model stream: one Main admission before reload, zero afterward, exactly one model request/user turn, intact history on settled reload and quiet full restart. Every previous live stream chunk is not replayed. |
| Required checks actually execute on Windows | VERIFIED: replay/compare previously exited zero without invoking their entry point because file-URL pathname handling was wrong on Windows. All three communication scripts now resolve with `fileURLToPath`; real metrics and comparison were generated, all thresholds pass, three focused checks pass, and the checked-in reference baseline is unchanged. Earlier Windows zero-exit invocations are not treated as executed replay evidence. |
| Exact package / installation | VERIFIED local EXE: version `1.2.0-preview.7`, 480,418,659 bytes, SHA256 `19a0bafe7e9c8d1792876d127dc05d63962142938464fddcd6b72b0fa70a82e2`. Archive CRCs, all 40,896 file paths/sizes and 44 selected identity hashes pass; EXE/app.asar/orb/motion match the exact normal/voice/recording payload. Actual hosted Windows install/runtime/same-version reinstall/default uninstall pass for source `757f71c5`, preserving synthetic profiles/settings and rollback. CI run `37050843303` rebuilt a distinct EXE, SHA256 `fad8cd751585b0d6376741a0dc9ac593516403dc0301a85060c04c1e6443a59b`; it is source-level installed evidence, not execution of the local delivery EXE. No owner-host installer ran. |
| Motion / resource observations | VERIFIED actual 56-DIP native orb: quiet breathing/orbit, partial fade, hidden animation pause, restoration and reduced motion; 16-DIP work-area inset at 1920x1080 / 100% scaling. Restoration uses isolated Main show/hide, not a physical shortcut/tray/wake test. Short no-capture observations with Gateway autostart off and mic/ambient muted: hidden 5.661 s / 8.56% of one core, visible 5.509 s / 16.17% of one core; stable five-process set. Summed working sets 986.8/989.9 MiB can double-count shared pages. These do not qualify long-run/loaded performance. |
| Startup / local voice cost | OBSERVED exact package: fresh Gateway 62.827 s; returning window 2.756 s / Gateway 7.679 s; 25-word UI sample generation/playback 18.077 s, first PCM 4.275 s. Cold startup is slow. Included offline English voice has no per-utterance service charge or separate API key, but adds install size, CPU/RAM use and possible generation gaps; lower-power hardware and naturalness remain unverified. |
| External / physical gates | BLOCKED commercial services: owned signing/update infrastructure, hosted funding/operations, pricing/business country and Stripe/crypto merchant services are absent; NerdGPT is intentionally deferred. No false checkout or entitlement. Live paid-provider/publication acceptance, physical microphone/wake/echo/audibility, other taskbar edges/DPI/autohide/display/sleep, previous-version owner upgrade and long mixed-use performance remain unverified. |

Final application identity is `757f71c5f7e98d560624657a12875dba4330c7ac` on
`codex/morpheus-phase6-managed-layer`. Node/web/managed types, scoped lint, real
Windows comms replay/compare and diff-aware harness validation/dry-run pass; the
reference comms baseline is unchanged. Prior full lint had zero errors / twelve
existing warnings; the preserved full-suite count below is not a new final rerun.
Actual motion and conversation review clips are 16 and 20 seconds, with fixture,
native-padding and restoration boundaries labelled. Real Michael/Heart samples
and the fully played command reply are supplied. Rejected `5b93a145` reload,
`23d7bae9` truncated speech and `24945c32` pre-chronology EXEs/evidence stay preserved.
The recorder's flight-recorder filename preflight error was corrected before any
app launch; it is a harness failure, not a product acceptance result.
No installer/uninstaller ran on the owner host, and no owner profile or credential
was used. Signing is `NotSigned`; the updater stays unconfigured with signature
verification enabled. Hosted installation ZIP SHA256 is
`7adc602433610471ce21d15f83fda4fc31cdda13121d03e3eb628c42c19a1007`.

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
| Capabilities/results | Existing action registry, Objective Core, browser, research citations, website create/revise/preview/publication, artifacts and tasks preserved. Full technical tools/agents/channels/schedules/skills remain accessible. No speculative income claims or guaranteed autonomous success. Preview.7 public research/browser/local website evidence is recorded above; live paid-provider and publication acceptance remain OPEN. |
| Recovery | Voice failure -> Voice settings -> same conversation/draft. Existing task cancellation, clarification and recovery owners retained. Contextual navigation verified; physical mic unplug/permission repair OPEN. |
| Plans | Basic BYOK + included local voice available. Premium hosted and future Unrestricted/NerdGPT presented separately as unavailable/planned. Account entitlement, personality and actual service availability remain distinct. No invented prices, subscriptions or checkout. |
| External blockers | Pricing/business country, server/domain/payment accounts, Stripe/crypto setup and hosted funding/operations absent. NerdGPT API deferred. They block their own service gates, not local BYOK or included voice. |

## E — preserved preview.6 release evidence

| Gate | Result |
| --- | --- |
| Source regression | VERIFIED at stated boundaries: full implementation baseline `d67f5980` passed 324 unit files / 3,336 tests (two skipped), including real engines. Subsequent voice/presence checks passed, including a 16-test wake suite. Typecheck passed; lint zero errors / 12 existing warnings. Comms replay/compare after Main fixes and harness CI/task validation/dry-run passed. Native setup/history/locales/Advanced journeys passed; final three-test navigation/typed-question/motion run passed, plus the explicit pointer-leave retest. An exact-link test selector and a native hover precondition were corrected; earlier failure evidence is retained. |
| Fresh package | VERIFIED at application source `12a3689806d6bfe87cdc63f4b6600ecea21c2093`: normal packaged startup, real Gateway, local execution, real local neural playback/cancel control, protected synthetic loopback provider, original ACP compact reply, full/settings/compact draft/history, reload and quiet restart. No E2E mode, owner profile, paid provider, physical mic or installer execution. Gateway 20.183 s on this launch; returning window 2.691 s / Gateway 7.615 s; UI sample generation + playback 19.085 s. |
| Identified EXE | VERIFIED: `E:\Morpheus-builds\experience-preview6\source\release\Morpheus-1.2.0-preview.6-win-x64.exe`, 477,650,761 bytes; SHA256 `599f8d29628efcfafdfe7837cf72dabb7ab8bbf99efa1af8704e5416a83cb07e`. All 40,896 embedded paths/sizes, archive integrity and 44 selected hashes match the qualified payload. EXE/app.asar/orb/motion hashes also match normal qualification. Voice notices/source provenance included. Unsigned; no owned update feed. |
| Installed upgrade / hardware | OPEN: installer execution, upgrade/uninstall with owner profile, physical mic/echo/interruption, DPI/taskbar positions/display removal/sleep, live paid provider/publication and long mixed-use session. Do not label source or fixtures as installed acceptance. |

## Current record and exact next step

Implementation stays in `E:\Morpheus-builds\experience-preview6\source`; original
checkouts remain clean at `fa988f06` and `3bcad683`. Verified local build:
`E:\Morpheus-builds\experience-preview6\source\release\Morpheus-1.2.0-preview.7-win-x64.exe`.
The identical delivery copy, build identity, this checklist/specification, real
voice samples and recordings are exported to
`C:\Users\monir\Documents\Codex\2026-10-02\continue-morpheus-from-the-existing-project\outputs\preview7`.
Application source is `757f71c5`; later handoff changes are documentation only.
Evidence root is `E:\Morpheus-builds\experience-preview6`: `installer-inspection.json`,
`normal-runtime-evidence.json`, `evidence/packaged-voice-command-qualification.json`,
`evidence/packaged-conversation-preview7.json`, `evidence/native-orb-motion.json`
and `evidence/hosted-install-37050843303/installed-app-qualification.json`.

**Exact next step:** the owner's combined appearance/physical-PC review using
`Morpheus-PC-Acceptance.md` in the delivery folder. Fix demonstrated regressions
without repeating approved work. Commercial launch requires the external service
and physical/performance gates above; automated or generated-input evidence does
not close them. No new open-ended implementation campaign or competing plan.
