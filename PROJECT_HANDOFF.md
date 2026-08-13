# Morpheus Companion and Missions — First-Half Handoff

This is the verified handoff for the first half of the Morpheus companion
campaign. Before changing the runtime, read [`CLAUDE.md`](CLAUDE.md),
[`AGENTS.md`](AGENTS.md), and the canonical product, architecture, design,
security, roadmap, and release documents.

## Current project status

The first half is implemented, committed, packaged, and smoke-tested. It
extends the Windows 1.0 Foundation into a persistent companion experience; it
does not claim that the full Morpheus product or the second-half proactive
intelligence systems are complete.

The current product includes:

- a one-time cinematic Morpheus activation driven by real capability, Gateway,
  provider, and voice availability;
- tray/background behavior plus compact Quick Command and voice surfaces that
  restore the previous window state;
- a single Main-owned Objective Core shared by Command Center, Quick Command,
  voice, explicit Chat execution, workflows, and schedules;
- capability-first routing for known objectives, followed by provider-neutral
  planning for broader work;
- durable Missions containing route, run lineage, status, results, errors, and
  real artifacts across restart;
- inspectable Projects & Context and bounded, user-managed memory with
  sensitivity and provider-eligibility controls;
- sequential typed plans, whole-plan trust evaluation, exact scoped grants,
  live status, append-only audit, and 19 controlled Windows capabilities;
- a denser Matrix-accented Command Center, first-class Missions and Projects,
  global Quick Command, push-to-talk voice, and preserved OpenClaw Chat.

Release artifacts, isolated smoke profiles, and verification screenshots remain
outside Git.

## Branch and commits

| Item | Value |
| --- | --- |
| Current branch | `codex/morpheus-companion-missions-first-half` |
| Verified packaged runtime source | `19b80877a69fb1c8a06cd8d47441f600771beec6` |
| Windows 1.0 Foundation base | `4895fa4` |
| Origin | `https://github.com/MoNaBOSS/Morpheus.git` |
| Remote state | This feature branch has not been pushed |

The final documentation commit follows the packaged runtime commit and does not
change application behavior. Use `git rev-parse HEAD` for the latest handoff
commit. Do not rewrite the verified checkpoints.

## Latest Windows installer

| Field | Verified value |
| --- | --- |
| Installer | `C:\Morpheus\morpheus-core\release\Morpheus-1.0.0-win-x64.exe` |
| Size | 263,637,410 bytes |
| SHA-256 | `AF48BEF23D84707A47401F6982E8EDD54DD85EFC77D64D86766B3A09156631E7` |
| Authenticode | `NotSigned`; production signing remains CI/credential-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |
| Unpacked SHA-256 | `6A43D927EBE1008FCBB165B8EB2AD0454C3F6C6BB5BFE5E42A659ED8F487503D` |

`pnpm package:win` completed from committed runtime source `19b8087`.
Generated release files are ignored and untracked.

## Test and verification status

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass |
| Typecheck | Pass |
| Lint | 0 errors; 12 inherited Fast Refresh warnings |
| Morpheus unit tests | 589/589 pass across 60 files |
| Harness validation and dry run | Pass |
| Comms replay and regression comparison | Pass |
| Focused companion/Mission E2E | Pass |
| Full Electron E2E | 182 pass, 3 expected platform skips, 1 inherited load flake |
| Isolated rerun of the load-flaky E2E | 1/1 pass |
| Vite/application build | Pass |
| Windows NSIS package | Pass |
| Normal-production packaged smoke | Pass |

The full-suite-only failure was
`tests/e2e/chat-file-changes.spec.ts:253`; it passed immediately in isolation
and its production path was not modified by this campaign.

The normal-production packaged smoke used an isolated Windows home without any
E2E bypass. It verified boot READY, first-run activation READY, live Gateway,
Command Center, automatic system information, durable Mission projection,
Quick Command through the same Objective Core, Chat reachability, no renderer
fatal errors, and clean shutdown of every smoke-owned process. The test profile
briefly encountered the already-running installed Morpheus Gateway on port
18789; the installed app automatically restored its Gateway after the isolated
smoke ended.

## Known limitations

- Voice is push-to-talk. Always-on wake-word listening, interruption/barge-in,
  and local streaming speech are second-half work.
- Provider-backed broad planning and real transcription require user-configured
  provider/STT credentials. Known deterministic objectives remain functional
  without them; no provider or transcript is simulated.
- Proactive daily briefings, recurring personal assistance, goal decomposition
  over long horizons, bounded self-created skills/workflows, and richer
  observation/replanning are second-half work.
