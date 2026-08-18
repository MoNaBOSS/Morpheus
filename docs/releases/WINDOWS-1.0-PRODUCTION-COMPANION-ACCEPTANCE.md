# Windows 1.0 Production Companion — Acceptance

This release is accepted only when the following packaged, truthful flows work
together. Contracts, placeholder pages and mocked providers do not count.

## Voice companion

- Push-to-talk and opt-in ambient voice use the same Voice service and Objective
  Core.
- Ambient mode is off by default and explains provider disclosure before enable.
- Armed, listening, transcribing, understanding, working and speaking states
  are visible in the app and tray.
- A transcript without the exact wake phrase creates no objective.
- A wake phrase plus objective creates one real Mission.
- Audio/transcripts are never persisted or audited.
- Barge-in stops speech; Escape cancels capture; runtime cancellation remains
  Main-owned.
- Reduced-motion and no-provider states are truthful and usable.

## Today and proactivity

- Today shows source-backed attention from Missions, Goals, schedules and
  repeated work.
- Items can be dismissed, snoozed and acted on; state survives restart.
- Quiet hours suppress notification delivery without deleting attention state.
- Duplicate source events do not create repeated items.
- The service makes no unbounded background provider calls.
- Proactive execution enters Objective Core, plan trust and Audit.

## Goals

- Users can create, edit, pause, complete and delete Goals with milestones,
  success criteria, target date, Project/workspace and next action.
- Progress is derived from milestones.
- Continue creates a new Objective/Mission in the exact stored context.
- Completed/failed Objective outcomes append truthful Goal history.
- Restart never claims interrupted native work is running.

## Systems

- A reusable eligible Mission can produce a reviewed System draft.
- A System references one real Agent Profile, workflow, workspace/Project and
  exact capability boundary.
- Test once performs a real run through Objective Core.
- Activation requires a successful test and valid references.
- Activation never creates permission grants; exact trust is still evaluated.
- Pause disables schedules immediately; invalid dependencies degrade visibly.
- System run history links to real Missions and artifacts.

## Product experience

- `/` remains the Morpheus Command Center and shows command, Today attention,
  current Goal/Mission, voice presence, runtime and trust above the fold at
  1280x800.
- `/systems`, `/goals`, `/missions`, `/projects`, `/chat` and existing OpenClaw
  routes remain reachable.
- Compact voice/Quick Command presentation restores the previous window state.
- No normal UI shows ClawX identity, fake agents, fake diagnostics or fake work.
- All new user text is localized in en, zh, ja and ru.

## Security and regression

- Main validates every new host payload and rejects unknown fields.
- Audit failure blocks ambient provider disclosure and unsafe background work.
- Renderer cannot mint grants, widen roots or activate untested Systems.
- Existing exact grants remain reusable and critical confirmation remains
  unwaivable.
- OpenClaw Gateway and Chat connect in a normal packaged launch.
- No duplicate process, startup loop, fatal renderer error or orphaned owned
  Gateway remains after shutdown.

## Required verification

- `git diff --check`
- typecheck and lint
- all Morpheus unit tests
- focused voice/proactive/Goal/System E2E
- routing and OpenClaw regression E2E
- harness validation and dry run
- communication replay and comparison
- Windows NSIS packaging
- normal-production packaged smoke
- visual inspection at 1280x800 and the current desktop resolution

## Verified Signal OS release-candidate result — 2026-08-18

- Packaged runtime source: `8ba4568`.
- The original Signal identity, cinematic activation, Today / Mission / Context
  Command Center, compact Presence/Invoke surface, and plan-level trust
  presentation are implemented and localized.
- Morpheus unit tests: 615/615 pass across 65 files. Typecheck, Signal OS
  harness validation/dry run, communication replay/comparison, Vite build, and
  23/23 core Signal OS E2E pass.
- Lint: zero errors with 12 inherited Fast Refresh warnings.
- Full Morpheus E2E passed 51/52 in one run; the single fixture-sensitive
  session-grant scenario passed on an immediate targeted rerun.
- `pnpm package:win` produced
  `release/Morpheus-1.0.0-win-x64.exe` (263,671,241 bytes), SHA-256
  `39454470DB3006F778F0D17AD334392E9E60D3B48D78FAEA91E3AC7732EBC77C`.
- Authenticode is `NotSigned`; release signing remains CI/credential-owned.
- Existing-profile packaged smoke passed Gateway readiness, real deterministic
  execution, sequential Mission progress, artifact projection, Invoke, and
  fresh Chat. A restored historical Chat session retained a stale disabled
  composer despite connected Gateway state and remains known inherited debt.
- Fresh-profile packaged smoke passed setup into the cinematic activation, real
  calibration, companion personalization, a real privacy-safe first mission,
  final **Morpheus is ready**, natural Command Center entry, and complete owned
  process/Gateway cleanup.
- Visual inspection passed at 1280×800 and the current desktop resolution.
  Screenshots remain outside Git as verification artifacts.
