# Current Windows experience completion checklist

## Current preview.12 — connected Voice ready for bounded PC review

Independent final review reproduced a preview.11 cache race: cancel an interaction
while a committed tray settings reload is pending, and the discarded response can
leave visible settings stale with no same-revision retry. Main still stops the
helper and enforces master mute, but synchronization is not fully accepted.
- [x] Implement independent configuration freshness and capture-operation
  validity; retain authority/settings ordering, pending mute and acquisition-error
  recovery. Newer service status also releases old capture before its event arrives.
- [x] Final 35 voice-store cases, Node/web typecheck and targeted lint passed;
  independent source review found no remaining concrete issue. Comms comparison
  and updated task validation passed.
- [x] No-speech feedback says “I didn’t catch that”, with a Voice settings link
  and phrase retry. All four locales updated. Generated-input conversation and
  silent-input release/recovery Electron journeys passed.
- [x] Final frozen-source production build and two relevant Electron journeys
  passed again. Normal preview.12 package qualification passed (E2E unset):
  528 regular build files / 12 external resources matched, real included PCM
  and Core result, compact/Settings/Advanced continuity, silent synthetic mode/
  mute lifecycle, zero renderer errors and unchanged startup registration.
- [x] Exact preview.12 now runs on the owner PC at Settings → Voice. Existing
  history/provider were present and voice preference backup hashes still matched.
  Physical explicit capture opened, then no words were recognized without a false
  pass; the actual new retry headline/link were visible. Selected included sample
  completed. No human phrase, spoken wake or physical audibility is accepted.
- [x] Actual typed “Open YouTube” completed through Core without approval. Chrome
  opened YouTube in another normal window; the previous browser window remained.
  Current-window/profile selection is not verified, and a generic transient task
  acknowledgement/result still appears. Do not advertise this as seamless spoken
  command/browser continuity. No live paid-model connection was tested.
- [x] Actual packaged clip, PCM WAV, qualification and physical observation report
  are in this task's outputs\preview12. 629 frames decoded, about 25.2 seconds;
  WAV mono 24 kHz / 16-bit, 364,498 data bytes / 7.594 seconds.

Application source: `05426874856222e3b5de946585e27087454b88dc`. Local branch:
`codex/morpheus-preview10-connected-voice`. Runtime **1.2.0-preview.12**.
Review EXE: `E:\Morpheus-builds\experience-preview12-review\win-unpacked\Morpheus.exe`.
Unsigned, unpacked review application; keep its folder intact. It is not an
installer. EXE SHA256: `2c498c351a88455c6ffe346f7848a520db856deacf3cecac74286ec8bce6912b`.
`resources/app.asar` SHA256:
`082d24e2c2ac33b260facdbc368b1af83a16ff85418430df4010cfc02225560c`.
Later documentation commits do not change this packaged application identity.

Cold packaged first PCM 4.647 s; first speaking 5.182 s; complete sample
pipeline 13.450 s. Fresh Gateway 51.048 s. The WAV omits generation
waits; the app-window recording has no audio track. Longer synthesis/model delays,
echo-safe acoustic interruption, physical wake/accent/echo and long-session resource
budget remain open. Native minimize and active-capture mute have source/unit
coverage, not separate physical acceptance in this normal package run. Tray tests
use its Main settings service rather than clicking the native menu.

Exact next PC test: **Check microphone → say “Open YouTube” → Finish microphone
check**. Expect those words; calibration does not execute a command. Then confirm
companion wake/action and audibility. Public sale, signing/update, hosted funding,
account/payment setup and planned NerdGPT integration remain open.

Source/profile/package history is preserved. Preview.10 and preview.11 are
superseded. Evidence below remains historical and scope-specific.

## Previous October 4 preview.11 — preserved scoped review evidence

Preview.10 normal packaged lifecycle checks passed, but actual owner-PC capture
then exposed `[SOUND]` falsely passing the microphone test. Preview.10 is
superseded. Preview.11 rejects that annotation before input-test success or
command routing. Actual owner-PC recheck opened capture and reported no words
recognized, without a false pass. No person spoke during this check; physical
spoken-command recognition and speaker audibility are still unaccepted.

