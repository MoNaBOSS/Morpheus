# Morpheus Windows Production Companion — Handoff

Read [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), and the canonical
product, architecture, design, security, roadmap, and release documents before
changing the runtime.

## Current project status

The Windows production-companion engineering foundation is implemented,
committed, packaged, and suitable for internal engineering validation. It is
**not yet suitable for presentation as the finished Jarvis-style Morpheus
experience**. Hands-on installation on 2026-08-18 found a material product gap:
the inherited OpenClaw Chat experience remains too visually dominant, while the
cinematic onboarding, living companion presence, voice-first interaction and
execution-focused feedback do not yet form one convincing first-run journey.

The checkpoint provides substantial reusable infrastructure:

- a cinematic, skippable first-run activation reaches a real **SYSTEM READY**
  state using capability, Gateway, provider, and voice availability;
- Command Center, Quick Command, voice, explicit Chat execution, workflows, and
  schedules enter one Main-owned Objective Core;
- known objectives route directly to registered capabilities, while broader
  objectives can use a configured provider through a typed, validated planning
  boundary;
- sequential plans, whole-plan trust evaluation, exact scoped grants, real
  progress, artifacts, durable Missions, and append-only Activity remain one
  execution path;
- Projects & Context, long-horizon Goals, source-backed Today attention,
  proactive reminders, reusable tested Systems, Agent Profiles, workflows, and
  schedules are first-class product surfaces;
- global Quick Command, push-to-talk, and opt-in ambient wake-phrase voice use
  the same Objective Core and never bypass policy;
- the premium compact Matrix-accented UI is verified at 1280x800 and 1920x1080;
- OpenClaw Gateway and conversational Chat remain live inside the Morpheus
  product without owning its identity or OS authority.

These bullets describe implemented systems, not proof that the intended product
experience has been achieved. Do not call the application production-ready or
Larry-ready until the packaged first-user journey passes the experience gates in
[`docs/handoff/MORPHEUS_NEXT_SESSION_HANDOFF.md`](docs/handoff/MORPHEUS_NEXT_SESSION_HANDOFF.md).

Release artifacts and verification screenshots remain ignored and outside Git.

## Branch and commits

| Item | Value |
| --- | --- |
| Current branch | `codex/morpheus-production-companion` |
| Verified packaged runtime source | `d9a2ac8d5c7cde2e4b0582bc1b2c8e3f9feace66` |
| Production companion campaign base | `b5cff47` |
| Windows 1.0 Foundation checkpoint | `4895fa4` |
| Origin | `https://github.com/MoNaBOSS/Morpheus.git` |
| Remote state | This branch is local and has not been pushed |

The handoff/documentation commit follows the packaged runtime source and does
not change application behavior. `git rev-parse HEAD` is the authoritative
latest documentation checkpoint; do not rewrite the verified runtime commits.

## Latest Windows installer

| Field | Verified value |
| --- | --- |
| Installer | `C:\Morpheus\morpheus-core\release\Morpheus-1.0.0-win-x64.exe` |
| Size | 263,669,614 bytes (251.45 MiB) |
| SHA-256 | `2D2F2388D051BC2907FB15067815373C9EB6415C290591C5EE61B48A33815E98` |
| Authenticode | `NotSigned`; production signing remains CI/credential-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |
| Unpacked size | 213,989,888 bytes |
| Unpacked SHA-256 | `7EFC2E593FF5BF7BC4D8D59C65106E30695F90B014982A0B3B9B3EEFCB60CF7A` |

`pnpm package:win` completed from committed runtime source `d9a2ac8`.
Generated release files are ignored and untracked.

## Test and verification status

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass |
| Typecheck | Pass |
| Lint | 0 errors; 12 inherited Fast Refresh warnings |
| Morpheus unit tests | 611/611 pass across 64 files |
| Full unit suite | 2,561 pass, 2 skip; 16 inherited Windows path/mock failures in 3 untouched OpenClaw test files |
| Harness validation and dry run | Pass |
| Communication replay and comparison | Pass |
| Focused production companion E2E | Pass |
| Permission and Command Center E2E | 13/13 pass |
| Final voice/foundation/intelligence E2E | 13/13 pass |
| Full Electron E2E | 184 pass, 3 skip, 4 initial failures; one fixed and one load flake passed on rerun; 2 inherited Chat regressions remain |
| Windows NSIS package | Pass |
| Normal-production packaged smoke | Pass |

The two reproducible inherited E2E regressions are
`tests/e2e/chat-scroll-to-latest.spec.ts` (jump control visibility) and
`tests/e2e/chat-acp-attachments.spec.ts` (HTML preview fullscreen navigation).
Their implementation paths were not changed by the production companion work.
The 16 inherited unit failures are confined to `tests/unit/openclaw-cli.test.ts`,
`tests/unit/openclaw-upgrade-snapshot.test.ts`, and
`tests/unit/plugin-install.test.ts`; all 611 Morpheus tests pass.

