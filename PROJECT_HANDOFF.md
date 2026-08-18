# Morpheus Signal OS — Release-Candidate Handoff

Read [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), and the canonical
product, architecture, design, security, roadmap, and release documents before
changing the runtime.

## Current project status

Morpheus now has a coherent Windows operator experience rather than an
OpenClaw-first shell. The **Signal OS** release candidate is implemented,
committed, packaged, and verified through automated tests, visual checks, an
existing-profile packaged smoke, and a fresh-profile first-run smoke.

The visible product now provides:

- an original Morpheus Signal identity with no actor likeness or inherited
  ClawX artwork;
- a full-window first-run activation that introduces the product, reports real
  capability/runtime/provider/voice readiness, offers companion behavior, runs
  a real privacy-safe first mission, reaches **Morpheus is ready**, and
  transitions naturally into the Command Center;
- a compact Signal OS rail centered on Command, Missions, Systems, Library,
  Chat, and Invoke, with inherited administration surfaces kept under More;
- a Command Center organized as **Today / Mission / Context**, with the command
  surface, runtime truth, plan progress, artifacts, and trust state above the
  fold at 1280×800;
- an Invoke/Presence surface for immediate voice or text objectives without
  entering Chat;
- plan-level trust presentation that asks once for a genuinely new boundary and
  keeps the safest decision focused by default;
- OpenClaw Chat as a secondary conversational surface while the Main-owned
  Objective Core remains the execution authority.

The runtime foundation remains intact: 19 controlled Windows capabilities,
sequential typed plans, whole-plan trust evaluation, exact grants, Missions,
Projects/context, Goals, Agent Profiles, workflows, Morpheus schedules,
Systems, Activity, artifacts, push-to-talk, opt-in ambient voice, and a
provider-neutral planning boundary.

This is a strong internal release candidate for hands-on product testing. It is
not yet a signed public release, and microphone/acoustic quality plus broad
provider-backed planning still require testing with the user's actual hardware
and compatible credentials.

## Branch and commits

| Item | Value |
| --- | --- |
| Current branch | `codex/morpheus-production-companion` |
| Signal OS runtime source | `8ba4568` |
| Signal OS doctrine | `1af1f25` |
| Windows 1.0 Foundation checkpoint | `4895fa4` |
| Origin | `https://github.com/MoNaBOSS/Morpheus.git` |
| Remote state | This branch is local unless a later operator explicitly pushes it |

The documentation checkpoint follows the packaged runtime and does not change
application behavior. `git rev-parse HEAD` is the authoritative latest commit.

## Latest Windows installer

| Field | Verified value |
| --- | --- |
| Installer | `C:\Morpheus\morpheus-core\release\Morpheus-1.0.0-win-x64.exe` |
| Size | 263,671,241 bytes |
| SHA-256 | `39454470DB3006F778F0D17AD334392E9E60D3B48D78FAEA91E3AC7732EBC77C` |
| Authenticode | `NotSigned`; production signing remains CI/credential-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |
| Unpacked size | 213,989,888 bytes |
| Unpacked SHA-256 | `F5469A2477F139A8939E9715314FDC5CB379735B80986C17B44FF80A8F4CC698` |

`pnpm package:win` completed from committed runtime source `8ba4568`.
Generated release files are ignored and untracked.

## Test and verification status

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass before the documentation checkpoint |
| Typecheck | Pass |
| Lint | 0 errors; 12 inherited Fast Refresh warnings |
| Morpheus unit tests | 615/615 pass across 65 files |
| Signal OS harness validation and dry run | Pass |
| Communication replay and comparison | Pass |
| Core Signal OS E2E | 23/23 pass |
| Full Morpheus E2E | 51/52 on the full run; the one fixture-sensitive scenario passed on an immediate targeted rerun |
| Vite production build | Pass |
| Windows NSIS package | Pass |
| Existing-profile packaged smoke | Pass with the limitation recorded below |
| Fresh-profile activation smoke | Pass |

The fresh-profile packaged smoke used the real unpacked production executable,
not an E2E bypass. It verified setup into the full-screen Signal activation,
real calibration (19 capabilities and connected runtime), companion
personalization, automatic execution of the privacy-safe system-report mission,
one genuine artifact, the final **Morpheus is ready** state, and transition into
the 1280×800 Command Center. The isolated profile was removed after the test;
all packaged processes and the port 18789 Gateway listener were clean.

The existing-profile smoke verified live Gateway readiness, the real system
report, sequential progress, artifact projection, Invoke/Presence, and fresh
Chat usability. One restored historical Chat session retained a stale disabled
composer even while its footer showed the Gateway connected; creating a fresh
Chat session worked immediately. Treat that as inherited restored-session test
debt, not as a Gateway or Objective Core failure.

