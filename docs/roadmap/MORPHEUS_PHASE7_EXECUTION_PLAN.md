# Phase 7 — finish the Windows assistant

Updated: 2026-09-30. Owner handoff: Astra architecture → Sol implementation.
Application baseline: `32badea9c792863cbc9248100025f18f83d26e00`, branch
`codex/morpheus-phase6-managed-layer`.

**Status: architecture and implementation handoff prepared; Phase 7 implementation
and final acceptance remain open.** Do not relabel the plan or prior source tests
as a completed product. NerdGPT work is deferred, not a dependency for Phase 7.

Start from [SOL_START_HERE.md](../../SOL_START_HERE.md). Governing contracts:
[assistant architecture](../architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md),
[acceptance/evidence](../releases/MORPHEUS_PHASE7_ACCEPTANCE.md),
[original decisions](MORPHEUS_EXPERIENCE_IMPLEMENTATION_PLAN.md), and
[task continuity](../architecture/MORPHEUS_TASK_CONTINUITY.md).

## 1. What this pass established

- Verified actual Windows repository, remote and clean application branch; fetched
  origin. No old installer/default branch was used as current-source evidence.
- Reviewed presence/compact routing, voice, task contracts/coordination, browser
  and site boundaries, provider secret storage, managed readiness and release setup.
- Identified product drift in old canonical documents and the compact-to-Chat
  transition. The primary surface is the companion, not the rejected dashboard.
- Selected native motion implementation direction: quiet halo + fluid green/teal
  active aurora, preserving the M/orb; real visual acceptance still required.
- Kept all established use cases; put unfinished Phase 5/6 prerequisites into the
  delivery sequence instead of calling them accepted because scaffolding exists.

Historical verification, not run again for this documentation pass:
September 29 baseline `92fe48fa` had 2,849 unit passes / 2 skips. After the narrow
native hover change, 16 targeted units and 14 selected Electron scenarios passed,
plus typechecks, lint, build, communication checks and harness checks. The full
unit suite was not rerun after that change. Read the
[Windows checkpoint](MORPHEUS_PC_CHECKPOINT_2026-09-29.md) for exact scope.

## 2. Deliverables and honest release labels

1. **Larry's usable Windows candidate:** real native companion, natural voice,
   scoped autonomous work, real cited research and website create/revise/publish,
   preserved existing capabilities, measured responsiveness, reliable recovery,
   protected provider migration and tested packaged install/upgrade. BYOK is valid
   for this candidate; disclose managed features that are not yet live.
2. **Public managed-ready release:** the above plus complete account/managed-voice,
   usage/allowance, operational, payment, privacy, signing/update gates. Do not call
   a BYOK-only candidate “every feature finished.”
3. **Later:** NerdGPT renovation/evil activation, Hermes evaluation, other native
   platforms, selected-memory sync and financial transactions. Architecture leaves
   extension points; no fake integrations or universal-app-control promise.

No price, unlimited trial, paid hosting vendor or signing identity is invented.
The user has not supplied production service credentials or a final payment
country/provider. These block only the corresponding live gates, not local work.

## 3. Small implementation checkpoints

Each row is a separately reviewable implementation checkpoint, **not one prompt
to rewrite its whole section**. Complete code, focused tests, UI evidence when
applicable, and a durable checkpoint before moving on. Continue in dependency
order while authorized; do not ask the user to reapprove settled decisions.

Status vocabulary: `TODO`, `IMPLEMENTED`, `AUTOMATED`, `LIVE-VERIFIED`, `BLOCKED`.
Only record what the evidence supports. All rows below start TODO.

