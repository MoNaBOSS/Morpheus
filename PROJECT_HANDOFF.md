# Morpheus Windows 1.0 Foundation — Project Handoff

This is the verified handoff for the Windows 1.0 Foundation release candidate.
Before changing the runtime, read [`CLAUDE.md`](CLAUDE.md),
[`AGENTS.md`](AGENTS.md), and the canonical product, architecture, design,
security, roadmap, and release documents.

## Current project status

The credential-independent Windows 1.0 Foundation is implemented, committed,
packaged, and smoke-tested. It is the real Morpheus product architecture, not a
demo, provider-specific fork, or claim that every future product capability is
complete.

The current product includes:

- a unified Objective Core used by Command Center, Quick Command, explicit Chat
  execution, workflows, and schedules;
- provider-neutral planning, validated typed plans, bounded observation and
  continuation/replanning, plus an honest deterministic fallback;
- sequential multi-step execution with dependencies, status, results, errors,
  durations, artifacts, cancellation, and audit-backed live events;
- plan-level trust-delta evaluation with Strict, Balanced, and Autonomous
  profiles, one batched consent for new boundaries, exact grants, and immediate
  revocation;
- 19 controlled Windows capabilities without arbitrary shell, PowerShell,
  executable paths, arguments, environment variables, or unrestricted
  filesystem access;
- reusable Agent Profiles, workflows, Morpheus-owned schedules, workspaces,
  artifacts, Activity, and append-only audit history;
- push-to-talk voice input, Windows speech output, global Quick Command,
  background/tray behavior, and single-instance handling;
- a compact Matrix-accented Command Center and preserved OpenClaw Gateway, Chat,
  Models, Agents, Channels, Skills, and Cron functionality.

Release artifacts and verification screenshots are intentionally outside Git.

## Branch and commits

| Item | Value |
| --- | --- |
| Current branch | `windows-1.0-foundation` |
| Verified packaged source | `445d95ec53e94cb65dbcd60707e5e8017b2ae513` |
| 0.5 checkpoint | `d6a03f8` |
| Origin | `https://github.com/MoNaBOSS/Morpheus.git` |
| Origin state before this handoff commit | `origin/windows-1.0-foundation` at `81f39cd` |

The final documentation commit is intentionally after the packaged source
commit because it changes handoff text only. Use `git rev-parse HEAD` after
checkout for the latest documentation commit. Do not rewrite the verified
checkpoints.

## Latest Windows installer

The build output is ignored by Git and must be copied separately or rebuilt.

| Field | Verified value |
| --- | --- |
| Installer | `C:\Morpheus\morpheus-core\release\Morpheus-1.0.0-win-x64.exe` |
| Size | 263,618,245 bytes (251.41 MiB) |
| SHA-256 | `FEA523967FE5BFF66F0F88383457712DBD17176FF700300C33EFAC8EA2EDA083` |
| Authenticode | Not signed locally; production signing remains CI/credential-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |
| Unpacked SHA-256 | `4CF27ABA2BF2B276963B3B2F3863CF3FD9C163D54444AF88232E893438E59186` |

`pnpm package:win` completed successfully from committed source `445d95e`.
Generated release files are not tracked.

## Test and verification status

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass |
| Typecheck | Pass |
| Lint | 0 errors |
| Targeted Windows 1.0 unit tests | 670/670 pass |
| Full unit run | 2,516 pass, 2 skip, 16 inherited Windows path-assertion failures |
| NSIS patch tests after focused fix | 6/6 pass |
| Full Electron E2E | 178 pass, 3 expected platform skips, 0 failures |
| Final update/About E2E | 2/2 pass |
| Harness validation and dry run | Pass |
| Comms replay and regression comparison | Pass |
| Windows NSIS package | Pass |
| Normal-production packaged smoke | Pass |

The packaged smoke verified boot READY, Morpheus identity, Gateway readiness,
live Chat, Command Center, truthful update/About states, automatic system
report, scoped Notepad and workspace trust reuse, file artifacts, Quick Command,
Activity/audit ordering, and clean process shutdown. Exact grant revocation and
persistence behavior is additionally covered by the E2E suite.

