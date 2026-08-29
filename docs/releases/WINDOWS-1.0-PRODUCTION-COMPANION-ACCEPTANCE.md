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
- Provider-generated speech uses a fixed Main-owned endpoint, bounded ephemeral
  audio, no persisted response payload, and a truthful Windows fallback.
- The user's communication personality affects wording and supported neural
  delivery only; it cannot change plans, trust or capability authority.
- Barge-in stops speech; Escape cancels capture; runtime cancellation remains
  Main-owned.
- Reduced-motion and no-provider states are truthful and usable.
- Boot, activation, Command Center, Invoke and trust show one original living
  Signal driven by real lifecycle state.

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

## Verified Larry review-candidate result — 2026-08-19

- Packaged runtime source: `0d85962` (Signal OS source `8ba4568` plus truthful
  restored-session composer readiness).
- The original Signal identity, cinematic activation, Today / Mission / Context
  Command Center, compact Presence/Invoke surface, and plan-level trust
  presentation are implemented and localized.
- Morpheus unit tests: 615/615 pass across 65 files. Typecheck, Larry review
  harness validation/dry run, communication replay/comparison, Vite build, and
  51/51 full Morpheus E2E pass.
- Lint: zero errors with 12 inherited Fast Refresh warnings.
- Chat/Gateway regression canaries pass 16/16.
- The repository-wide suite passes 2,570 tests with 2 pending and retains 16
  pre-existing Windows path/mock failures in three untouched OpenClaw tests.
- `pnpm package:win` produced
  `release/Morpheus-1.0.0-win-x64.exe` (263,671,900 bytes), SHA-256
  `1F97350612062BE49D2FD6B03B79C9A81FE8E14591EB95FAA4AEDEA0D721C6B5`.
- Authenticode is `NotSigned`; release signing remains CI/credential-owned.
- Existing-profile packaged smoke passed Gateway readiness, real deterministic
  execution, sequential Mission progress, artifact projection, Invoke, and
  fresh Chat. The restored-session readiness defect is fixed and covered by
  unit and Electron E2E regression tests.
- Fresh-profile packaged smoke passed setup into the cinematic activation, real
  calibration, companion personalization, a real privacy-safe first mission,
  final **Morpheus is ready**, natural Command Center entry, and complete owned
  process/Gateway cleanup.
- Visual inspection passed at 1280×800 and the current desktop resolution.
  Screenshots remain outside Git as verification artifacts.
- The rebuilt unpacked production executable started normally at 1280×800,
  rendered the Morpheus setup identity without fatal errors, and left zero
  packaged processes or owned Gateway listeners after cleanup.

## Living-presence completion — 2026-08-29

- Runtime source: `9222a10`.
- Original living Signal, provider-neutral neural speech output, communication
  personality propagation and onboarding-to-proactive preference wiring are
  implemented without widening native or permission authority.
- Typecheck, harness validation, communication replay/comparison, 695/695
  Morpheus unit tests and 12/12 focused Electron journeys pass.
- Visual inspection passed for boot, activation and Command Center at 1280x800;
  screenshots remain outside Git.
- `pnpm package:win` produced `release/Morpheus-1.0.0-win-x64.exe`
  (263,687,066 bytes), SHA-256
  `FD0F78187FEBDA46BD76AB7BF672CC0813F38F27B46C5A36948716FAE41419E5`.
- The exact unpacked production executable started with a stable five-process
  tree, rendered the new Signal, brought Gateway health to HTTP 200, and left
  zero packaged processes or listeners after cleanup.
- Authenticode remains `NotSigned`; production signing is still CI and
  credential-owned.
