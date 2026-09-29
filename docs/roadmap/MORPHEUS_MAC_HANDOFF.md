# Morpheus experience reset — Mac handoff

Latest PC continuation: [PC_CODEX_START_HERE.md](../../PC_CODEX_START_HERE.md).
Its September 29 decisions and pickup instructions take precedence.

Updated 2026-09-28. This Git branch is the portable record; the original Windows-local Codex task does not automatically follow you to another computer.

## Phase 6 Mac checkpoint 2 — desktop accounts and PC return

Current checkout: `/Users/mona/Documents/Work/Morpheus`, branch
`codex/morpheus-phase6-managed-layer`. Start from the latest pushed tip, not the
older Phase 4 branch. Read [today's PC return runbook](MORPHEUS_PC_RETURN_2026-09-28.md)
for safe source pickup, exact commands, Windows acceptance and hosted configuration.
The checkpoints below are historical records; this section supersedes their
implementation status and next-step instructions.

Implemented Main-owned configurable Google PKCE/email-code sign-in, encrypted
origin-scoped sessions, refresh/cancellation/sign-out, typed host access, and
account/allowance Settings in all four locales. Added a runnable account-only
HTTP service with required configuration and no default trial or inference route.
Fixed onboarding transcript/draft handling and quiet-mode prompt behavior. Existing
BYOK, approved orb/Matrix presentation and Windows-specific source are preserved.

Mac checks: **2,828 unit tests pass, 17 skipped**; seven skips are explicitly
Windows-only tests to run on PC. All typechecks, build, harness validation/dry-run/CI
and communication checks pass. Full lint has zero errors and 12 existing warnings.
Six distinct Electron account/onboarding/voice scenarios pass. Fixtures do not
prove actual hosted login, chosen voice quality or Windows hardware behavior.

Next: verify this branch on PC, run Windows source and real-device acceptance,
configure hosted identity, then complete measured managed provider/voice routes,
trial lifecycle and remaining paid-path coverage. Payment remains deferred; no
public service, paid calls or trial were enabled. See the
[updated readiness plan](MORPHEUS_PHASE6_READINESS.md) for full-version gates.

## Phase 6 Mac checkpoint 1 — managed service foundation

Latest user direction authorizes adding the Phase 6 layer now and defers payment
selection. Active checkout remains `/Users/mona/Documents/Work/Morpheus`; branch
`codex/morpheus-phase6-managed-layer` starts at Phase 5 `baa7709f`.
Read [Phase 6 readiness and delivery](MORPHEUS_PHASE6_READINESS.md).

Added shared managed contracts, server-side SQLite reservations/accounting events,
authenticated allowlisted gateway, Supabase identity verifier, Main-only client
and protected session-store boundary. Payment routes explicitly remain unavailable.
No hosted resources, provider calls, real trial grants, UI changes or Windows
adapter changes were made. These source modules are not yet connected to desktop
onboarding/Core/voice/OpenClaw or a listening HTTP server.

Validation: 42 focused tests, all three typechecks (node/web/managed), changed-file
lint, harness validation/dry-run, communication replay/comparison and the
renderer/Main/preload build pass. Build warnings remain as before. The broader
Phase 5 baseline unit/lint limitations below were not rerun or claimed fixed.

Next: configure real identity/deployment and bounded provider adapters, connect
the existing host API/onboarding, close managed paid-path coverage, then perform
live evaluation and Windows acceptance. Preserve the existing BYOK paths. The
older instruction below to avoid Phase 6 without direction is satisfied by the
user's new authorization; the Phase 5 acceptance gaps remain open.

## Phase 5 Mac checkpoint 3 — offline engineering complete; live acceptance open

Read the [delivery and direction review](MORPHEUS_PHASE5_DELIVERY.md) for promised
versus delivered scope and the combined Windows acceptance checklist. The user's
“Windows Siri” direction is a voice companion that performs dependable everyday
actions. Keep the approved Morpheus identity and orb-first experience; prioritize
end-to-end reliability and listening acceptance over another visual redesign.

Changed files in this checkpoint:

- Runtime: `electron/services/morpheus/planning/{provider-planner,planner-selector}.ts`,
  `electron/services/morpheus/voice/voice-service.ts`, `electron/services/morpheus/audit.ts`,
  `electron/services/providers/provider-validation.ts`, `shared/morpheus/usage-evidence.ts`.
- Tests: `tests/unit/morpheus-{provider-planner,planner-selector,voice-service,audit,usage-evidence}.test.ts`,
  `tests/unit/provider-validation.test.ts`, `scripts/phase5/usage-report{,.test}.mjs`.
- Harness: `harness/specs/tasks/morpheus-phase5-accounting.md`,
  `harness/specs/rules/morpheus-phase5-evidence.md`,
  `harness/specs/scenarios/gateway-backend-communication.md`.
- Docs: this handoff, `MORPHEUS_PHASE5_{COST_PATHS,EVALUATION,DELIVERY}.md` in this
  directory, and `README.md`, `README.zh-CN.md`, `README.ja-JP.md`, `README.ru-RU.md`.

Active planners now snapshot the selected account/model, reject cross-task reuse,
and retain attempt limits after failure/cancellation. Core/STT/TTS audit receipts
have correlation IDs and truthful terminal usage status; speech records first
audio-byte timing. The local coverage report joins those records and supplied
OpenClaw transcripts, explicitly listing missing/legacy/unobserved costs, including
images and validation. No prices, live quality rankings or global currency cap
were invented. Complete budget enforcement and measured model choice remain open.

Mac evidence: both typechecks, changed-file lint, 87 focused tests, 11 offline reducer
tests, production build, communication replay/compare and harness validation/dry-run
pass. Full suite: 2,767 passed, 9 failed, 10 skipped. The nine failures reproduce on
untouched Phase 4 `c5bb7152` (Windows drive paths and macOS canonical temp paths).
Repository lint has four existing Phase 4 UI errors and twelve warnings; the same
four errors reproduce on that baseline. No Windows-specific source was ported.

Windows packaged app, mic/wake/speech/tray, actual app control, interruption/restart,
existing-user upgrade, final voice choice and release checks remain pending.
Next: collect the matched live quality/cost runs only after providers and a budget
are explicitly authorized, and close the metering/reservation gaps before claiming
a complete BYOK cap. Use the delivery checklist for one combined PC pass.

## Phase 5 Mac checkpoint 1 — paid-path inventory (2026-09-24)

Branch: `codex/morpheus-phase5-routing-accounting`, based on the Phase 4 handoff.
Changed files: this handoff and [paid-path inventory](MORPHEUS_PHASE5_COST_PATHS.md).
Source inspection mapped Core planning/review, ACP/OpenClaw chat/cron/plugins,
transcription, neural speech, validation probes, direct native actions and other
connected services. No paid requests or real cost/quality measurements were made.
Validation: read-only source map and `git diff --check`. Windows hardware and
package acceptance listed below remain open. Next: build a versioned offline
evaluation format, then instrument bounded request outcomes and honest accounting.

## Phase 5 Mac checkpoint 2 — offline evaluation protocol

Phase 5 checkpoint 2 (2026-09-27): added
`scripts/phase5/evaluate.mjs`, `scripts/phase5/evaluate.test.mjs` and
[evaluation protocol](MORPHEUS_PHASE5_EVALUATION.md); updated this handoff.
All five offline reducer tests pass and `git diff --check` passes. These are
fixture correctness checks, not model-quality evidence. Checkpoint 1 was pushed
after network access returned. Next: add correlated terminal usage records,
bounded route ownership and a coverage report; keep live model choice and all
Windows hardware/package checks pending.

## Product direction (settled; do not reopen by default)

Morpheus is an operator and companion, not a dashboard or a chatbot-only shell. The approved UI is the [Phase 1 study](../design/MORPHEUS_APPROVED_INTERFACE_STUDY.md): luminous M-orb, subtle Matrix rain, natural conversation, work/results appearing when useful, a small animated desktop companion that expands to a workspace, and an optional listening tray presence. The [first question](../design/phase4-evidence/activation-greeting-1280x800.png), [welcome](../design/phase4-evidence/activation-welcome-1280x800.png), [ready state](../design/phase4-evidence/activation-ready-1280x800.png), and [compact companion](../design/phase4-evidence/native-compact-command.png) are screenshots captured from the **real app**, not the separate prototype. The old dense Command Center (Ask/Auto/Act modes, trust profiles, internal stages and system panels) is rejected as the everyday interface. Keep advanced controls contextual.

Morpheus should immediately do routine authorized actions, ask only when a genuinely new boundary or ambiguity requires it, remember preferences locally, and keep concurrent tasks going. It should adapt humor and proactivity to the person, use a natural English voice when an actual provider is configured, and never pretend a robotic OS fallback is the selected neural voice. Do not trade away existing tool access or Task Core. Privacy matters: diagnostics are opt-in; wake and cloud speech are separate choices. Report hosted trial, billing and managed inference as unavailable until actually configured and accepted. NerdGPT remains a later milestone.

## Current implementation

Phases 0–3 are preserved in this branch. Phase 4 source work includes the approved first-launch name/welcome/first-request flow, an optional short personalization step, real provider voice previews, eight-second fallback suggestions, direct first-request routing, tray choice, compact conversation surface, shared mission continuity, local profile/memory controls, subtle low-cost check-ins, DND handling and diagnostic-consent hardening. Existing-user profiles can be edited without wiping providers, grants, tasks or history. UI strings are updated in English, Japanese, Chinese and Russian.

First-run remains usable by typing without an account or API key. Natural generated speech, transcription and broader live conversation require configured provider access; a production hosted trial/account step belongs to Phase 6. A neural voice is not certified by these automated tests. This branch is an **internal source checkpoint**, not a signed installer or public release.

## Verification and remaining acceptance

On the Windows development checkout: `pnpm run typecheck` passed; `pnpm run build:vite` passed (existing chunk-size/dynamic-import warnings); full Vitest passed **2,776 tests, 2 skipped** across 273 files; focused Electron journeys passed **11/11** (first launch, objective/memory, compact command, wake orb, and existing foundation); `git diff --check` found no whitespace errors. Real microphone, speakers, wake reliability, provider voice quality, Windows tray behavior on the user's PC, fresh install/upgrade, and genuine task-cost measurements remain for a later hands-on Windows pass. Do not claim those are accepted from mocks or screenshots.

The Mac can continue platform-neutral design, accessibility, profile/memory behavior, routing evaluation and tests. It cannot certify Windows native wake, tray, app launching or microphone behavior. Do not automatically port Windows-specific capabilities to macOS. Phase 5 is quality-preserving routing and unified cost accounting; use [`PROJECT_HANDOFF.md`](../../PROJECT_HANDOFF.md), [`MORPHEUS_TASK_CONTINUITY.md`](../architecture/MORPHEUS_TASK_CONTINUITY.md), and [the full implementation plan](MORPHEUS_EXPERIENCE_IMPLEMENTATION_PLAN.md) as context.

## How to continue on Mac

1. Sign in to the same GitHub account, clone `https://github.com/MoNaBOSS/Morpheus.git`, and switch to `codex/morpheus-phase6-managed-layer` (or fetch/switch it in an existing clone).
2. Open that checkout as a saved project in Codex on Mac. Start a new task with: “Read `AGENTS.md`, `CLAUDE.md`, `PROJECT_HANDOFF.md` and `docs/roadmap/MORPHEUS_MAC_HANDOFF.md`. Continue Morpheus from the latest Phase 6 account checkpoint and PC return runbook. Preserve the accepted UI, keep Windows-only acceptance explicit, and report actual test evidence. Payment selection is deferred; NerdGPT is later.”
3. Keep future work on Git branches with small commits and update this handoff. Push branches before switching devices. Bring changes back to the Windows checkout via `git fetch` and an explicit merge or cherry-pick after reviewing local state—never reset away user work.

The Mac task will have repository context, not the private conversation history from the Windows-local task. This file intentionally records decisions and boundaries so a context-window reset does not silently change the product.