| ID / status | Deliverable and concrete pass condition | Depends on |
| --- | --- | --- |
| 7A.1 IMPLEMENTED | Main assistant session/turn projection. Duplicate request returns same admission; two rapid turns neither overwrite nor cross conversations; stale events rejected. Focused source tests pass; packaged/live continuity remains open. | Baseline |
| 7A.2 AUTOMATED | Native real upward composer. Windows Electron source-build test covers inactive hover, explicit focus/type, Escape draft, one admission, screen anchor and compact handoff. Packaged hardware/accessibility acceptance remains open. | A.1 |
| 7A.3 AUTOMATED | Compact/full project the same ACP conversation and Main draft; fixture reply stays in a native compact window with no `/chat` redirect, and expansion/dismiss preserves draft. Live provider and packaged acceptance remain open. | A.1–2 |
| 7A.4 TODO | Shared orb motion + actual mic/playback level. Native/React fidelity, reduced motion, keyboard access, hidden animation pause and tray transition recorded. | A.2–3 |
| 7B.1 TODO | Protected provider secret migration across consumers. Crash fixtures preserve keys/settings; no migrated plaintext copies; unavailable protection fails safely. | Baseline; before paid live tests |
| 7C.1 TODO | Real wake/capture lifecycle. Same-breath wake+command captured once, mic mute/lock respected, unplug/replug and missing input produce usable recovery. | A.1–2, B.1 |
| 7C.2 TODO | Natural output, barge-in and follow-ups. Three true voice auditions; interruption kills old audio/generation; speech stop does not cancel work; no-speech costs zero. | C.1 |
| 7C.3 TODO | Unified persona, short onboarding and returning behavior. Name/skip/Matrix welcome, existing-profile preservation, 8-second genuine-question fallback, daily greeting and DND cases pass. | A.3, C.2 |
| 7C.4 TODO | Useful bounded memory/proactivity. Correct/delete/export memory; ignored check-in backs off; no inferred emotions or paid polling; existing chat retention preserved. | C.3 |
| 7D.1 TODO | Core worker port and one existing runtime adapter. Owned ids, scoped tools, leases, cancellation, artifacts, usage and unknown-effect recovery verified with fixtures. | A.1, B.1 |
| 7D.2 TODO | Real browser navigation/interaction. Named sites, DOM actions, account scope, redirects/downloads, keyboard fallback and cancel; no policy bypass through agent tools. | D.1 |
| 7D.3 TODO | Research → cited answer → saved report. Sources actually retrieved; citations open safely; unavailable sources labeled; launch another app during research without cancelling it. | D.2, A.3 |
| 7E.1 TODO | Static website create/revise loop. Recoverable revisions preserve user edits; safe static verifier stays intact; preview and responsive checks inspect actual files. | D.1, A.3 |
| 7E.2 TODO | Interactive client-site worker. Pinned template build, constrained execution and isolated script-capable preview; real button/form behavior tested; no arbitrary package scripts/secret access. | E.1 |
| 7E.3 TODO | Authorized publication adapter. Exact target/revision preview; publish one supported static build; HTTP verification/receipt; timeout reconciliation and tested revision/rollback. | E.1–2, B.1 |
| 7F.1 TODO | Existing-use-case regression and app discovery. Files/reminders/clipboard/screenshots/workflows survive; approved installed app targets resolve without model shell commands. | D.1 |
| 7F.2 TODO | Typed window/media controls for named apps. Focus/minimize/restore and supported play/pause/volume observed on real targets; scope/foreground locks and unsupported outcomes. | F.1 |
| 7G.1 TODO | Usage coverage and economy qualification. All paid paths correlated; bounded attempts and task owner; matched strong/economy results record success, latency and cost per success. | C.2, D.3, E.3 |
| 7G.2 TODO | Managed inference/voice bridge in development. Same Core/chat/worker/STT/TTS authority with fake-server negative tests; no silent BYOK fallback; unknown usage stays held. | B.1, D.1, G.1 |
| 7G.3 TODO | Live account → eligible trial → real task → voice → receipt. Issuer/configured service, protected restart/login/logout/deletion and limits validated; needs deployment inputs. | G.2, C.3 |
| 7G.4 TODO | Managed operations and billing. Renewal/top-up/refund/revocation with unordered/duplicate events; tenant/spend controls, backup/restore, kill switch, account deletion; needs eligible payment setup. | G.3 |
| 7H.1 TODO | Failure/recovery gate. Concurrent work, provider/gateway outage, worker crash, restart, sleep, disk-full/audit failure, unknown publication outcome and cancellation leave truthful state. | A–F; G paths when enabled |
| 7H.2 TODO | Measured native performance. Baseline/after traces, named hardware and p50/p95; direct work remains responsive under research/build load; leaks and hidden animations fixed. | H.1 |
| 7I.1 TODO | Fresh Windows candidate. All source checks, bundled dependencies/licenses, new build identity/checksums; isolated clean-install and existing-profile upgrade preserve data. | H.1–2; all candidate feature rows |
| 7I.2 TODO | Real PC acceptance with Larry/owner. Wake/mic/voice quality, taskbar/DPI/monitors, focus, 60-minute mixed use and live hero workflows on exact packaged candidate. | I.1 |
| 7I.3 TODO | Public release gate. Signed installer/update verified; tamper rejection, rollback/profile compatibility, support/privacy docs and live managed readiness if advertised. | I.2, G.3–4 for Premium |