The normal-production smoke launched only
`release\win-unpacked\Morpheus.exe`, without an E2E bypass or installer run. It
verified first-run activation through **SYSTEM READY**, the Command Center,
OpenClaw Gateway on port 18789, a real provider-backed Chat response, an older
OpenClaw session after normal Gateway warm-up, automatic privacy-safe system
reporting, real Mission/Activity audit projection, Quick Command, Goals, and
Systems. One Main process and its expected Electron/Gateway children ran without
startup loops. Current-launch logs contained no fatal/error patterns. All
packaged-owned processes and port 18789 were clean after shutdown.

Verification screenshots remain outside Git:

- `C:\Users\monir\.codex\visualizations\2026\08\10\019febb3-e40f-7751-b411-cec96afab311\morpheus-production-command-center-1280x800.png`
- `C:\Users\monir\.codex\visualizations\2026\08\10\019febb3-e40f-7751-b411-cec96afab311\morpheus-production-command-center-1920x1080.png`

## Known limitations

- Real provider-backed broad planning and transcription require the user to
  configure compatible provider/STT credentials. Deterministic registered
  capabilities remain truthful and usable without them.
- Ambient voice is explicit opt-in and provider-backed; it is not an offline
  wake-word engine. Microphone acceptance and acoustic quality require hands-on
  testing on the user's device.
- The shipped Windows capability set is intentionally controlled. It does not
  include arbitrary shell/PowerShell, unrestricted executable paths, broad
  filesystem access, financial transactions, credential access, or privilege
  elevation.
- Connected-service operators, financial-manager integrations, self-authored
  code/skills without review, and macOS/Linux/web/mobile hosts are future
  product work, not hidden placeholders in this build.
- Execution remains sequential by design. Concurrency needs explicit resource
  locking and scheduler semantics.
- The Morpheus update endpoint is intentionally unconfigured. Local Windows
  binaries are unsigned until the authorized CI/signing credentials exist.
- Some internal `clawx` identifiers remain for OpenClaw data compatibility;
  normal user-facing identity and execution authority are Morpheus.
- The two inherited Chat E2E regressions above remain known test debt even
  though packaged Gateway, fresh Chat, provider response, and existing-session
  loading all passed the production smoke.

## Architecture summary

Canonical references:

- [`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md)
- [`docs/product/MORPHEUS_COMPANION_VISION.md`](docs/product/MORPHEUS_COMPANION_VISION.md)
- [`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`](docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md)
- [`docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md)
- [`docs/design/MORPHEUS_DESIGN_SYSTEM.md`](docs/design/MORPHEUS_DESIGN_SYSTEM.md)
- [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md)
- [`docs/security/WINDOWS_1.0_SECURITY_REVIEW.md`](docs/security/WINDOWS_1.0_SECURITY_REVIEW.md)
- [`docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md`](docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md)

```text
objective from Command Center / Quick Command / voice / Chat / workflow / schedule
  -> workspace, Project, Agent Profile and eligible memory context
  -> direct registered capability or provider-neutral planner
  -> validated typed sequential plan
  -> whole-plan trust-delta evaluation
  -> one consent only for genuinely new or broader boundaries
  -> Main-owned capability execution and bounded observation/replanning
  -> real status, Mission, result, artifact, Activity and append-only audit
```

Renderer calls Main through `src/lib/host-api.ts` and the typed `host:invoke`
registry. Renderer cannot create grants, choose executable paths, submit shell
strings, select unrestricted roots, or activate untested Systems. Provider
output is untrusted planning input and receives no direct OS authority.

## Required software

- Git
- Node.js 24.x
- Corepack
- pnpm 10.33.4 (pinned in `package.json`)
- Windows 10/11 for native capabilities, packaged smoke, and NSIS packaging
- Windows Developer Mode where electron-builder extraction needs symlink support
- Optional provider and speech credentials configured through Morpheus
- Optional signing credentials only in an authorized CI/signing environment

## Setup commands

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout codex/morpheus-production-companion
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
pnpm harness validate --spec harness/specs/tasks/morpheus-production-companion.md
pnpm harness run --spec harness/specs/tasks/morpheus-production-companion.md --dry-run
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

Provider secrets belong in Morpheus Settings and OS-protected storage. Never
put credential values in source control, screenshots, documentation, or audit.

## Next recommended task

Redesign and implement the unified first-user and everyday companion experience
described in
[`docs/handoff/MORPHEUS_NEXT_SESSION_HANDOFF.md`](docs/handoff/MORPHEUS_NEXT_SESSION_HANDOFF.md).
Start with visual/interaction directions and an executable vertical slice:
activation -> provider/microphone setup -> voice objective -> plan -> autonomous
execution -> spoken/visual result -> tray companion. Validate the packaged build
as a new user before expanding capability count or adding another platform.

## MacBook Setup

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout codex/morpheus-production-companion
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

The branch must be pushed before it can be checked out from another machine.
Platform-neutral development/tests work on macOS, but the `.icns`, native
adapters, and macOS packaging are not release-ready.
