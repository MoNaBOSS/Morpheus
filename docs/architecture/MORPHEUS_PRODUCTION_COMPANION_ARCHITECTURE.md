# Morpheus Production Companion Architecture

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
- Each detected bounded utterance is transcribed through the existing Voice
  service. Main returns the transcript; the UI matches the exact normalized
  wake phrase and submits only the remaining objective through Objective Core.
- No audio or transcript is persisted. Audit records only session id, provider
  id, byte count, duration, state and outcome.
- Listening and provider disclosure are always visible. Hiding the main window
  does not hide the tray/microphone state.
- Barge-in cancels local speech synthesis immediately. Cancelling active work
  still uses Objective Core cancellation; voice cannot bypass runtime state.

This release does not claim offline wake-word detection. A loopback transcription
provider is the supported local/private option behind the same contract.

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
