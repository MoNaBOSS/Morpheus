# Morpheus 0.5 Foundation — Project Handoff

This is a status snapshot for continuing development on another machine. Read
[`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), and the canonical product,
architecture, design, security, roadmap, and release documents before changing
the runtime.

> **Windows 1.0 campaign in progress:** development continues on
> `windows-1.0-foundation` from the committed 0.5 checkpoint `d6a03f8`. The
> provider-backed Objective Core, secure voice entry, and Main-owned workspace
> registry are committed on that branch. Workflow and schedule execution is now
> being converged on the same Objective Core; this document will be finalized
> again before the Windows 1.0 packaging checkpoint.

## Current project status

**Morpheus 0.5.0 Foundation is implemented, committed, packaged, and verified on
Windows.** It is one product foundation, not a demo or an edition fork.

The product now includes:

- a permanent Matrix-accented Morpheus design system and real-signal boot;
- Command Center at `/`, OpenClaw Chat at `/chat`, and global Quick Command;
- Main-owned, sequential multi-step `ExecutionPlan` execution with dependencies,
  results, errors, durations, artifacts, and provider-neutral planner boundary;
- plan-level trust-delta evaluation with Strict, Balanced, and Autonomous
  profiles, batched consent, exact session/persistent grants, and immediate
  revocation;
- 19 typed Windows capabilities with no arbitrary shell, PowerShell, executable
  path, argv, environment, or unrestricted filesystem surface;
- three starter Agent Profiles, two reusable workflows, Morpheus-owned schedules,
  durable artifacts, and a cross-day append-only Activity ledger;
- preserved OpenClaw Gateway, Chat, Models, Agents, Channels, Skills, and Cron.

The working tree was clean before this handoff update. Release artifacts and
verification screenshots are intentionally outside Git.

## Branch and commits

Current branch:

```text
feat/morpheus-productization-0.1.1
```

Verified 0.1 checkpoint:

```text
df37560357fb367eef7fe59ccbd588feb4328667
```

Morpheus 0.5 implementation head before this handoff documentation commit:

```text
917639a8c95e2911cedafe777229ac6436863d4b
```

The 0.5 commit range is `d01c43c..917639a` (20 coherent commits). Do not rewrite
or remove `df37560`. Use `git rev-parse HEAD` after checkout for the final
documentation commit hash.

Remote status at handoff:

- `origin`: `https://github.com/MoNaBOSS/Morpheus.git`
- `upstream`: `https://github.com/ValueCell-ai/ClawX.git`
- `origin/feat/morpheus-productization-0.1.1` currently ends at `6f59afa`.
- The 0.5 commits are intentionally local-only because the milestone instruction
  was **do not push**. Push this branch explicitly before moving to another
  machine.

## Latest Windows installer

The build output is ignored by Git and must be copied separately or rebuilt.

| Field | Verified value |
| --- | --- |
| Installer | `C:\Morpheus\morpheus-core\release\Morpheus-0.5.0-win-x64.exe` |
| Size | 263,572,139 bytes (251.36 MiB) |
| SHA-256 | `DE9C0642CB30ECC28784D5DC65A851D8CE058B90B737E29CCA9E8E36F66C598F` |
| Authenticode | Not signed locally; expected because production signing is CI/SignPath-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |

The installer was built from committed source at `917639a`; no generated release
file is tracked.

## Test and verification status

Windows validation completed for this checkpoint:

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass |
| `pnpm run typecheck` | Pass |
| `pnpm run lint` | 0 errors; 12 inherited Fast Refresh warnings |
| Targeted Morpheus unit tests | 489/489 pass (36 files) |
| Targeted Morpheus E2E | 42/42 pass |
| Full Electron E2E | 175 pass, 3 skipped; one load-related worker crash passed 1/1 in isolation |
| Comms replay and regression comparison | Pass |
| Harness boundary validation | Pass with LF-normalized real validator |
| Windows NSIS packaging | Pass |
| Packaged normal-production smoke | Pass, including restart persistence and process cleanup |

The full Vitest run reported 2,407 passing and 2 skipped tests plus 26 known
pre-existing Windows failures. Those failures are outside Morpheus 0.5 changes:

- the harness frontmatter parser accepts LF only while this checkout uses CRLF;
- inherited POSIX path-separator assertions fail on Windows;
- two inherited NSIS patch-parser suites fail under the current Windows
  Node/Vitest combination.

Packaged smoke proved the real boot READY state, Gateway startup, ACP Chat load,
automatic privacy-safe system report, workspace trust reuse, Notepad session
grant reuse, revocation, persistent exact-app grant across restart, Quick Command
registration, Activity/audit ordering, updater isolation, and clean shutdown.
The private file payload used in smoke testing was absent from the audit ledger.

## Known limitations

- The deterministic command interpreter is intentionally narrow. The durable
  `MorpheusPlanner` boundary is ready for a provider/OpenClaw planner that emits
  the same typed plans without receiving OS authority.
- Agent Profiles and workflows are real and reusable, but authoring is a
  foundation surface rather than a full visual builder.
- Plan execution is sequential in 0.5. Concurrency needs a separate resource and
  scheduling design; do not add it casually.
- Capability adapters are Windows-only. Shared contracts remain platform-neutral.
- Morpheus updates report `not-configured` until a real Morpheus endpoint exists.
- Local Windows binaries are unsigned. Production Authenticode remains a CI
  credential/signing task.
- `resources/icons/icon.icns` still needs regeneration from the Morpheus source
  artwork on macOS before a credible Mac distribution build.
- New Morpheus product surfaces use the permanent design system; some inherited
  OpenClaw runtime pages still retain their older component styling internally,
  although normal visible product branding is Morpheus.
- The inherited app still has broader security debt outside the Morpheus action
  authority (for example legacy Electron sandbox/CSP and unrelated file APIs).
  Do not treat those paths as Morpheus capabilities or use them to bypass policy.

## Architecture summary

Canonical references:

- [`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md)
- [`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md)
- [`docs/architecture/MORPHEUS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_ARCHITECTURE.md)
- [`docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md`](docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md)
- [`docs/design/MORPHEUS_DESIGN_SYSTEM.md`](docs/design/MORPHEUS_DESIGN_SYSTEM.md)
- [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md)
- [`docs/releases/0.5.0-ACCEPTANCE.md`](docs/releases/0.5.0-ACCEPTANCE.md)

Morpheus owns product identity, planning, policy, deterministic capabilities,
Agent Profiles, workflows, schedules, artifacts, Activity, and audit. OpenClaw is
the embedded Gateway/Chat/agent runtime. Providers propose typed plans through
replaceable planner adapters; they never receive unrestricted OS authority.

All command origins converge on a Main-owned pipeline:

```text
objective
  -> Main-authored typed plan
  -> dependency validation and sequential order
  -> whole-plan trust-delta evaluation
  -> one batched consent only for new boundaries
  -> capability resolution and execution in Electron Main
  -> audit persistence before live event emission
  -> results, artifacts, timeline, and Activity
```

Renderer calls Main through `src/lib/host-api.ts` -> typed `host:invoke` ->
`HostApiRegistry`. Renderer code never supplies executable paths, shell strings,
environment variables, or unrestricted filesystem roots.

## Required software

- Git
- Node.js 24.x (this checkpoint used 24.15.0)
- Corepack
- pnpm 10.33.4 (pinned in `package.json`)
- Windows 10/11 for current native capabilities and NSIS packaging
- Windows Developer Mode for electron-builder dependency extraction where
  symbolic-link creation is required
- Optional signing credentials only in an authorized CI/signing environment

## Setup commands

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout feat/morpheus-productization-0.1.1
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

If the 0.5 branch has not been pushed yet, push it from the Windows checkout
first; cloning `origin` currently retrieves only the 0.1.1 handoff state.

Useful validation commands:

```bash
pnpm run typecheck
pnpm run lint:check
pnpm test
pnpm run test:e2e
pnpm run comms:replay
pnpm run comms:compare
pnpm harness validate --spec harness/specs/tasks/morpheus-0.5-foundation.md
```

Windows packaging:

```bash
pnpm package:win
```

## Environment variable names

Names from `.env.example` (never commit values):

```text
OPENCLAW_GATEWAY_PORT
VITE_DEV_SERVER_PORT
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
CSC_LINK
CSC_KEY_PASSWORD
GH_TOKEN
```

Optional development/diagnostic controls used by the repository include:

```text
OPENCLAW_STATE_DIR
CLAWX_GATEWAY_WS_TRACE
CLAWX_REMOTE_DEBUGGING_PORT
CLAWX_SKIP_PREINSTALLED_SKILLS_PREPARE
SKIP_PREINSTALLED_SKILLS
SKIP_RELEASE_FETCH
SKIP_RELEASE_REMOTE_CHECK
```

`CLAWX_E2E`, `CLAWX_E2E_SKIP_SETUP`, and `CLAWX_USER_DATA_DIR` are test-harness
controls only and must not be used to claim a normal-production smoke result.

## Next recommended task

First, run user-acceptance testing of the packaged Windows build with a real
Morpheus profile and record workflow/permission/UI feedback. After that, the
cleanest next engineering milestone is a provider-backed planner adapter that
emits the existing `ExecutionPlan` contract, with planner validation and policy
remaining in Main. Do not expand OS authority or add unrestricted shell access
to make planning appear more capable.

## MacBook Setup

The application can be developed and tested on macOS, but the 19 native action
adapters remain Windows-only and `icon.icns` must be regenerated before Mac
distribution.

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout feat/morpheus-productization-0.1.1
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

Tests:

```bash
pnpm run typecheck
pnpm run lint:check
pnpm test
pnpm run test:e2e
```

Do not run `pnpm package:mac` as a release build until the Morpheus `.icns` issue
above is resolved and macOS-specific behavior has been verified.
