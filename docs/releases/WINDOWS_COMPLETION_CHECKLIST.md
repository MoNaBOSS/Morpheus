# Current Windows experience completion checklist

Updated 2026-10-02, Asia/Dhaka. Preview.6 implementation; **owner acceptance remains open**.
This is the single current checklist. Requirements and baseline evidence live in
[the experience specification](../design/MORPHEUS_EXPERIENCE_REVIEW.md). Previous
checklist detail is recoverable at `3bcad683`; historical preview.5 evidence is
retained in [its handoff](WINDOWS_PREVIEW5_HANDOFF.md).

`VERIFIED` applies only to the stated test boundary. `IMPLEMENTED` is source,
`SIMULATED` is fixture behavior, `OPEN` is untested or unaccepted, and `BLOCKED`
requires external inputs. Automated counts never imply physical PC acceptance.
The owner authorized a combined final review: complete the work and simplify
without reducing capabilities. Separate component review pauses are superseded.

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
| Appearance / motion taste | Short native recordings and real voice samples prepared for combined review. Owner visual/voice acceptance OPEN. Reduced motion and hidden motion ownership retained. |

## C — real first journey

| Item | Result |
| --- | --- |
| API setup | Protected provider implementation preserved, configured accounts detected, secure form and connection testing exposed. No keys requested in chat; no live paid-provider request made in qualification. |
| Included speech | IMPLEMENTED and real engine VERIFIED: pinned static sherpa-onnx, Whisper tiny.en int8, Kokoro v1.0 int8. Default English Michael / alternate Heart. No voice key or hosted account. Actual synthesis, exact generated-command transcription and cancellation cleanup passed. |
| Mic / audible output | Device selection, real input test, output sample and specific repair guidance implemented. Physical microphone accuracy, naturalness, speaker echo, same-breath wake and spoken execution OPEN owner gates. Samples are real neural audio, not Windows narrator or simulated sound. |
| Persistence / routing | Existing personality/context model owners retained. Native tests verify profile changes, restart and draft/history; normal packaged runtime qualification pending below. |
| Disappear / wake / mute | Ten-second completed-idle fade; busy audio/question states hold, hidden tasks continue. Input mute wins; local wake opt-in uses Windows default mic. Tray/shortcut routes retained. Native timer/work-area tests pass; physical wake/lock/sleep OPEN. |

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
| Source regression | VERIFIED: 324 unit files, 3,336 passed and two skipped. Real bundled voice tests included. Typecheck passed; lint zero errors / 12 existing warnings. Comms replay/compare and harness CI/task validation/dry-run passed. Native journeys: 12 initial passes, one old overlay expectation corrected for intentional Windows compact behavior and targeted retest passed. |
| Fresh package | NEXT: produce fresh preview.6 Windows payload with pinned voice/notices, then run normal isolated startup, local execution, secure loopback provider, conversation/persistence and voice playback/cancellation checks. |
| Identified EXE | NEXT: compile NSIS from qualified payload, inspect exact artifact/version/hashes and deliver. Unsigned; no owned update feed. |
| Installed upgrade / hardware | OPEN: installer execution, upgrade/uninstall with owner profile, physical mic/echo/interruption, DPI/taskbar positions/display removal/sleep, live paid provider/publication and long mixed-use session. Do not label source or fixtures as installed acceptance. |

## Current record and exact next step

All implementation stays in the E: worktree; no owner installation/profile is replaced.
Qualify the fresh packaged preview.6 using an isolated normal runtime, record actual
UI transitions plus independently generated voice samples, then deliver the exact
EXE, package identity, limitations and one short combined PC acceptance checklist.
Update this E record with actual outcomes before handoff. No separate competing plan.