Application source: `5a21fc3ba1f9b08b9a9e60ec80f7d643151e14d9`, local branch
`codex/morpheus-preview10-connected-voice`. Runtime **1.2.0-preview.11** is now
open on the owner PC at connected Settings → Voice, using the existing profile.
Review EXE (unpacked application, not an installer; keep its folder intact):
`E:\Morpheus-builds\experience-preview11-review\win-unpacked\Morpheus.exe`.
Unsigned. EXE SHA256:
`452ce486924eb2383e7b8436de0e00ec27569db9672eb8a8939e198d67d38f3b`.
`resources/app.asar` SHA256:
`20beac6e4947e25d67c7ff4a0efde01fb85ca707033973b57916b83a3e173ab1`.
Later documentation commits do not change this packaged application identity.

- [x] Recheck source: clean `e1e2151207ac188980a4e1dfd78839f5115eb8f2`, branch
  `codex/morpheus-preview9-shell-recovery`, expected GitHub origin. Preserve owner
  profiles and historical checkouts. E: has about 140.6 GiB free; builds stay there.
- [x] Recheck running owner app: preview.9 review EXE below. The previous per-user
  preview.8 executable is now absent; earlier "still installed" statements below
  are historical observations, not the current installation state.
- [x] Actual microphone test opens after owner enabled permission. Finished
  capture reported no speech, without a permission error. This proves access,
  not recognized speech/accent/echo or audible-output acceptance.
- [x] Reproduce misleading status: armed/listening label remains beside actual
  no-speech error. Long Voice form keeps controls below the fold.
- [x] Implement connected input/output cards and clear companion consent/mute.
- [x] Main-owned automatic-listening scope: companion only; full/compact/Settings
  suspend capture/wake without deleting consent; explicit chat mic remains usable.
- [x] Improve bounded latency and real audio-driven compositor motion; measure
  actual changes and keep acoustic barge-in limitations explicit.
- [x] 136 focused unit cases, full Node/web/managed typecheck, production Vite
  build, comms replay/compare and diff-aware task/harness checks passed. Narrow
  independent source review confirmed pending-mute, failed-acquisition restart,
  native-visible occlusion and delayed-follow-up races resolved.
- [x] Follow-up native tray fix: 140 focused cases now pass, including committed
  settings revision, hidden off/on synchronization, foreground/pending-mute veto
  and permission recovery. Node/web typecheck and targeted lint pass. The initial
  preview.10 package is superseded; preview.11 includes these updated controls.
- [x] Rendered source qualification: 12 distinct relevant Electron journeys
  passed across two runs (initial obsolete size/state assertions corrected).
  Voice controls fit 1280×800; 430px device repair has no horizontal overflow.
  Consent edits while muted cause zero capture. Navigation, compact draft,
  error recovery, reduced motion and hidden animation removal passed.
  Actual local neural generated input was recognized and routed once to an ACP
  answer fixture; all 129,452 actual PCM bytes played. Typed/manual Stop stopped
  playback in 28.1/33 ms in that synthetic-input journey, not physical barge-in.
- [x] Observed `[SOUND]` regression: 46 local-input unit cases passed, including
  sound-related ordinary text/quoted requests. Four optional local-voice cases
  were skipped, not passed. Production build and the real generated-input
  conversation/silence Electron journeys passed again for preview.11.
- [x] Normal preview.11 package qualification passed with E2E mode unset, isolated
  first-run profile, zero provider accounts and zero renderer errors. All 526
  regular build files matched ASAR and 12 external resources matched inputs.
  Actual welcome/Voice sample, real Core system report, compact/Settings/Advanced
  navigation and retained draft passed. Test Gateway stopped; owner startup
  registration was unchanged.
- [x] Packaged mode/mute exercise used silent synthetic Chromium streams plus
  the real Windows default-microphone wake-helper lifecycle. Actual Voice controls
  enabled capture; native tray-equivalent Main settings service off/on synchronized
  the renderer. Showing full chat released capture; compact/Settings remained
  quiet. Master mute preserved consent and prevented hidden reacquisition. The
  normal record does not separately exercise native minimize or muting during
  active capture; those veto paths have source/unit coverage. This is not
  physical spoken wake or native tray UI-click acceptance. Two Chromium
  acquisitions were observed; no transcript was seeded.
