# Sol: continue Morpheus Phase 7

Application repository: `https://github.com/MoNaBOSS/Morpheus.git`.
Authorized branch: `codex/morpheus-phase6-managed-layer`.
**Phase 7 is not yet fully packaged/hardware/live accepted. NerdGPT is later.**

## Current checkpoint — 2026-10-02

Active isolated Windows worktree:
`C:\Users\monir\Documents\Codex\2026-09-18\morpheus-experience-reset\morpheus-phase7`.
Original PC checkout `C:\Morpheus\morpheus-core` is preserved, not the active source.
Verify remote, current commit and dirty files before editing. Never reset, clean,
overwrite or automatically stash work/profiles/providers. Fetch only the verified
origin. Reviewed checkpoints are pushed to the authorized branch without force.

Latest application source: **59ea1b06**, after 50437715, 3fe59e0c, e7636b70,
1fbea5b9, 208eff4d and 37095e95. Persona display metadata is committed.
Those changes fix the real welcome, quiet returning startup/tray separation,
Electron Gateway environment and original ACP endpoint/authentication. A normal
packaged smoke exposed bugs that simplified UI fixtures missed. In particular,
OpenClaw ignores env credentials with CLI `--url`; both owner URL and token now
travel in the child environment. Forty-four focused tests include the actual
pinned bootstrap, not just a mocked fork. Node types/lint/comms/harness pass.
Full suite at 59ea1b06: **3,320 passes plus two inherited skips** (68.61s).

The 3fe59e0c normal smoke now proves real Gateway → protected local provider →
original ACP compact reply. It exposed one further gap: no history replay after
renderer reload once pending admissions had been acknowledged. The current source
restores existing sessions through the same ACP owner, with single-flight loads
and no duplicate prompt. Six native/four-locale journeys and 97 related units pass.

The 50437715 normal package passed compact reply, renderer reload and full quiet
relaunch, with only one local provider call. Screenshot review then found internal
persona instructions rendered as a user message. New source tags the generated
ACP block and suppresses only that annotated display part; original ledger/prompt
matching remain intact. Untagged user/legacy text is not guessed at or rewritten.

**Current release scope:** follow the owner's
[fixed Windows checklist](docs/releases/WINDOWS_COMPLETION_CHECKLIST.md).
Finish the existing local Windows candidate; hosted Premium remains unavailable,
NerdGPT deferred. Do not restart feature discovery or claim full Phase 7 acceptance.

**Current work:** preview.4 at `E:\Morpheus-builds\phase7-20261002-0418`
now passes normal reply/reload/full quiet restart, one local provider call total;
actual screenshots inspected. Its controlled Gateway outage/local task/restart,
Premium guard and clean shutdown also pass. Five-minute idle makes zero model
requests but misses the CPU target (2.406% total capacity). A/B diagnosis isolates
the continuous idle halo. The new shared CSS bounds only idle changes to 10 Hz;
active voice/working aurora stays fluid.

The final dependency audit also found upstream advisories. Preview.5 source uses
same-major fixed versions (Electron 41.10.6, Vitest 4.1.11 and HTTP/parser patches).
Fresh dependency/bundle preparation is at `E:\Morpheus-builds\p7-preview5`;
the updated registry audit has zero unresolved advisories, with the existing
image-size patch verified. Never reuse old runtime/plugin bundles under this lock.
Only unchanged Node/uv/agent-browser binaries and curated skill assets are reused.

Preview.5 source: 3,320 units + two skips, three typechecks, zero lint errors
(12 inherited warnings), 15 fresh native journeys, comms and narrow harness pass.
**Next exact action:** commit/push reviewed source, qualify its freshly packaged
normal/runtime/idle behavior, then compress and identify the EXE. Keep installer
execution/hardware/live-service gates explicit.
Preceding evidence: `E:\Morpheus-builds\phase7-20261002-0403`, source 50437715,
preview.3 (compiled, but not the final handoff due to that display flaw).
The reusable script is
`E:\Morpheus-builds\phase7-20261002-0253\normal-runtime-smoke.mjs`;
arguments: the new base directory and `--companion --relaunch`. It uses an isolated home,
real Gateway/ACP and a free local provider, not E2E-mode or an owner's account.
Qualify welcome → local task → compact reply → reload/relaunch before compressing the EXE.
If another real failure appears, preserve evidence, fix its owner and add a
targeted regression; do not keep compressing installers between source edits.