Verification screenshots remain outside Git:

- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\activation-ready-1280x800.png`
- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\signal-command-center-1280x800.png`
- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\signal-presence.png`
- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\signal-trust-boundary.png`
- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\command-center-mission-1280x800.png`
- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\mission-history-1280x800.png`
- `C:\Morpheus\morpheus-verification\signal-os-2026-08-18\quick-command-overlay.png`

## Known limitations

- Real provider-backed broad planning and transcription require compatible
  provider/STT credentials configured locally. Deterministic registered
  capabilities remain usable without them.
- Ambient voice is explicit opt-in and provider-backed; it is not an offline
  wake-word engine. Microphone recognition, latency, speaker output, barge-in,
  and acoustic quality need hands-on testing on the target device.
- A restored historical Chat session can retain a stale disabled composer after
  Gateway connection. A fresh Chat session connects and is usable.
- The controlled capability set intentionally excludes arbitrary shell or
  PowerShell, unrestricted executables/arguments/paths, financial transactions,
  credential access, and privilege elevation.
- Connected-service operators, financial integrations, unsupervised skill/code
  authorship, and non-Windows hosts remain future product work.
- Execution remains sequential by design. Concurrency requires explicit
  resource locking and scheduler semantics.
- The Morpheus update endpoint is intentionally unconfigured. Local Windows
  binaries remain unsigned until authorized signing credentials and CI exist.
- Some internal `clawx` identifiers remain for OpenClaw compatibility; normal
  product identity and execution authority are Morpheus.

## Architecture summary

Canonical references:

- [`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md)
- [`docs/product/MORPHEUS_COMPANION_VISION.md`](docs/product/MORPHEUS_COMPANION_VISION.md)
- [`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`](docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md)
- [`docs/design/MORPHEUS_SIGNAL_OS.md`](docs/design/MORPHEUS_SIGNAL_OS.md)
- [`docs/design/MORPHEUS_DESIGN_SYSTEM.md`](docs/design/MORPHEUS_DESIGN_SYSTEM.md)
- [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md)
- [`docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md`](docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md)

```text
objective from Command / Invoke / voice / Chat / workflow / schedule
  -> workspace, Project, Agent Profile and eligible memory context
  -> direct registered capability or provider-neutral planner
  -> validated typed sequential plan
  -> whole-plan trust-delta evaluation
  -> one consent only for genuinely new or broader boundaries
  -> Main-owned capability execution and bounded observation/replanning
  -> live Signal state, Mission, result, artifact, Activity and audit
```

Renderer calls Main through `src/lib/host-api.ts` and the typed `host:invoke`
registry. Renderer cannot create grants, choose executable paths, submit shell
strings, select unrestricted roots, or activate untested Systems. Provider
output is untrusted planning input and receives no direct OS authority.

## Required software and setup

- Git
- Node.js 24.x
- Corepack
- pnpm 10.33.4 (pinned in `package.json`)
- Windows 10/11 for native capabilities, NSIS packaging, and packaged smoke
- Windows Developer Mode where electron-builder extraction requires symlinks
- Optional provider and speech credentials configured through Morpheus
- Optional signing credentials in an authorized CI/signing environment

```powershell
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
Set-Location morpheus-core
git checkout codex/morpheus-production-companion
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

Useful validation commands:

```powershell
pnpm run typecheck
pnpm run lint:check
pnpm exec vitest run morpheus
pnpm run test:e2e
pnpm run comms:replay
pnpm run comms:compare
pnpm harness validate --spec harness/specs/tasks/morpheus-signal-os.md
pnpm harness run --spec harness/specs/tasks/morpheus-signal-os.md --dry-run
pnpm package:win
```

## Environment variable names

Names from `.env.example` and supported diagnostics/runtime controls (never
commit values):

```text
OPENCLAW_GATEWAY_PORT
VITE_DEV_SERVER_PORT
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
CSC_LINK
CSC_KEY_PASSWORD
GH_TOKEN
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

Provider secrets belong in Morpheus Settings and OS-protected storage, not
source, screenshots, documentation, or audit.

## Next recommended task

Run hands-on product acceptance with the intended microphone, speakers, and a
compatible provider: activation -> push-to-talk -> broad objective -> typed plan
-> trust if required -> execution -> spoken/visual result -> tray/Invoke recall.
Then fix only observed usability or restored-session defects before preparing a
signed external tester build and a configured Morpheus update channel.
