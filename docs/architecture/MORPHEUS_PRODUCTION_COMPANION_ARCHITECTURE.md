# Morpheus Production Companion Architecture

Historical foundation with later amendments: current surfaces/voice/worker design
are in [the Phase 7 architecture](MORPHEUS_ASSISTANT_ARCHITECTURE.md). The old
sequential-all-work and one-command follow-up descriptions below are historical;
use [task continuity](MORPHEUS_TASK_CONTINUITY.md) and current shared voice constants.
Historical hardware observations are not tests of today's candidate.

## Decision

The production companion extends the existing Objective Core. Ambient voice,
proactive attention, Goals and Systems are origins, projections or durable
composition services—not new planners or executors.

```text
ambient voice / push-to-talk / Today / Goal / System / existing entry surfaces
                                  |
                                  v
                           Objective Core
        context -> planner -> typed plan -> trust delta -> executor -> observation
                                  |
                  Mission + Goal + System run projection
                                  |
                     Today / Activity / artifacts / audit
```

## Ambient voice

- Renderer owns `MediaStream` and Web Audio energy detection because Chromium
  owns microphone capture.
- Main owns settings, ambient-session identity, provider disclosure,
  transcription, audit and companion-window presentation.
- Ambient mode is disabled by default. Starting it requires an explicit user
  setting and a real OS media permission.
- In legacy cloud monitoring, each detected bounded utterance is transcribed through the existing Voice
  service. Main returns the transcript; the UI matches the exact normalized
  wake phrase and submits only the remaining objective through Objective Core.
- No audio or transcript is persisted. Audit records only session id, provider
  id, byte count, duration, state and outcome.
- Listening and provider disclosure are always visible. Hiding the main window
  does not hide the tray/microphone state.
- Barge-in cancels local speech synthesis immediately. Cancelling active work
  still uses Objective Core cancellation; voice cannot bypass runtime state.

### Opt-in local wake (1.0.4 candidate)

`voice/windows-wake.ts` owns a Windows System.Speech helper with a fixed exact-name
grammar. It runs application-owned static code with `shell: false`, accepts only
validated phrase/configuration on stdin, and is terminated with its owner. The
first installed English recognizer is used; other recognition languages are not
certified. No ambient audio is sent to a provider by the native name detector.

Main audits each accepted wake before emitting a sequence. A wake admits one
bounded capture inside a 12-second addressing window, followed by one transcription
request. Capture permission is also enforced in Main, not just by the visual
indicator. The command uses the configured transcription provider. Local mode
never silently falls back to continuous cloud monitoring. Existing profiles keep
their saved mode; users explicitly choose local detection in Voice settings.

The Renderer acknowledges the wake with a local tone/caption and a follow-up
window. The hidden app's existing compact companion opens on the audited wake.
Cancellation, configuration changes and generation checks reject stale input.
This is one-command follow-up, not an always-open full-duplex conversation.

The current machine loaded its recognizer but failed to open its default audio
input. Native helper tests are not evidence of successful real microphone capture.

### Speech output and readiness

Main streams bounded MP3 chunks over `morpheus:speech-chunk` after the speech-start
audit. Correlation id, sequence and total byte limits bind one ephemeral Renderer
MediaSource to its request. No audio is stored. Buffered playback remains available
when MediaSource MP3 is unsupported. Failed playback cancels pending generation
before Windows fallback; cancellation prevents stale output. Speaking state begins
on actual playback, not request dispatch. Provider latency is not fabricated.

Voice settings offer a real selected-voice preview, explicit neural versus Windows
fallback result, and a separate microphone transcription check that never submits
work. A configured provider is not a successful test. The audio-reactive Signal is
a transient level visualization, not proof of comprehension. Live latency, voice
quality and wake reliability remain separate release gates.

## Proactive service

`MorpheusProactiveService` is a bounded Main-owned observer. It periodically
reads safe projections from Mission, Goal, schedule and workflow stores and
writes validated `AttentionItem` records atomically.

The service has no direct native authority. A notification or suggested action
is submitted as a Main-authored objective/plan and therefore enters policy,
execution and audit. Duplicate source fingerprints are coalesced. Dismissal,
snooze, quiet hours and notification delivery are persisted and audited.

No background provider call is required to discover facts. Optional wording or
planning uses a configured provider only after an explicit user action.

## Goals

`MorpheusGoalStore` persists bounded platform-neutral Goal records. A Goal owns
no capability and no grant. It links Project/workspace context, milestones,
Missions, schedules and a concise next action.

Goal progress is calculated from milestone state. `continueGoal(goalId)` resolves
the stored next action in Main and submits a new objective with the Goal's exact
context. Objective transitions project back to Goal history after Audit, never
before it.

## Systems

`MorpheusSystemStore` persists references to one Agent Profile, workflow,
workspace/Project, schedules and output policy. `MorpheusSystemService` validates
every reference on save, derives exact capability boundaries from the workflow,
and owns lifecycle state: `draft`, `tested`, `active`, `paused`, `invalid`.

Creating a System from a Mission uses the Mission's bounded reusable blueprint.
The blueprint contains logical capability ids, validated parameters and
dependencies only. Parameters classified as transient content are not retained;
such a Mission is ineligible until explicit reusable inputs exist.

- **Test once** compiles the referenced workflow and submits it through Objective
  Core.
- **Activate** is allowed only after a successful test and valid exact
  references. It enables associated schedules but does not mint grants.
- **Pause** disables associated schedules immediately.
- System run history points to real Objective/Mission ids.

## Persistence and ordering

All new stores use the existing validated atomic JSON helper, schema versions,
bounded collections and recovery behavior. Every control mutation and state
transition is audited before an event reaches Renderer. Audit degradation blocks
ambient provider disclosure, System activation and unsafe proactive execution;
local read-only Today rendering remains available.

## IPC boundary

Renderer uses typed host-invoke methods for settings, snapshots and logical
commands. Unknown fields are rejected. Renderer never supplies:

- executable paths, command lines, environment variables or shell strings;
- filesystem roots;
- permission grants;
- a fabricated Mission/Goal/System status;
- a schedule run result;
- an ambient session id;
- an audit or proactive event.

## Sequential execution

Execution remains sequential for Windows 1.0. Proactive, scheduled and manual
work queue behind the active Objective rather than racing it. Concurrency is a
future scheduler/resource-locking feature, not an implicit side effect of
background presence.
