# Windows 1.0 Companion Campaign — First-Half Acceptance

The first half is complete only when the following real flows work together.

## Activation and presence

- A normal fresh profile receives a full-window Morpheus activation experience
  after required setup, backed by real bridge/runtime/provider/voice signals.
- Activation is skippable, reduced-motion aware, and completed atomically.
- Existing profiles see activation once; normal subsequent launches retain the
  bounded READY boot transition.
- Quick Command and voice shortcuts can summon a compact companion surface while
  Morpheus is in the tray, then restore the previous window state safely.

## Fast interaction

- Known deterministic commands route directly to registered capabilities before
  any provider request.
- Open-ended objectives use the selected provider-neutral planner.
- Voice transcription enters the identical objective path and displays truthful
  listening, transcription, planning, permission, execution, and response state.
- No fake wake-word, transcript, provider result, or execution event is shown.

## Missions

- Every accepted objective creates or continues one durable Mission.
- Mission state follows audited Objective Core transitions and survives restart.
- Interrupted work is marked failed rather than resumed unsafely.
- A user can inspect Mission lineage, plan, artifacts, context, and terminal
  result, cancel active work, and rerun a previous Mission through the same core.

## Projects and memory

- Projects reference existing Main-owned workspaces by logical id only.
- The user can create, inspect, update, disable, and remove Projects.
- The user can create, inspect, disable, and permanently delete bounded memory.
- Sensitive/local-only memory never reaches a provider; audit records never
  contain memory text.
- The active Project and eligible memories enter bounded context selection.

## Product surface

- At 1280x800 the Command Center prioritizes objective input, active Mission,
  runtime readiness, trust, current context, and artifacts without a generic
  card dashboard.
- Missions and Projects are first-class navigation destinations; Chat remains at
  `/chat` and existing OpenClaw product routes remain reachable.
- All new text has English, Chinese, Japanese, and Russian locale coverage.

## Verification

- Targeted unit tests cover store validation/recovery, route selection, context
  filtering, mission reconciliation, onboarding persistence, and compact-window
  restoration.
- Electron E2E covers activation, `/missions`, `/projects`, direct routing,
  companion interaction, real timeline/artifact projection, and existing route
  canaries.
- Typecheck, lint, harness validation, communication replay/compare, Vite build,
  Windows packaging, and a normal-production packaged smoke test complete.

Always-on wake-word detection, unrestricted shell access, autonomous financial
execution, and the remaining second-half proactive intelligence systems are not
part of this acceptance boundary.
