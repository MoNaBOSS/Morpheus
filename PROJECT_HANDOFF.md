# Morpheus Windows Production Candidate — Handoff

Read [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), and the canonical
product, architecture, design, security, roadmap, and release documents before
changing the runtime.

## Current project status

### In verification: 1.0.2 Responsive Operator (2026-09-04)

Adds bounded Core provider generation and usage evidence, Main-side speech
cancellation, duplicate-speech prevention, visible speech preparation, tray-safe
audio monitoring and refined state-driven motion. No pricing UI or profile reset.
See [1.0.2 acceptance](docs/releases/1.0.2-RESPONSIVE-OPERATOR.md).
The reported EUR80 charge is not reconciled by available local transcript usage.
Core limits do not cover independent OpenClaw Chat traffic or guarantee a euro cap.

### Latest update: 1.0.1 Fluid Arrival (2026-09-04)

Runtime `7336fba7a705d3e7536896aed0924f2fe3c7d018` adds a visible returning
greeting, explicit tray handoff, direct voice setup, larger filament Signal,
smooth stage transitions and race-safe speech cancellation. No profile reset.
The user's existing light appearance was changed to Dark through Settings as
requested. The packaged app and its owned processes were closed after testing.
See [1.0.1 acceptance](docs/releases/1.0.1-FLUID-ARRIVAL.md) for current results
and limitations; older validation rows below are historical unless updated.

Morpheus now has a coherent Windows operator experience rather than an
OpenClaw-first shell. The **Signal OS** production candidate is implemented,
committed, packaged, and verified through automated tests, visual checks,
normal packaged startup, and fresh-profile Electron journey tests. Larry's focused review instructions are in
[`docs/releases/LARRY_REVIEW_GUIDE.md`](docs/releases/LARRY_REVIEW_GUIDE.md).

The visible product now provides:

- an original Morpheus Signal identity with no actor likeness or inherited
  ClawX artwork;
- a full-window first-run activation that introduces the product, reports real
  capability/runtime/provider/voice readiness, offers companion behavior, runs
  a real privacy-safe first mission, reaches **Morpheus is ready**, and
  transitions naturally into the Command Center;
- truthful Objective Core readiness that requires a credentialed,
  planner-compatible account and routes missing setup directly to the existing
  Models provider dialog;
- natural voice recovery that asks for one repeat after unclear audio, routes
  configuration failures directly to provider setup, and speaks both completed
  results and necessary clarifications;
- selectable provider-backed neural speech for final responses, with bounded
  ephemeral audio, personality-aware delivery and a truthful Windows fallback;
- a larger state-driven living Signal across boot, activation, Command Center,
  Invoke and trust, with reduced-motion support and no fake telemetry;
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

The runtime foundation remains intact: 22 controlled Windows capabilities,
sequential typed plans, whole-plan trust evaluation, exact grants, Missions,
Projects/context, Goals, Agent Profiles, workflows, Morpheus schedules,
Systems, Activity, artifacts, push-to-talk, opt-in ambient voice, and a
provider-neutral planning boundary. The embedded OpenClaw Gateway now drains
its managed stdout pipe, uses local-first background pairing discovery, and
preserves stable Gateway session keys for legacy transcript replay. Ambient
voice startup is readiness-gated and stops retrying after a provider failure.

This is a strong internal release candidate for hands-on product testing. It is
not yet a signed public release, and microphone/acoustic quality plus broad
provider-backed planning still require testing with the user's actual hardware
and compatible credentials.

## Branch and commits

| Item | Value |
| --- | --- |
| Current branch | `codex/morpheus-windows-production-candidate` |
| Current verified runtime source | `7336fba` |
| Living presence and neural voice | `9222a10` |
| Cinematic voice-first arrival | `6cf5211` |
| Operator private-alpha core | `dcf0eaf` |
| Larry review runtime source | `765b5da` |
| Signal OS runtime source | `8ba4568` |
| Signal OS doctrine | `1af1f25` |
| Windows 1.0 Foundation checkpoint | `4895fa4` |
| Origin | `https://github.com/MoNaBOSS/Morpheus.git` |
| Remote state | Pushed to `origin/codex/morpheus-windows-production-candidate` |

The documentation checkpoint follows the packaged runtime and does not change
application behavior. `git rev-parse HEAD` is the authoritative latest commit.

## Latest Windows installer

| Field | Verified value |
| --- | --- |
| Installer | `E:\Larry Lee\Morpheus\Releases\Windows\1.0.1\Morpheus-1.0.1-win-x64.exe` |
| Size | 263,685,547 bytes |
| SHA-256 | `90A24F92509DBE32FBFDC7AF15F44824C49482CEA3E1426A57D8467ADD7C05E1` |
| Authenticode | `NotSigned`; production signing remains CI/credential-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |
| Unpacked size | 213,989,888 bytes |
| Unpacked SHA-256 | `222589D562F1D4578F7737984132609510BF30C587CF34214556D1B52F672C44` |

`pnpm package:win` completed from committed runtime source `7336fba`.
Generated release files are ignored and untracked.