- [x] Owner PC now runs the identified preview.11. Existing history was visibly
  retained, configured provider remained present without opening its key, and
  saved voice preferences matched the pre-switch backup hash. No installer,
  profile reset, migration or credential replacement ran.
- [x] Actual selected default microphone opened after explicit Check microphone,
  and Finish reported no words recognized. The false `[SOUND]` success is gone.
  Actual selected included voice preview completed in the owner UI; physical
  speaker audibility/quality is not established by that completion. Dismissing
  the no-speech status returns the panel to not-tested, not a passed state.
- [x] Actual packaged motion clip and generated PCM sample copied to this task's
  `outputs\preview11`, with qualification JSON and concise `REVIEW.md`. Video
  decoded successfully: 629 actual VP8 frames, 1280×800, about 25.2 seconds, no
  audio track or generated/interpolated frames. WAV is actual playback-bound
  mono 24 kHz PCM, 365,056 bytes / 7.605 seconds; generation waits are omitted.

Cold normal package observation: first PCM **4.297 s**, first speaking state
**4.772 s**, complete sample pipeline **13.446 s**. Fresh Gateway readiness took
**56.660 s**. The short prepared-output benchmark above/below is a separate
engine measurement, not an end-to-end voice command latency promise. Longer
output still has synthesis gaps; model replies wait for final completion before
speaking. The Windows wake helper uses the default microphone, which may differ
from the selected Chromium device. Acoustic echo-safe speech interruption,
physical accent/noise/wake acceptance and current long-session resource budget
remain open. The no-speech banner still has a generic unavailable heading, with
a specific retry explanation; it does not mean microphone permission failed.

Exact next PC test: in the open Voice panel, click **Check microphone**, say
“Open YouTube”, then **Finish microphone check**. It should show those words;
this calibration does not execute the command. Once input is accepted, validate
the companion's real wake → spoken command → browser action separately.

Public sale, signing/update, hosted funding, payment setup and physical mixed-use
acceptance remain open. Preview.9 below is preserved historical package evidence.

## Preview.9 bounded correction — ready for owner review

Application source: `4b9e251931447fabdf8f2638a343104a75c27000`, local branch
`codex/morpheus-preview9-shell-recovery`; no push or owner installation performed.
Review application (run from its folder; this is not an installer):
`E:\Morpheus-builds\experience-preview9-review\win-unpacked\Morpheus.exe`.
Runtime version: **1.2.0-preview.9**; unsigned. EXE SHA256:
`3a724298b6c56c3f7938f771bed6156927b181797abaf970e1bc4ad06acfac83`.
`resources/app.asar` SHA256:
`07783ffc58c1d865ed61de000beb6aa29d1d73a6341e74c6e48afd26da83c588`.

Implemented: discoverable labeled Settings; in-flow ambient/active/error status;
consistent full/compact conversation and Core result alignment; connected settings
palette and contextual Voice return; original M/orb artwork movement with real
audio response and hidden/reduced-motion guards. Existing backend, Advanced,
profiles, providers and history remain in their original owners.

Verified input scope: 84 focused tests, including real bundled local engines with
generated Open YouTube/Yes/No/Stop, quiet Yes, silence and seeded broadband noise.
Noise produced `(wind howling`, which the new semantic gate rejected. No physical
microphone claim. Known decoder annotations cannot enter the draft or routing;
this does not guarantee rejection of every possible noise hallucination.