Use Sol for these implementation checkpoints as the user requested. Astra has
settled the cross-cutting decisions in this pack; do not automatically invoke
another expensive model for each file or repeat the entire audit each turn.
No runtime provider/model decision is implied by the development-model choice.

### Order and non-blocking work

Default order: A → B → C → D → E → F → G.1 → H → I.1/I.2 for Larry's candidate.
G.2 can be implemented offline; G.3/G.4 wait for real external setup but remain
mandatory for managed acceptance. Integrate/retest their enabled paths before
I.3. Do not let missing payment details stop native UX, local capability work,
tests or instrumentation. Do not bypass protection/policy to make a demo work.

## 4. Where to work, what not to replace

| Workstream | Start by inspecting these existing owners | Test entry points to extend |
| --- | --- | --- |
| A surfaces | `electron/main/morpheus-wake-orb.ts`, `morpheus-companion-surface.ts`, `morpheus-presence-layout.ts`; `resources/morpheus-orb/`; `src/components/morpheus/MorpheusQuickCommand.tsx`, `operator/MorpheusOperatorNavigation.tsx`; operator/command stores; typed host contracts | `morpheus-wake-orb`, `morpheus-companion-surface`, `morpheus-chat-presence` units; wake-orb/signal-os/chat-presence Electron specs |
| B secrets | `electron/services/secrets/secret-store.ts`, provider store consumers, managed `session-store.ts`, OpenClaw credential materialization | New migration crash/legacy consumer/redaction units; actual Windows protected-store restart |
| C voice/persona | `voice/windows-wake.ts`, `voice/voice-service.ts`, `src/stores/morpheus-voice.ts`, `src/lib/morpheus-ambient-voice.ts`, speech-player/stream, audio-level, onboarding components, context-selector and memory-store | Existing windows-wake/voice-service/session/dialogue/player/store/memory units; phase-3/intelligence-voice/companion-experience Electron specs |
| D workers/research | `core/objective-orchestrator.ts`, `task-coordinator.ts`, task-checkpoints, provider plan/schema, shared action/execution types; existing Gateway/agent/browser facilities | New worker/session/citation/permission-negative tests; core/recovery regression; real browser workflow spec |
| E sites | `capabilities/win32/verify-site.ts`, shared site-types, file capabilities, artifact viewer; separate scoped worker/preview/publish adapters | Existing site-capability/hero-site-objective units; hero-site E2E plus revision/build/publish failures |
| F desktop | shared actions/registry; win32 capability adapters, policy, direct interpreter, resource leases | Every adapter: permission/unsupported/verification/cancel tests; actions/device-permissions/companion-missions E2E |
| G managed/cost | shared usage-evidence/provider-policy; `scripts/phase5/`; `services/managed/`; desktop managed auth/client | Existing usage-evidence/managed auth/client/ledger/gateway/server units; live receipts and service-operation tests |
| H/I readiness | task recovery; main lifecycle; build config/updater; package/bundle scripts; `.github/workflows/release.yml` | Recovery/performance/Electron regression; packaged install, signature/update and manual hardware record |

Names in the test column identify current suites, not commands asserting that
future suites already exist. Add focused specs for each new behavior. Runtime
communication edits begin with a narrow task spec based on the
[Phase 7 umbrella](../../harness/specs/tasks/morpheus-phase7-assistant.md).
Preserve the action-runtime isolation rule: inject a worker port from composition,
do not import Gateway/provider modules into the deterministic runtime itself.

## 5. Scope details that must not disappear

- User says “open YouTube/Instagram/an installed app”: direct navigation with no
  unnecessary question or planner call. App discovery must resolve a real approved
  target, not invent a path; unknown targets need a helpful clarification.
- “Research this while opening Spotify”: independent task ownership and foreground
  leases. Browser searches, reports, website revisions/publication are not just
  model prose. Financial research/paper trading is later; no broker transactions.
- Quiet orb jokes/check-ins, optional captions, no forced chat panel. Humour stays
  consistent across providers without an extra paid rewrite. Serious tone wins.
- Short first-run setup, graceful offline/BYOK path, three real voice choices,
  greetings after breaks/restarts, and accessible reduced-motion behavior.
- Accounts are not required for local/BYOK operation. Managed service cannot grant
  native authority or remove already-established Basic capabilities.
- No OS-wide “unrestricted shell.” Useful remembered scopes are the convenience
  mechanism; novel sensitive/critical boundaries remain concrete decisions.