Do not hand off the older binaries as current:
- preview.1/d5954e6c compiled but failed real Gateway environment startup.
- preview.2/208eff4d compiled and ran Gateway/local task, but dialed the wrong ACP
  port and predates quiet startup.
- preview.3/e7636b70 unpacked reached the right port but failed auth pairing.
- The 6e19fadc/1.1.2 installer is an even older historical provider fixture.

Build on E: because C: is nearly full. Reuse complete unchanged asset caches by
junction; never recursively copy their large dependency trees. The current build
environment scripts record exact caches. Do not run an NSIS install/upgrade
against the owner's existing registration/profile as a test.

## Reading order — once, then active dependencies only

1. `AGENTS.md`, `CLAUDE.md`.
2. [Execution plan](docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md).
3. [Assistant architecture](docs/architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md).
4. [Acceptance ledger](docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md).
5. Active evidence: [H native readiness](docs/releases/phase7-h-native-readiness.md)
   and [I Windows candidate](docs/releases/phase7-i-windows-candidate.md).

The ledger and linked checkpoint documents retain historical test/commit details.
Do not repeat the whole discovery or treat historical “next” paragraphs as current.

## Preserved work and remaining gates

A1–A4: original assistant session, upward native composer, same compact/full ACP
history and shared fluid M/orb motion. B1: protected static keys, bounded migration,
SecretRefs, account switching/recovery; upstream OAuth plaintext limits documented.
C1–C4: local wake pipeline, neural speech/silence handling, shared persona/arrival,
local editable memory and quiet check-ins. D1–D3: Core-owned public web/browser
workers and source-grounded reports. E1–E3: recoverable static/interactive sites,
preview and exact-byte GitHub publication/rollback approval. F1–F2: approved app
discovery and typed desktop/media controls. These preserve existing agents,
skills, channels, cron, providers and history; see individual release evidence.

G2.1 planner and G2.2 voice use the original managed owners; G1.1 recognizes matched
settled receipts and retains unknown usage. **G2.3 original ACP managed conversation
is still unfinished**, not replaced by a planner or second chat engine.
Main `runtimeReady:false` remains deliberate. See
[managed joins](docs/releases/phase7-g2-runtime-joins.md) and
[usage boundaries](docs/releases/phase7-g1-usage.md).

Continue the roadmap's non-blocking **H → I Larry/BYOK candidate** sequence.
H loaded/idle/crash/sleep/recovery/soak, authenticated browser scope, full G1 cost
coverage and G2.3 remain independent implementation/qualification work.
Public managed readiness also requires G3/G4 hosted identity/trial/payment and
operational acceptance. No server/domain/payment account is supplied; Stripe and
crypto are preferences, business country still unspecified. Signing/update-feed,
authorized live publication/provider budgets, physical microphone/voice taste,
DPI/monitors and human 60-minute acceptance remain external/manual gates.

## Continuity, scope and cost rules

- Quiet bottom-right green M/orb; composer upward, ordinary replies compact,
  full expansion explicit. No rejected dashboard/Ask-Auto-Act or new logo.
- Main owns authority, profiles and task state. Typed host API only; shared code
  platform-neutral. Preserve leases, permissions, audit and recovery.
- Use original runtime agents/tools; no parallel conversation/history engine.
- Local deterministic work first. No paid calls, publishing, purchases or account
  mutation merely to make tests green. No fabricated capabilities/results.
- Distinguish implemented source, local fixtures, exact packaged payload,
  actual installer, physical hardware and live service acceptance.
- UI changes need rendered/native regression; communication changes need a narrow
  [task spec](harness/specs/tasks/morpheus-phase7-assistant.md), matching rules,
  tests, comms replay/compare and diff-aware harness checks. Sync README locales.
- Save evidence/next action and commit/push reviewed work before interruptions.
  Preserve failures honestly; don't rerun already-passed campaigns without cause.
- Missing external setup blocks only its live gate, not independent local work.
  Ask only for genuinely missing inputs. Continue while safe relevant work remains.