Source checks passed: full typecheck, lint (12 existing warnings), focused voice
playback/settings/state tests, comms replay/compare and diff-aware harness checks.
Two additional capture-error recovery regressions passed within 26 voice-store/
settings tests: a settings refresh retains the failure and successful explicit
configuration settles a cleared error to idle without claiming capture success.
Final rendered qualification passed seven tests across the shell, existing
experience, silence and real local speech specs. New shell journeys recorded zero
console/page errors; navigation remained reachable at 1280/640/320 widths, full
and compact preserved context/draft, original Advanced stayed reachable, and the
real Core system-information result appeared. Wake states and chat replies in
these rendered journeys are explicitly seeded fixtures. Real local output played
all 364,160 PCM bytes across ten chunks; the observed maximum scheduled generation
gap was 1.52 seconds. This is not seamless or physical audio acceptance.
Normal packaged qualification PASSED against the identified payload: all 518
regular build files matched ASAR and 12 external resources matched source inputs.
Actual packaged version, normal startup (E2E unset), synthetic first-run flow,
animated welcome, Voice settings/output sample, real Core system information and
compact/settings/Advanced return with retained draft passed. No provider accounts,
physical capture requests or renderer errors; microphone capture remained disabled and the
test Gateway/app closed. The owner startup registration check stayed unchanged.
Preview.8 remains installed with its original ASAR hash. Historical checkouts
remain clean at `fa988f06` and `3bcad683`; no owner-host installer or migration ran.

Next: obtain the owner's visual acceptance of the corrected running shell before
broader integration. Quit installed Morpheus from the tray, run the review EXE in
its folder, type a draft, and check compact → Settings → back; then use Voice →
Preview selected voice. Keep the folder intact. This is a short review, not full
hardware/release acceptance. Physical microphone/accent/noise, wake, speaker/echo and acoustic
interruption remain open. Paid hosted services, signing/update and payment setup
remain external release blockers. Preview.9 is a review build, not a sale release.

Actual normal packaged voice sample: 364,670 PCM bytes, first PCM 5.929 s,
speaking state 6.433 s, total 18.963 s. Fresh Gateway became ready in 59.385 s.
These are cold observations on this PC; latency and synthesis gaps remain open.
The standalone WAV contains actual generated PCM without generation waits and
does not prove physical audibility. The 31-second app-window clip is a continuous
chronological excerpt at normal speed, without an audio track or generated frames.
Package evidence: `E:\Morpheus-builds\experience-shell-recovery-evidence\package\normal-1791041593358`.
User-facing media/handoff: this task's `outputs\preview9` folder.

Motion verification: original central artwork moves in actual native pixels;
header M movement, reduced motion, covered/full restoration and native hide/show
pass. The final two identity tests assert empty animation instances and stable
hidden transforms. Earlier in this correction, CSS reported `paused` while clocks
still advanced, so that check was replaced. Direct final inspection confirms both
hidden window animation lists empty, including Main's repeated sample 700 ms later.

**Resource budget remains OPEN.** Three 15-second source-Electron observations,
no screen capture during sampling, stable PIDs: native orb plus blank hover composer
17.56% of one core / 923.9 MiB summed working sets; full conversation 26.16% /
819.9 MiB; all windows hidden 13.07% / 635.3 MiB. The CSS loops are removed, but
remaining hidden CPU is unexplained. These are short source-E2E measurements on
this 200 Hz display, not packaged/long-session performance acceptance; working
sets may double-count shared pages. Do not re-use preview.8's 0.20% hidden figure
to describe this build.

Current evidence root: `E:\Morpheus-builds\experience-shell-recovery-evidence`.
The before-correction samples remain under `*-before-hidden-removal.json`;
`hidden-animation-diagnostic.json` and `motion-resource-samples.json` describe the
final hidden-animation removal. Further performance profiling is deferred while
this scoped visual checkpoint is reviewed; it remains an acceptance limitation.

## Owner review supersedes candidate status — 2026-10-03

**Preview.8 is rejected for product experience; not ready for release or sale.**
Installed version is now verified as preview.8. Its `resources/app.asar` SHA256 is
`CFF9694AA37468E57DF3233E30D1181A270D095CD1F21C057A524E13ADB44D2A`, matching
the delivered payload. This is not an old-installer explanation. Source and fetched
application branch were clean at `48480850` before this documentation correction.

- [x] LIVE: reproduced the ambient badge obscuring full conversation navigation.
- [x] LIVE: shortcut opened compact; compact Settings opened Voice; Advanced
  exposed the original settings/workspace links. No configuration changed.
