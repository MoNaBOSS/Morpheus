# Morpheus experience reset — Mac handoff

Updated 2026-09-27. This Git branch is the portable record; the original Windows-local Codex task does not automatically follow you to another computer.

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

Morpheus should immediately do routine authorized actions, ask only when a genuinely new boundary or ambiguity requires it, remember preferences locally, and keep concurrent tasks going. It should adapt humor and proactivity to the person, use a natural English voice when an actual provider is configured, and never pretend a robotic OS fallback is the selected neural voice. Do not trade away existing tool access or Task Core. Privacy matters: diagnostics are opt-in; wake and cloud speech are separate choices. Do not invent a hosted trial, billing, managed API, or NerdGPT integration yet.

## Current implementation

Phases 0–3 are preserved in this branch. Phase 4 source work includes the approved first-launch name/welcome/first-request flow, an optional short personalization step, real provider voice previews, eight-second fallback suggestions, direct first-request routing, tray choice, compact conversation surface, shared mission continuity, local profile/memory controls, subtle low-cost check-ins, DND handling and diagnostic-consent hardening. Existing-user profiles can be edited without wiping providers, grants, tasks or history. UI strings are updated in English, Japanese, Chinese and Russian.

First-run remains usable by typing without an account or API key. Natural generated speech, transcription and broader live conversation require configured provider access; a production hosted trial/account step belongs to Phase 6. A neural voice is not certified by these automated tests. This branch is an **internal source checkpoint**, not a signed installer or public release.

## Verification and remaining acceptance

On the Windows development checkout: `pnpm run typecheck` passed; `pnpm run build:vite` passed (existing chunk-size/dynamic-import warnings); full Vitest passed **2,776 tests, 2 skipped** across 273 files; focused Electron journeys passed **11/11** (first launch, objective/memory, compact command, wake orb, and existing foundation); `git diff --check` found no whitespace errors. Real microphone, speakers, wake reliability, provider voice quality, Windows tray behavior on the user's PC, fresh install/upgrade, and genuine task-cost measurements remain for a later hands-on Windows pass. Do not claim those are accepted from mocks or screenshots.

The Mac can continue platform-neutral design, accessibility, profile/memory behavior, routing evaluation and tests. It cannot certify Windows native wake, tray, app launching or microphone behavior. Do not automatically port Windows-specific capabilities to macOS. Phase 5 is quality-preserving routing and unified cost accounting; use [`PROJECT_HANDOFF.md`](../../PROJECT_HANDOFF.md), [`MORPHEUS_TASK_CONTINUITY.md`](../architecture/MORPHEUS_TASK_CONTINUITY.md), and [the full implementation plan](MORPHEUS_EXPERIENCE_IMPLEMENTATION_PLAN.md) as context.

## How to continue on Mac

1. Sign in to the same GitHub account, clone `https://github.com/MoNaBOSS/Morpheus.git`, and switch to `codex/morpheus-phase4-mac-handoff` (or fetch/switch it in an existing clone).
2. Open that checkout as a saved project in Codex on Mac. Start a new task with: “Read `AGENTS.md`, `CLAUDE.md`, `PROJECT_HANDOFF.md` and `docs/roadmap/MORPHEUS_MAC_HANDOFF.md`. Continue Morpheus from the approved Phase 4 source checkpoint. Do not redesign the accepted UI. Keep Windows-only acceptance deferred, report actual test evidence, and avoid expanding into Phase 6/NerdGPT without direction.”
3. Keep future work on Git branches with small commits and update this handoff. Push branches before switching devices. Bring changes back to the Windows checkout via `git fetch` and an explicit merge or cherry-pick after reviewing local state—never reset away user work.

The Mac task will have repository context, not the private conversation history from the Windows-local task. This file intentionally records decisions and boundaries so a context-window reset does not silently change the product.