The 16 inherited full-unit failures are hard-coded POSIX/macOS path expectations
on Windows: nine OpenClaw CLI assertions, six plugin-install assertions, and one
upgrade-snapshot separator assertion. They are not application failures and were
not hidden or changed merely to force a green total.

## Known limitations

- Live provider-backed planning and real speech transcription require a provider
  and credentials configured by the user. Credential-independent flows and the
  deterministic fallback are complete; no provider result is simulated.
- The Morpheus update endpoint is intentionally not configured. Update checks
  remain disabled and never target inherited ClawX releases.
- Local Windows binaries are unsigned. Production Authenticode requires the
  authorized CI/SignPath credentials.
- A user OpenClaw configuration used during smoke has
  `browser.ssrfPolicy.dangerouslyAllowPrivateNetwork=true`; Morpheus reports the
  warning but does not silently rewrite independent OpenClaw user settings.
- Current native capability adapters and release verification are Windows-only.
  Shared execution contracts remain platform-neutral.
- Plan execution remains sequential by design. Concurrency requires explicit
  resource-locking and scheduling semantics in a later milestone.
- `resources/icons/icon.icns` must be regenerated from the Morpheus source
  artwork on macOS before a credible Mac distribution build.
- Some inherited OpenClaw internal identifiers remain for data and runtime
  compatibility; normal product identity and authority are Morpheus.

## Architecture summary

Canonical references:

- [`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md)
- [`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md)
- [`docs/architecture/MORPHEUS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_ARCHITECTURE.md)
- [`docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md`](docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md)
- [`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`](docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md)
- [`docs/design/MORPHEUS_DESIGN_SYSTEM.md`](docs/design/MORPHEUS_DESIGN_SYSTEM.md)
- [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md)
- [`docs/security/WINDOWS_1.0_SECURITY_REVIEW.md`](docs/security/WINDOWS_1.0_SECURITY_REVIEW.md)
- [`docs/releases/1.0.0-FOUNDATION-ACCEPTANCE.md`](docs/releases/1.0.0-FOUNDATION-ACCEPTANCE.md)

Morpheus owns identity, objectives, planning, policy, capabilities, Agent
Profiles, workflows, schedules, workspaces, artifacts, Activity, and audit.
OpenClaw is the embedded Gateway/Chat runtime. Replaceable providers may propose
typed plans but never receive operating-system authority.

```text
objective
  -> provider-neutral planner or truthful deterministic fallback
  -> validated typed execution plan
  -> whole-plan policy and trust-delta evaluation
  -> one consent only for genuinely new or broader boundaries
  -> sequential Main-owned capability execution
  -> bounded observation and continuation when required
  -> results, artifacts, live Activity, and append-only audit
```

Renderer calls Main through `src/lib/host-api.ts` and the typed `host:invoke`
registry. Renderer state cannot create grants, choose executable paths, submit
shell strings, or select unrestricted filesystem roots.

## Required software

- Git
- Node.js 24.x
- Corepack
- pnpm 10.33.4 (pinned in `package.json`)
- Windows 10/11 for current native capabilities and NSIS packaging
- Windows Developer Mode for electron-builder dependency extraction where
  symbolic-link creation is required
- Optional provider credentials configured through Morpheus Settings
- Optional signing credentials only in an authorized CI/signing environment

## Setup commands

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout windows-1.0-foundation
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
pnpm harness validate --spec harness/specs/tasks/morpheus-windows-1.0-foundation.md
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

Provider secrets are configured through Settings and OS-protected storage. Never
put credential values in this document, source control, screenshots, or audit
records.

## Next recommended task

Install the Windows release candidate and perform user-acceptance testing with a
real provider and microphone. Exercise natural objectives through Command
Center, voice, Quick Command, and Chat Execute, then prioritize refinements from
observed usability and planner behavior rather than expanding authority or
adding unrestricted shell access.

## MacBook Setup

```bash
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
cd morpheus-core
git checkout windows-1.0-foundation
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

Development and platform-neutral tests are available on macOS. Do not treat a
Mac package as release-ready until the Morpheus `.icns`, platform adapters, and
macOS-specific behavior are implemented and verified.
