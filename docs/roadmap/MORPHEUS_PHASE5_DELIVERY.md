# Phase 5 delivery and direction review

2026-09-27. Development checkout: `/Users/mona/Documents/Work/Morpheus`.
Branch: `codex/morpheus-phase5-routing-accounting`, based on Phase 4 `c5bb7152`.

## What was promised and what is delivered

| Promised scope | Delivered evidence | Remaining boundary |
| --- | --- | --- |
| Preserve the approved orb/Matrix/conversational companion and existing capabilities | Additive backend instrumentation and offline tools; no UI redesign, account reset or Windows adapter changes | Phase 4 user/device acceptance remains open |
| Map paid models, OpenClaw, STT, TTS and other services first | [Source inventory](MORPHEUS_PHASE5_COST_PATHS.md), including image generation/editing and validation probes | Arbitrary installed plugins/services cannot be exhaustively priced from Morpheus source |
| Design measured quality/cost evaluation | [Matched-task protocol](MORPHEUS_PHASE5_EVALUATION.md) and offline reducer; success, action/audio timing, corrections, handoff failures, attempts and cost per success | No live benchmark has run; fixtures only verify reducer behavior |
| Bounded routing and stable ownership | Active planner snapshots account/headers/model, rejects cross-objective reuse, retains failed/cancelled attempt allowance and reports resolved model | No evidence-based cheap/strong default change; restart recovery still follows Phase 3, and an active planner snapshot is not a durable route reservation |
| Consistent persona/context | Existing Core context and voice/personality path preserved, without another paid rewriting call | Cross-model persona quality still needs matched live runs and listening |
| Unified usage accounting preparation | Correlated start/terminal receipts for Core/STT/TTS; validated numeric token/cache units; request timing; first audio byte; offline report combines supplied audit and OpenClaw sources | Not a billing ledger; cost can remain unknown, voice receipts lack objective attribution, retention/deletion creates gaps, and other paid paths remain unmetered |
| Budget control based on evidence | Existing request/output limits retained and tested; Responses validation probe now has an output limit; report explicitly refuses a complete cap claim | User-specified currency budgets are not implemented or enabled. Verified rates, durable reservations/reconciliation and coverage of image/validation/OpenClaw/plugin calls are still needed |
| Portable reviewable checkpoints | Inventory and evaluation committed/pushed separately; final source checkpoint includes handoff and test evidence | Bring this branch to Windows after preserving that checkout's local work |

The authorized offline engineering checkpoint is complete. **Full Phase 5
acceptance remains open** for live quality comparison, provider bill evidence and
complete currency-budget enforcement. No live paid evaluation, purchase, Phase 6
account/billing work or NerdGPT integration was performed. No prices were invented.

## Verification on Mac

- Node and web typechecks pass after generating the repository's empty extension
  bridge with `node scripts/generate-ext-bridge.mjs` in the fresh checkout.
- Focused provider/planner/voice/audit/validation/unit-evidence suites: 87 tests pass.
- Offline evaluation and coverage reducer: 11 tests pass. These use synthetic
  data and contain no measured provider-quality or actual-bill claims.
- Communication replay and comparison pass. Harness validation and dry-run pass.
- Production Vite renderer/Main/preload build passes with existing dynamic-import
  and bundle-size warnings. This is not Windows installer or hardware acceptance.
- Changed TypeScript files pass read-only ESLint. Repository lint has four errors
  in untouched Phase 4 UI files plus twelve existing Fast Refresh warnings.
- Full unit run: 2,767 passed, 9 failed, 10 skipped across 274 files. The nine
  failures are reproduced on untouched Phase 4 `c5bb7152` in an isolated checkout:
  six app-launch tests and one process test assume Windows drive paths; two tests
  compare `/var/...` with macOS's canonical `/private/var/...`. Baseline lint also
  reproduces all four errors in `MorpheusSocialCheckIn.tsx`, `MorpheusActivation.tsx`
  and `MorpheusOnboardingSettings.tsx`. These are explicitly retained as existing
  validation limitations; no production Windows path handling was changed to make
  Mac fixtures pass.

## Direction: the Windows voice companion

The user's “Windows Siri” description fits the approved architecture and interface:
wake into an orb, ask naturally, perform a real action, respond briefly, and keep
useful work running. Morpheus already has the source foundations for that direction:
registered desktop actions, one execution authority, remembered permissions,
concurrent task coordination, local memory, voice and a compact/full companion.

The necessary shift is in emphasis and acceptance, not another interface rebuild.
Lead with **“Morpheus — your Windows companion”** and demonstrate a few dependable
everyday routines. Keep technical provider/task controls contextual. Treat
“Windows Siri” as the experience shorthand; keep Morpheus's own name, M mark, orb
and Matrix personality. Do not imply Microsoft/Apple affiliation or universal
control of every Windows application.

The next proof is repeated actual use: wake reliability, natural English voice,
fast useful actions, clean interruption, reliable follow-ups and trustworthy
background completion. The source is in a good position for that acceptance pass;
the finished experience is not yet proven. Cost/model changes should support those
outcomes after measurement. Adding dashboards or paid tiers now would not close
these acceptance gaps.

## One combined Windows acceptance pass

1. Preserve the PC checkout's uncommitted files and settings. Fetch this branch,
   review the Phase 4 → Phase 5 diff, then merge or cherry-pick explicitly. Do not
   reset the existing profile or test an older installer.
2. Run the normal type/build/unit/communication checks on Windows; review the
   existing Phase 4 lint issues separately. Build the private candidate from this
   source without a version/release claim from Mac.
3. Check fresh first-run and existing-user upgrade: approved name/welcome flow,
   preserved providers, grants, tasks, memory and history; full/compact/orb state.
4. Check tray, local wake, mic/speaker and headset changes, mute, sleep/resume,
   no focus theft and offline failures. Audition natural English voices by listening
   before selecting the final voice. Native fallback must be identified honestly.
5. Repeat wake → registered app/site action → short spoken result → follow-up;
   interrupt audio and issue another command. Old audio must not resume. Confirm
   stopping speech does not cancel research and cancelling a task selects the right
   task. Test background work plus a quick command, then restart mid-task and
   verify that completed effects are not duplicated.
6. Exercise DND/ignored check-ins, remembered preferences and forgetting a memory.
   Review a representative multi-step task and a real failure/recovery.
7. With separately specified providers and paid budget, collect the matched live
   evaluation cases, aggregate all attempts and paid routes, reconcile provider
   costs and record actual first-action/audible-audio timings. Keep this evidence
   distinct from fixtures and app estimates. Decide routing only after review.
8. Record pass/fail/evidence for packaging, install/upgrade, interruption/restart,
   app control, voice/tray and release gates. Signing, update/distribution and public
   release remain later phase work; this document prepares the pass only.

Next Phase 5 decision: choose a bounded live evaluation budget and provider set,
or continue closing the listed metering gaps offline. Neither option requires
reopening the accepted interface or starting Phase 6.