## Test and verification status

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass before the documentation checkpoint |
| Typecheck | Pass |
| Lint | 0 errors; 12 inherited Fast Refresh warnings |
| Morpheus unit tests (1.0.1) | 702/702 pass across 75 files |
| Gateway/chat stabilization tests | 54/54 pass across 4 focused files |
| Windows production-candidate and Gateway/chat harness validation/dry run | Pass |
| Communication replay and comparison | Pass |
| Full Morpheus E2E | 55/56 pass in one serial run; one Electron worker exited before test start and that exact journey passed 1/1 in isolation |
| Setup/Chat/Gateway/Skills regression canaries | 10/10 pass |
| Signal OS Channels regression journeys | 5/5 pass after following the intentional More navigation |
| Living-presence Electron journeys | 12/12 pass, including fresh activation, 1280x800 Command Center, voice recovery, trust and reduced motion |
| Repository-wide unit suite (1.0.1) | 2,658 pass, 2 skipped, 18 inherited path/plugin/upgrade and chat timing failures; chat passes 5/5 in isolation |
| Vite production build | Pass |
| Windows NSIS package | Pass |
| Visual verification | Pass at 1280×800 for activation, Command Center, Presence, trust, provider setup, Missions, and Quick Command |
| Normal packaged startup | Pass; responsive process tree remained stable, Gateway health returned HTTP 200, and the embedded Gateway listened on port 18789 |
| Existing-profile Chat replay | Pass; the legacy `Hello There` transcript and its real tool-call result loaded within seconds |
| Cleanup | All processes started by the unpacked package closed and port 18789 released |

The current packaged smoke used the real unpacked production executable with no
debugger and no E2E lock bypass. It started from the user's existing background
preference, remained responsive with the stable six-process Electron tree, and
started the embedded Gateway on port 18789 without a duplicate process or
restart loop. System reporting, workspace file creation, Notepad launch, measured
Mission progress, artifacts, Activity/audit projection, and a fresh Chat were
verified against the production bundle. All owned Morpheus, Gateway, and test
Notepad processes were then closed.
Fresh activation, provider recovery, Command Center, Quick Command, Mission,
trust, reduced-motion, and voice recovery are verified through isolated Electron
journeys against the same production bundles.

The current stabilization smoke additionally opened the packaged companion and
full 1280x800 Command Center, confirmed truthful missing-provider/voice state,
loaded the previously stuck `Hello There` conversation with its stored user
message, five tool calls, and assistant result, and observed no new Gateway
configuration timeout or fatal log entry during idle operation.

Verification screenshots remain outside Git:

- `C:\Morpheus\verification\operator-complete-2026-08-26\activation-ready-1280x800.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\activation-voice-calibration-1280x800.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\signal-command-center-1280x800.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\signal-provider-setup.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\signal-presence.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\signal-trust-boundary.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\command-center-mission-1280x800.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\mission-history-1280x800.png`
- `C:\Morpheus\verification\operator-complete-2026-08-26\quick-command-overlay.png`
- `C:\Morpheus\verification\windows-production-candidate-2026-08-27\command-center-final-1280x800.png`
- `C:\Morpheus\verification\windows-production-candidate-2026-08-27\live-chat-gateway-1280x800.png`
- `C:\Morpheus\verification\windows-production-candidate-2026-08-27\activity-audit-1280x800.png`
- `C:\Users\monir\AppData\Local\Temp\morpheus-living-presence-20260829\arrival-boot-1280x800.png`
- `C:\Users\monir\AppData\Local\Temp\morpheus-living-presence-20260829\activation-greeting-1280x800.png`
- `C:\Users\monir\AppData\Local\Temp\morpheus-living-presence-20260829\signal-command-center-1280x800.png`

## Known limitations

- Real provider-backed broad planning and transcription require compatible
  provider/STT credentials configured locally. Deterministic registered
  capabilities remain usable without them.
- Ambient voice is explicit opt-in and provider-backed; it is not an offline
  wake-word engine. Microphone recognition, latency, speaker output, barge-in,
  and acoustic quality need hands-on testing on the target device.
- Neural output requires an API account that implements the configured
  OpenAI-compatible speech endpoint. Chat-only compatible providers may fall
  back to Windows speech; actual voice quality and cost remain provider-owned.
- The repository-wide unit suite retains 19 pre-existing failures in untouched
  OpenClaw path/plugin fixtures and known Chat/image timing tests; the complete
  Morpheus suite and packaged runtime checks are green.
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
git checkout codex/morpheus-windows-production-candidate
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
pnpm harness validate --spec harness/specs/tasks/morpheus-windows-production-candidate.md
pnpm harness run --spec harness/specs/tasks/morpheus-windows-production-candidate.md --dry-run
pnpm harness validate --spec harness/specs/tasks/stabilize-openclaw-gateway-chat.md
pnpm exec vitest run tests/unit/acp-chat-service.test.ts tests/unit/control-ui-device-pairing.test.ts tests/unit/gateway-process-launcher.test.ts tests/unit/morpheus-voice-store.test.ts
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

Give the verified installer and
[`docs/releases/LARRY_REVIEW_GUIDE.md`](docs/releases/LARRY_REVIEW_GUIDE.md) to
Larry for hands-on opinion testing. Capture concrete feedback on first-use
clarity, operator feel, trust interruptions, responsiveness, voice hardware,
and one real weekly task. Use that evidence to choose the next product slice;
prepare a signed external build only after authorized signing credentials and a
Morpheus update channel exist.