- [x] VIDEO + LIVE: raw non-speech recognition output reaches the interface.
- [x] VIDEO + SOURCE: outer contour motion exists but the center/header identity
  stays static; visible-motion satisfaction is rejected, not accepted by CSS tests.
- [x] Implement and test one common shell with simulated wake enabled, including settings
  discovery, content/composer alignment, compact/full return and errors.
- [x] Reject local non-speech recognition artifacts before drafting/routing;
  validate silence/noise recovery and valid spoken commands independently.
- [x] Verify actual central pixel movement and hidden/reduced-motion behavior.
- [ ] Obtain the owner's visual acceptance of the running implementation;
  measured movement is not a substitute for that review.

Local video-analysis evidence: `E:\Morpheus-builds\experience-owner-review-20261003`.
The supplied video is 162.93 seconds, 1918×1078 at 30 fps. Frames were examined
throughout, with a contiguous 74–77.5-second motion sample. Audio content was not
auditioned or transcribed. Current inspection made no microphone capture/model
request and does not verify physical speech quality. Previous fixture, generated
audio, packaging and timing results below retain only their stated scope.
The exact next component is defined in the current experience specification.

Updated 2026-10-03, Asia/Dhaka. **Connected motion study approved; implementation
and final Windows qualification authorized. The owner rejected preview.7 UI/UX.** Scoped qualification
below remains evidence; it does not establish product acceptance or commercial readiness.
This is the single current checklist. Requirements and baseline evidence live in
[the experience specification](../design/MORPHEUS_EXPERIENCE_REVIEW.md). Previous
checklist detail is recoverable at `3bcad683`; historical preview.5 evidence is
retained in [its handoff](WINDOWS_PREVIEW5_HANDOFF.md).

`VERIFIED` applies only to the stated test boundary. `IMPLEMENTED` is source,
`SIMULATED` is fixture behavior, `OPEN` is untested or unaccepted, and `BLOCKED`
requires external inputs. Automated counts never imply physical PC acceptance.
The owner accepted the new motion study and requested implementation, connected
settings and improved voice/animations. That latest request supersedes the earlier
design-only hold. Preview.6/preview.7 evidence remains a preserved baseline.
An end-of-work preservation recheck confirms both historical source checkouts are
still clean at `fa988f06` and `3bcad683`. The historical Program Files and per-user
Morpheus installation paths and uninstall registration were absent at the earlier
handoff; their absence was unexplained. Subsequent live inspection on October 3
found `C:\Users\monir\AppData\Local\Programs\Morpheus\Morpheus.exe`, version
`1.2.0-preview.7`. Its EXE and app.asar hashes match the qualified payload. The
installed conversation was observed; inspection stopped at the owner's Escape key
before settings/voice walkthrough. This task did not run an installer/uninstaller
on the owner host. No complete live function or physical voice acceptance is claimed.

## Preview.8 final candidate — application source 24ebf455

Final application source is `24ebf455d539b27bb8bad99a23aea2d53579e2bc`, version
**1.2.0-preview.8**, pushed to `codex/morpheus-phase6-managed-layer`. Its approved
design remains intact. The last functional correction replaces repeated contour
repainting with static organic shape/compositor travel and approximately 30 Hz
quiet motion. Native and React regressions verify actual changing transforms,
static contour shape, shared cadence, reduced motion and hidden layer hints.
No source changes followed the final package; subsequent handoff edits are docs only.