- Existing channels, agents, cron, skills, provider metadata/settings and old user
  files must survive. Do not secretly clear profiles to pass testing.

## 6. Validation and checkpoint discipline

Requirements trace, using the numbered decisions in the original experience plan:

| Original decisions | Implementation checkpoints |
| --- | --- |
| 1–10 short conversational setup, useful trial, voice selection | C.2–3, G.3; A.3 for question options |
| 11–20 orb, compact/full, tray, silence, motion, jokes without panels | A.1–4, C.3–4 |
| 21–29 natural voice, greetings, personality, DND, interruption | C.1–4 |
| 30–36 autonomy, remembered scopes, independent tasks, recovery | D.1–3, E.1–3, F.1–2, H.1 |
| 37–40 local memory, inspect/export/delete, privacy | C.4, B.1, G.3–4; optional selected sync later |
| 41–44 cost-aware routing, consistent personality, Basic/Premium | C.3, G.1–4 |
| 45–46 NerdGPT/activation | Explicitly deferred by the user; retain contract, no implementation claim |
| 47–48 one runtime, future platforms | Architecture sections 3/6/8; platform-specific delivery later |

For each small implementation row:

1. Read the row, relevant architecture section and existing owner/test files only.
   Inspect local changes before editing; preserve unrelated work. Record baseline.
2. Write the negative and happy-path test before/with the change. Validate the
   harness task spec against the actual diff. Use repository skills when applicable.
3. Run focused unit tests and relevant typechecks. UI changes require a fresh build
   and Electron E2E, all four locales, keyboard/reduced-motion checks and native
   visual evidence. No “test passes” based only on mocked host UI for native claims.
4. Communication changes require `comms:replay`, `comms:compare`, harness validation
   and dry-run. Run broader checks at dependency boundaries; run the complete suite
   on the exact final candidate. Investigate skips instead of counting as passes.
5. Review actual diff, secret exposure, unintended provider calls and state/profile
   migration. Record implemented versus automated versus real/live outcomes.
6. Update the status row and current checkpoint below. Commit only reviewed project
   files. Push the checkpoint on the authorized branch; no force push/reset, no
   public release or production publish inferred from a successful code push.

Do not spend paid API calls for animation, permissions, cancellation or timer
fixtures. Live model/voice evaluation uses a named small test set, known account,
request/token ceiling and recorded spend. Stop on unknown billing/cap behavior.
Request missing production credentials/targets when their integration is reached,
not as a new product-discovery questionnaire. Never request secrets pasted in chat.

### Current checkpoint (replace, do not append another contradictory “latest”)

- Completed in the isolated Windows source worktree: 7A.1 Main assistant session,
  7A.2 editable native upward composer and 7A.3 compact conversation continuity.
  The old forced Chat redirect is no longer used for normal Morpheus turns.
  Native source-build Electron journeys, full unit suite, typecheck, lint,
  communications replay/compare and harness checks are recorded in the ledger.
  No second executor or conversation history store was introduced.
- Next executable checkpoint: **7A.4 — shared fluid motion and actual ephemeral
  mic/playback amplitude**, with reduced-motion/hidden-window validation. Then
  proceed to 7B.1 protected provider-secret migration before paid live testing.
- The Windows worktree is separate from the original PC checkout. Profiles and
  provider settings have not been changed. Commit/push continuity is recorded
  in the ledger; source-build tests do not certify an installer.
- Remaining input blockers: production identity/managed routes and payment setup,
  signing/update ownership, approved deployment target for a live publication,
  actual microphone/monitor access and human voice acceptance.
- No blocked external gate excuses incomplete local code; no local success closes
  an external gate. Whole Phase 7 remains open until its applicable gates pass.

Documentation validation on 2026-09-30: Phase 7 harness spec validation and dry-run
passed; 18 harness regression tests passed. Dry-run skipped application checks by
design. No application suite, live API or new installer was run for this docs-only
checkpoint. Link/whitespace validation is recorded in the evidence ledger.

### Resume record template

Keep one short record per checkpoint in the evidence ledger:

```text
Checkpoint / source commit / date / environment:
Implemented behavior and changed ownership:
Tests actually run / counts / skips / evidence paths:
Paid calls / account alias / spend or unknown holds (no secrets):
Remaining failing or manual/live checks:
Next checkpoint / exact first action:
Working-tree changes not yet committed:
```

A usage limit is an interruption, not a completion event. Persist this record
before a large test/build or model switch; the next session reads it and resumes
the specific unfinished row without repeating product discovery or large phases.
