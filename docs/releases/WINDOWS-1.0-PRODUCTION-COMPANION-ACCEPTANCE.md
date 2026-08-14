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

## Verified release result — 2026-08-14

- Packaged runtime source: `d9a2ac8d5c7cde2e4b0582bc1b2c8e3f9feace66`.
- Morpheus unit tests: 611/611 pass; typecheck, harness, communication replay,
  and focused production-companion E2E pass.
- Lint: zero errors with 12 inherited Fast Refresh warnings.
- The full inherited suites retain 16 Windows path/mock unit failures and two
  reproducible Chat E2E regressions in untouched paths; exact files and results
  are recorded in `PROJECT_HANDOFF.md`.
- `pnpm package:win` produced
  `release/Morpheus-1.0.0-win-x64.exe` (263,669,614 bytes), SHA-256
  `2D2F2388D051BC2907FB15067815373C9EB6415C290591C5EE61B48A33815E98`.
- Authenticode is `NotSigned`; release signing remains CI/credential-owned.
- Normal-production smoke passed first-run SYSTEM READY, Command Center, real
  system execution, Mission/Activity projection, Quick Command, Goals, Systems,
  live Gateway, a real provider-backed Chat response, existing-session loading,
  process stability, fatal-log scan, and complete owned-process cleanup.
- Visual inspection passed at 1280x800 and 1920x1080. Screenshots remain outside
  Git as verification artifacts.