| Final candidate gate | Actual result and boundary |
| --- | --- |
| Normal packaged runtime | VERIFIED on the exact local payload, E2E unset, isolated synthetic profile: setup, real Core task, protected local provider, original Gateway/ACP, compact/full/settings continuity, active/settled renderer reload without duplicate inference, and quiet process restart with original history. The model answer is a bounded loopback fixture. |
| Ordinary spoken conversation | VERIFIED: real generated speech → original MediaRecorder → local recognition → original Gateway/ACP → actual PCM playback. Three turns; first reply 129,456 bytes received/scheduled/played completely. Typed/manual Stop 19.0/30.8 ms. Physical capture requests zero; microphone, accent/noise/echo, wake and audibility are not qualified. |
| Native motion and placement | VERIFIED actual 56×56 native pixels: quiet motion, fade, restoration, actual audio-driven speaking, reduced motion and hidden pause. Work area 1920×1080, scale 1. The 32 s clip is sampled at 10 fps without enlargement/interpolation; hidden frames are padding, and no audio track is claimed. Restoration uses isolated Main controls, not a physical tray/shortcut/wake test. |
| Motion resource correction | VERIFIED short no-capture observations, mic/ambient muted and Gateway autostart off: visible orb plus blank hover composer 17.545% of one CPU core / 669.0 MiB summed working sets; hidden 0.201% / 658.7 MiB, roughly 15 s each, stable PID set. The comparable first integration measured 92.681% / 10.221%: approximately 81% visible reduction. Working-set sums can count shared pages twice. Both hidden surface projections were false and their animation loops paused. Long mixed-use/low-power performance remains OPEN. |
| Included voice cost and latency | VERIFIED real packaged Michael/Heart auditions, no separate voice account/key, pinned engine/model/worker bytes. WAVs contain actual PCM without delivery waits. Fresh Gateway 45.476 s; returning UI 2.610 s / Gateway 7.521 s. Cold sample first PCM 4.149 s / actual speaking state 4.633 s, full generation/playback 12.419 s. Warm and shorter samples are different conditions. These cold-start and local CPU/RAM/installation costs remain product limitations. |
| Installed Windows runtime | VERIFIED on disposable hosted Windows for exact source `24ebf455`, run [37120643451](https://github.com/MoNaBOSS/Morpheus/actions/runs/37120643451): actual per-user install, normal runtime with included voice readiness, navigation/draft/Advanced/personality, same-version reinstall and default uninstall. Synthetic profiles and rollback preserved; errors empty. The CI rebuilt installer SHA256 is `05736526a28abece5db1ecf186fa42fa0c902e8b1ccf685304c9169beb03e60e`, distinct from the local delivery EXE. No owner-host install, previous-version upgrade, physical audio, SmartScreen or UAC acceptance is implied. |

Final normal/voice/motion evidence is in
`E:\Morpheus-builds\experience-preview8-final-evidence`; the package is in
`E:\Morpheus-builds\experience-preview8-final-release`. Unpacked application
`Morpheus.exe` / `resources/app.asar` SHA256:
`3bf95b85d220817be139b416c97fd9d21711069821a18057a79a693f47c97ab9` /
`cff9694aa37468e57df3233e30d1181a270d095cd1f21c057a524e13adb44d2a`.
The final normal, generated-voice and motion runs all bind to the same payload.

**Identified installer:**
`E:\Morpheus-builds\experience-preview8-final-release\Morpheus-1.2.0-preview.8-win-x64.exe`,
486,897,301 bytes, SHA256
`94005472d4a419d5e678ac8869c742c8ae21876da4ebd0738bd279f3ccc34eca`.
Static verification passed archive integrity, every one of 40,926 embedded file
paths/sizes, 73 selected extracted hashes, and all 14 normal-runtime identity
hashes, including the complete required worker subtree. Installer version is
`1.2.0-preview.8`; signature status is `NotSigned`. It was assembled from the
qualified unpacked payload. The separate hosted installed test above rebuilt its
own EXE; it did not execute this local EXE on the owner host.

The handoff, build identity, short PC checklist, final voice samples, actual native
motion and returning-launch recording are in
`C:\Users\monir\Documents\Codex\2026-10-02\continue-morpheus-from-the-existing-project\outputs\preview8`.
The large installer stays on E: to preserve C: space. Prior preview.6/preview.7
deliveries and the first preview.8 integration remain intact.

### Preserved first preview.8 integration and diagnosis

Source reverified at `92b79819` and fetched without overwriting work. C:9.37 GiB
and E:146.45 GiB were free before build. The first integrated application source
is `f6ea71448626d7d07d94715213d3c6b62b54cb03`, version `1.2.0-preview.8`.
Its normal packaged runtime, generated-input ordinary voice conversation and
disposable Windows installation passed at the boundaries below. A final bounded
motion performance correction is being qualified before identifying the delivery
EXE. Installed preview.7 and all prior delivery files remain untouched.

Current implemented changes: approved original-logo arrival and real audio contours;
compact settings/draft continuity, editable captions with visibility preference;
Main-owned movable orb/work-area persistence; live ACP spoken replies and typed
interruption; bounded warm local synthesis and local-only playback buffer. Quiet
and check-in controls are reachable under Personality. Ordinary website commands
use the normal OS browser (Chrome on this PC), including “Open the YouTube”.

Current source verification (before packaging):
- Node/web/managed typechecks pass. Full unit run: 329 files / 3,454 tests pass,
  six tests skipped; initial obsolete boot/PCM fixture assumptions were corrected.
- Five design/motion Electron cases pass, including actual compact settings-return
  clicks, retained draft/reply, captions preference, 320-pixel layout, reduced motion
  and hidden pause. The initial real click-through defect is fixed and retested.
- Existing simple/Advanced navigation, typed question hold and native orb
  draft/admission/keyboard-placement cases pass. Direct URL phrasing and work-area
  movement/persistence/cancelled-pointer regressions pass at their unit boundary.
- Real local preview: 362,784 PCM bytes received, scheduled and naturally ended;
  478.9 ms first-PCM-to-scheduled-audio buffer, 12.77 ms largest scheduled gap in
  this sample. These are AudioContext observations, not physical speaker acceptance.
- Generated “How are you today?” traversed the original recorder, real local STT,
  routing/admission and ACP fixture. Live reply: 129,456 PCM bytes played completely;
  typed/manual Stop measured 6.3/13.7 ms. Three exact admitted prompts; no physical
  microphone. This proves the previously missing ordinary-conversation speech path.
- Pinned warm worker benchmark: first PCM 0.98–1.15 s warm / 2.15 s cold, before
  initial playback buffer. About 459 MB working set, unchanged CPU counter over
  ten idle seconds; real 60-second unload/cancel/dispose leave no owned worker.
- Comms replay/compare and diff-aware harness validation/CI pass. Windows harness
  runner itself fails `spawn EINVAL` for pnpm.cmd; its fixed fast/comms steps were
  executed directly and results above are real runs, not a dry-run pass.

Build and native evidence: `E:\Morpheus-builds\experience-preview8-evidence`.
The UI recordings use isolated fixture replies; actual neural audio is in `voice`.
First integrated package evidence:
- Normal startup, original Gateway/Core/ACP, protected synthetic provider, local
  voice sample, compact/full/settings draft/history, held-reply reload with exactly
  one model request, and quiet restart passed. No E2E mode or owner profile.
- Real generated speech traversed the original recorder and local recognition,
  then three ordinary Gateway/ACP turns. The first reply played all 129,446 PCM
  bytes; typed/manual Stop took 20.6/29.7 ms. Model answers were a bounded loopback
  fixture; no physical microphone, paid inference or acoustic acceptance.
- The fresh normal package needed 53.711 s for Gateway readiness; returning window
  2.583 s / Gateway 7.479 s. Cold Voice sample first PCM 4.765 s / speaking state
  5.280 s; generation plus playback 13.423 s. These remain material latency limits.
- Actual 56-DIP native quiet/fade/restore/speaking motion, hidden pause and reduced
  motion passed on the 1920×1080 work area at 100% scaling. Speaking used genuine
  included PCM/meter data. Physical wake and speaker audibility remain untested.
- Clean hosted Windows install, normal installed runtime, same-version reinstall
  and default uninstall passed in run `37119065463`, preserving synthetic profiles
  and rollback. Its rebuilt installer SHA256 is
  `5e5b3de66de707579e23e58bc89913eeb8ebf80a21f79f908bc6776243cab6ab`;
  this is source-level installation evidence, not execution of the local EXE.
- The initial visible orb/blank composer used 92.68% of one CPU core in a 15 s
  observation on this 200 Hz display. A bounded same-machine attribution found
  native orb 83.95% / compact 125.76%; an inspector-only compositor/30 Hz candidate
  reduced these to 22.80% / 32.58% over roughly five seconds each. These short
  comparisons motivated the final CSS correction; they are not final-payload or
  long-session performance acceptance. Actual UI dismissal set both window
  visibility projections false and paused both surfaces' animation loops.

Both historical source checkouts remain clean (`fa988f06`, `3bcad683`). Per-user
installed preview.7 still exists; no owner-host installer/uninstaller was run.

## Current design review gates

| Gate | Status and required evidence |
| --- | --- |
| Product direction | APPROVED: Floating companion by default + Conversation card, automatic temporary editable voice captions, optional hiding with visible mic/mute state. Owner explicitly requested an eye-pleasing animated opening and existing logo. Current installed screenshot remains rejected. |
| Motion design | APPROVED study and IMPLEMENTED application: original M arrival, movable 56-DIP orb, inward compact card, continuous expansion, actual audio contours, dismissal and reduced motion. Native appearance/voice recordings are separate from the simulated browser study. Final bounded-cadence package verification and physical display/drag/wake acceptance remain distinct. |
| Voice architecture | IMPLEMENTED and scoped package VERIFIED: original Main turn ownership, bounded warm local synthesis, live ACP/Core speech queue, original recorder and real local STT, complete PCM playback, typed/manual interruption and mute authority. Recognition remains per-utterance Whisper tiny.en; incremental recognition is not claimed. Physical echo-safe acoustic barge-in is not implemented/qualified. |
| Browser behavior | IMPLEMENTED direct URL route; normal browser launch still requires packaged qualification: ordinary website commands reuse current normal Chrome/profile; no surprise isolated profile. Specify multiple-profile and focus behavior without cookie copying or implicit broad tab access. |
| Companionship | Existing personality, greeting humor, proactivity, quiet hours and off controls are retained and connected through Personality. A new guaranteed daily social check-in service is not claimed; frequency and tone remain user preferences. No emotional inference or intrusive promises. |
| UX flow audit | Draft/focus/older-history/questions now hold compact visibility. Contextual Back preserves the original compact/full surface and draft. Source/native qualification covers these repairs; first-success/task-results and physical interruption retain the evidence boundaries below. Advanced functionality is preserved. |
| Implementation | AUTHORIZED: integrate approved presentation and contextual settings, ordinary ACP speech/follow-up and local speech latency improvements through existing owners; verify actual package. Real microphone/audio quality and external commercial gates remain distinct. |

## Historical preview.7 candidate — application source 757f71c5

| Component | Current evidence |
| --- | --- |
| Spoken general conversation | OPEN — confirmed source gap during the owner's October 3 follow-up: `src/stores/morpheus-voice.ts` can route a voice turn to the original ACP conversation, but `MorpheusVoiceRuntime.tsx` observes only voice-origin Core objective summaries/clarification. There is no automatic ACP assistant-reply speech subscriber. A text answer therefore does not establish a spoken answer or follow-up continuation. The generated system.report qualification below covers Core outcomes only. No live microphone reproduction is claimed by this audit. |
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
No installer/uninstaller ran on the owner host. Autonomous qualification used
synthetic profiles; no owner credential was used. Signing is `NotSigned`;
the updater stays unconfigured with signature
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

## Historical preview.7 delivery record

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

**Exact next step:** one combined owner appearance/physical-PC acceptance using
`Morpheus-PC-Acceptance.md` in the preview.8 delivery folder. Physical microphone
accuracy, wake/echo/audibility, actual Chrome/session behavior, other DPI/taskbar/
display/sleep conditions, owner previous-version upgrade, live paid providers and
publication remain OPEN. Acoustic barge-in while speakers play is not implemented;
typed input, the microphone control and Stop interrupt safely. Commercial launch
also requires owned signing/update operations, hosted funding/operations, pricing/
business country and Stripe/crypto setup; NerdGPT stays deferred. No fake checkout,
subscription or live acceptance. Do not restart approved design work without a
demonstrated regression.