- Financial management capabilities are not implemented. Future financial,
  credential, destructive, privilege, and irreversible boundaries must retain
  explicit protection even in an autonomous product.
- Execution remains sequential by design. Concurrency requires explicit
  resource locking and scheduler semantics.
- The Morpheus update endpoint is intentionally unconfigured, and local Windows
  binaries are unsigned.
- Windows is the verified native host. macOS still needs Morpheus `.icns` output
  and platform behavior; Linux/web/mobile hosts remain future work.
- Some inherited OpenClaw internal identifiers remain for runtime and data
  compatibility; normal product identity and execution authority are Morpheus.

## Architecture summary

Canonical references:

- [`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md)
- [`docs/product/MORPHEUS_COMPANION_VISION.md`](docs/product/MORPHEUS_COMPANION_VISION.md)
- [`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`](docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md)
- [`docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md)
- [`docs/design/MORPHEUS_DESIGN_SYSTEM.md`](docs/design/MORPHEUS_DESIGN_SYSTEM.md)
- [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md)
- [`docs/security/WINDOWS_1.0_SECURITY_REVIEW.md`](docs/security/WINDOWS_1.0_SECURITY_REVIEW.md)
- [`docs/releases/WINDOWS-1.0-COMPANION-FIRST-HALF-ACCEPTANCE.md`](docs/releases/WINDOWS-1.0-COMPANION-FIRST-HALF-ACCEPTANCE.md)

```text
objective from Command Center / Quick Command / voice / Chat / workflow / schedule
  -> project and eligible memory context selection
  -> direct registered capability or provider-neutral planner
  -> validated typed execution plan
  -> whole-plan trust-delta evaluation
  -> one consent only for genuinely new or broader boundaries
  -> sequential Main-owned capability execution
  -> observation and bounded continuation
  -> durable Mission, artifacts, live Activity, and append-only audit
```

Renderer calls Main through `src/lib/host-api.ts` and the typed `host:invoke`
registry. The Renderer cannot create permission grants, choose executable paths,
submit shell strings, or select unrestricted filesystem roots. OpenClaw remains
the embedded Chat/Gateway runtime, not Morpheus product identity or OS authority.

## Required software

- Git
- Node.js 24.x
- Corepack
- pnpm 10.33.4 (pinned in `package.json`)
- Windows 10/11 for native capabilities and NSIS packaging
- Windows Developer Mode for electron-builder dependency extraction where
  symbolic-link creation is required
- Optional provider and speech credentials configured through Morpheus
- Optional signing credentials only in an authorized CI/signing environment

## Setup commands

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout codex/morpheus-companion-missions-first-half
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

Useful validation commands:

```bash
pnpm run typecheck
pnpm run lint:check
pnpm test
pnpm run test:e2e
pnpm run comms:replay
pnpm run comms:compare
pnpm harness validate --spec harness/specs/tasks/morpheus-companion-missions-first-half.md
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

Optional development, diagnostics, runtime, and test controls include:

```text
OPENCLAW_STATE_DIR
CLAWX_GATEWAY_WS_TRACE
CLAWX_REMOTE_DEBUGGING_PORT
CLAWX_SKIP_PREINSTALLED_SKILLS_PREPARE
SKIP_PREINSTALLED_SKILLS
SKIP_RELEASE_FETCH
SKIP_RELEASE_REMOTE_CHECK
CLAWX_E2E
CLAWX_E2E_SKIP_SETUP
CLAWX_USER_DATA_DIR
OPENCLAW_TRAJECTORY_DIR
OPENCLAW_NO_RESPAWN
OPENCLAW_EMBEDDED_IN
OPENCLAW_EXEC_SHELL_SNAPSHOT
HTTP_PROXY
HTTPS_PROXY
ALL_PROXY
NO_PROXY
```

Provider secrets belong in Morpheus Settings and OS-protected storage. Never put
credential values in source control, screenshots, documentation, or audit data.

## Next recommended task

Build the second half as one integrated campaign: interruptible streaming voice
and optional wake-word activation; proactive goal and recurring assistance;
bounded self-created workflows/skills; richer provider-backed observation and
replanning; personal briefings/reminders; and final companion UX refinement.
Every entry surface must continue through the same Objective Core, policy,
capability, Mission, artifact, and audit architecture.

## MacBook Setup

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout codex/morpheus-companion-missions-first-half
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

Development and platform-neutral tests are available on macOS. Do not treat a
Mac package as release-ready until the Morpheus `.icns`, native adapters, and
macOS behavior are implemented and verified.
