# Morpheus Windows Production Candidate — Handoff

**Latest cross-device entry point (2026-09-29):** read
[PC_CODEX_START_HERE.md](PC_CODEX_START_HERE.md) first. It identifies the pushed
branch, superseding bottom-right design, current evidence and concrete next work.
The candidate summaries below are historical; do not use an old installer as
evidence for the September 29 source.

Read [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md), and the canonical
product, architecture, design, security, roadmap, and release documents before
changing the runtime.

For the 2026-09-23 experience reset and cross-device continuation, read
[`docs/roadmap/MORPHEUS_MAC_HANDOFF.md`](docs/roadmap/MORPHEUS_MAC_HANDOFF.md)
first. Its approved Phase 4 interface direction supersedes the old Ask/Auto/Act
everyday-screen description below. Old release reports remain historical.

## Current project status

### Experience reset — Phase 3 source implementation (2026-09-22)

The dirty 1.1.2 candidate and Phase 1–2 work are preserved. Phase 3 adds Main-owned
concurrent task coordination, durable conservative recovery, named task controls,
stable UI task selection, queued exact consents, Balanced new-profile defaults,
named websites and a registered per-user Spotify installation. Read
[task continuity](docs/architecture/MORPHEUS_TASK_CONTINUITY.md) before modifying
the task engine. It supersedes old single-objective and Autonomous-default prose.

No installer/version bump, public release, live provider benchmark or microphone
acceptance is implied by this source checkpoint. Test the rebuilt source, not
the older release installer listed below. The complete persona, adaptive
onboarding/workspace and global cost accounting remain later phases.

### Current candidate: 1.1.2 Unified Presence (2026-09-17)

The current uncommitted working tree keeps the complete 1.1.1 provider, voice
and companion candidate and closes the visible split between OpenClaw Chat and
Morpheus Objective Core. Chat now has a prominent living Signal driven by real
Voice, Objective Core and ACP lifecycle state. Ask, Auto and Act remain one
composer-level decision; actionable text executes without leaving Chat, while
ordinary conversation, attachments and targeted agents still use OpenClaw.
Chat-origin objectives expose their real status, result summary and stop control
beside the Signal. No simulated progress or separate Chat execution authority
was introduced.

Typecheck, production packaging, `git diff --check`, 765 Morpheus unit tests,
25 companion/foundation/voice/motion Electron journeys, and all 7 provider
lifecycle journeys pass. A 1280x800 layout check verified that the Signal,
conversation, toolbar and composer remain visible without horizontal overflow.
An isolated launch from the rebuilt packaged executable confirmed title
`Morpheus`, `/chat`, an 84x84 live Signal and clean process/listener teardown.

Delivery installer:
`E:\Larry Lee\Morpheus\Releases\Windows\1.1.2\Morpheus-1.1.2-win-x64.exe`.
It is 265,948,732 bytes, Authenticode `NotSigned`, SHA-256
`839D4ECE36281F2031A443887259918C91EE5FDD0363B743B6764922F2990129`.
Publisher signing, clean-machine install/upgrade and live provider/microphone
quality remain external public-release gates. See
[1.1.2 unified presence](docs/releases/1.1.2-UNIFIED-PRESENCE.md).

### Previous candidate: 1.1.1 Provider and Voice Optimization (2026-09-16)

The current uncommitted working tree keeps the 1.1.0 Production Companion and
adds a dated, cost-aware provider policy. New OpenAI/OpenRouter accounts default
to Luna rather than Sol, existing account models can be changed in place, and
the setup UI exposes a DeepSeek Flash economy choice. One configured OpenRouter
account can now power planning, Whisper transcription and Kokoro or Orpheus
speech through explicit one-key presets. No reusable company secret is embedded;
keys remain Main-owned and local.

Typecheck, production packaging, harness validation/dry-run, communication
replay/comparison, 63 focused provider/voice tests, 760 Morpheus unit tests, all
2,735 repository unit tests (2 skipped), and all 66 Morpheus Electron journeys
pass. A fresh isolated normal-production packaged smoke passed setup, cinematic
activation, a real system report, Gateway `running`, usable Chat and the new
voice setup with no Renderer page/console errors or leftover processes/listener.

Delivery installer:
`E:\Larry Lee\Morpheus\Releases\Windows\1.1.1\Morpheus-1.1.1-win-x64.exe`.
It is 265,946,208 bytes, Authenticode `NotSigned`, SHA-256
`491022DC629A6A0AE087C3765E33918FEECADB0D23C47EF178005286CCCE3C59`.
Live paid OpenRouter speech/transcription, Larry's microphone/acoustic quality,
publisher signing, clean-machine install/upgrade, updates, support and legal
review remain external public-release gates. See
[1.1.1 provider and voice optimization](docs/releases/1.1.1-PROVIDER-VOICE-OPTIMIZATION.md).

### Previous candidate: 1.1.0 Production Companion Review (2026-09-16)

The current uncommitted working tree upgrades the private-review candidate with
automatic end-of-speech detection, a bounded hands-free follow-up turn, Main-owned
conversation admission, truthful installed-Windows-voice selection, a quieter
first-run speech presentation, and tighter Core provider request/output limits.
The Command Center remains mission-first and all voice objectives still enter the
same Objective Core, plan policy, capability, artifact and audit pipeline.

`pnpm package:win` completed and a fresh isolated packaged-production smoke passed
setup, cinematic activation, Gateway readiness, a real privacy-safe system report,
Command Center, and live Chat. It produced no Renderer page or console errors and
left no Morpheus process or port 18789 listener after shutdown. The delivery copy
is `E:\Larry Lee\Morpheus\Releases\Windows\1.1.0\Morpheus-1.1.0-win-x64.exe`.
It is 265,943,124 bytes, Authenticode `NotSigned`, SHA-256
`11F7694870597340FF59946D1913B04554E82AF266A79AD801B3D81C436332D5`.

Typecheck, production build, harness validation/dry-run, communication replay and
comparison, 79 focused voice/planner tests, and every one of the 64 Morpheus E2E
journeys have passing evidence. The full unit run reached 2,728 passing and 2
skipped tests; the inherited OpenAI-image local HTTP fixture timed out and also
timed out alone. Dependency policy reports five unresolved moderate advisories in
Vitest tooling and Hono. Live neural speech, microphone/acoustic quality, signing,
clean-machine installation, provider cost acceptance, updates and legal review
remain external public-release gates. See
[1.1.0 production companion](docs/releases/1.1.0-PRODUCTION-COMPANION.md).

### Current candidate: 1.0.5 Visual Review (2026-09-15)

Focused motion polish on top of the preserved 1.0.4 diff: calmer luminous orb,
staggered greeting, reduced-cost scene transitions, inline greeting speech status,
and smooth Quick Command invocation. No execution policy, provider, microphone
opt-in, pricing or installed profile changes. Candidate verification and artifact
details are recorded in [1.0.5 visual review](docs/releases/1.0.5-VISUAL-REVIEW.md).
Delivered installer:
`E:\Larry Lee\Morpheus\Releases\Windows\1.0.5\Morpheus-1.0.5-win-x64.exe`.
265,942,983 bytes; unsigned. SHA-256:
`95D9F3FCFF15F0233553B4691630790AC7111324ED9DA558E43788E2A9C1CC59`.
Full units: 2,722 passed, 2 skipped. Morpheus E2E: 64/64, plus the five final
motion checks against rebuilt output. Typecheck/lint/harness/comms passed.
Normal packaged startup, system report, gateway, Chat opening, tray/restore and
cleanup passed; no renderer errors. All 475 built files match the ASAR. See the
report for exact test boundaries and screenshots, not a public-release claim.
Changes remain uncommitted on the same branch and checkpoint described below.
The existing neural-authentication and Windows microphone-input blockers remain.

### Previous candidate: 1.0.4 Companion Experience (2026-09-14)

Uncommitted work on `codex/morpheus-windows-production-candidate`, based on
`9908e7d5c15f3e936d5fc7a34b8f8cc3e9377418`. Nothing pushed in this campaign.
Preserve the working diff; do not reset it or treat old 1.0.3 tests as new evidence.

Adds mic-reactive glowing Signal, bounded name/follow-up interaction, explicit
Windows local wake adapter, actual voice preview/mic checks and streamed MP3 output.
The existing Core, execution permissions, audit, artifacts and OpenClaw remain.
Natural hands-free use is **not complete**: packaged neural preview still fails
authentication and falls back to Windows; local recognizer input initialization
fails. Full units pass (2,722, plus 2 skipped). Morpheus E2E has passing coverage
for all 61 journeys after a Windows-worker-crash rerun; do not hide that caveat.
Packaged greeting, real system
report, gateway, Chat opening and cleanup passed. See
[1.0.4 evidence and limitations](docs/releases/1.0.4-COMPANION-CANDIDATE.md) and
[milestones](docs/roadmap/COMPANION-EXPERIENCE-MILESTONES.md).

Candidate installer:
`E:\Larry Lee\Morpheus\Releases\Windows\1.0.4\Morpheus-1.0.4-win-x64.exe`.
265,942,817 bytes, unsigned. SHA-256:
`C1F9CB322F73C49E6198925D1496CEBB84913B9E035380653DBB2BDF70B28DA3`.

Next: make default microphone recognition work, configure valid speech access
locally, then run wake/name -> command -> execution -> spoken result repeatedly
with measured latency and false activations. Do not add more pages to mask these
acceptance failures. Three broader Chat attachment/history checks also fail on the
untouched `9908e7d` checkpoint; evidence and limits are in the candidate report.
Prior entries below are historical snapshots.

### Latest update: 1.0.3 Release Readiness (2026-09-04)

Voice failures now expose safe, actionable failure categories and truthful Windows
fallback state. Voice settings persist atomically. Windows test fixtures use the
correct simulated path semantics and the full unit suite is worker-bounded.
Electron and affected dependencies were updated; the remaining two image-size
advisories have a repository-owned patch and an explicit full-tree security gate.
See [parser remediation](docs/security/IMAGE-PARSER-REMEDIATION.md).

Public release is **not approved**. [Public release gates](docs/releases/PUBLIC-RELEASE-GATES.md)
separate locally verifiable work from live voice/usage, signing, clean-machine
installation and owner review. CI creates drafts and no longer uses inherited
ValueCell signing identity. No pricing UI, profile reset or public release was
introduced. Final installer evidence is recorded in the 1.0.3 release report;
the earlier 1.0.2 results below remain historical rather than new verification.

Runtime `681e1617c80841a273f1e89f2b12ee960d4f000c` is committed and pushed.
Full units: 2,705 passed, 2 skipped. All 59 Morpheus journeys passed after the
targeted animation-settling rerun; eight additional gateway/Skills/Office checks
passed. Normal packaged startup, tray, system report, gateway/Chat and cleanup
passed. Live neural speech still failed authentication (401).

Latest installer: `E:\Larry Lee\Morpheus\Releases\Windows\1.0.3\Morpheus-1.0.3-win-x64.exe`.
Size 265,939,145 bytes; SHA-256
`E1DD393F6C6BF1251D9AAEFC5583CC1C5008804B00C4F5D1C194A5C0737B2857`.
Unsigned. Screenshots: `E:\Larry Lee\Morpheus\Review\1.0.3`.
See [1.0.3 verification](docs/releases/1.0.3-RELEASE-READINESS.md) for exact scope.

### Latest update: 1.0.2 Responsive Operator (2026-09-04)

Adds bounded Core provider generation and usage evidence, Main-side speech
cancellation, duplicate-speech prevention, visible speech preparation, tray-safe
audio monitoring and refined state-driven motion. No pricing UI or profile reset.
See [1.0.2 acceptance](docs/releases/1.0.2-RESPONSIVE-OPERATOR.md).
The reported EUR80 charge is not reconciled by available local transcript usage.
Core limits do not cover independent OpenClaw Chat traffic or guarantee a euro cap.
Runtime `d6b3a6be3aac03ef7103d6e295fe49e0ab4c491c` is committed and pushed.
720 Morpheus unit tests and 14 Electron journeys passed; normal packaged startup,
tray handoff, real system report and gateway/Chat checks passed. The current
speech credential returned HTTP 401 on a real probe, so neural speech remains
blocked on valid endpoint credentials; Windows fallback spoke the greeting.
The unsigned 1.0.2 installer and screenshots are in the delivery folders below.

### Previous update: 1.0.1 Fluid Arrival (2026-09-04)

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
| Current verified runtime source | `d6b3a6b` |
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
| Installer | `E:\Larry Lee\Morpheus\Releases\Windows\1.1.2\Morpheus-1.1.2-win-x64.exe` |
| Size | 265,948,732 bytes |
| SHA-256 | `839D4ECE36281F2031A443887259918C91EE5FDD0363B743B6764922F2990129` |
| Authenticode | `NotSigned`; production signing remains CI/credential-owned |
| Unpacked executable | `C:\Morpheus\morpheus-core\release\win-unpacked\Morpheus.exe` |
| Unpacked size | 223,766,528 bytes |
| Unpacked SHA-256 | `9BE38E18B7E6DD3CE70B5A7D429DA4FBB88FB4E06D17EF32884996B5E23BE273` |

`pnpm package:win` completed from the current uncommitted 1.1.2 working tree on
base checkpoint `9908e7d`. Generated release files are ignored and untracked.

## Test and verification status

| Validation | Result |
| --- | --- |
| `git diff --check` | Pass; line-ending warnings only |
| Typecheck and production build | Pass |
| Lint | 0 errors; 12 existing source Fast Refresh warnings, duplicated by the ignored baseline snapshot |
| Current Morpheus unit suite | 765/765 pass across 88 files |
| Repository-wide unit suite | 2,728 pass, 2 skipped; one inherited image-plugin local HTTP fixture timeout |
| 1.1.0 companion harness validation/dry run | Pass |
| Communication replay and comparison | Pass |
| Current affected Morpheus E2E | 25/25 companion, foundation, voice and motion journeys pass; 7/7 provider lifecycle journeys pass |
| Security dependency policy | Two high image parser advisories locally patched; five moderate Vitest/Hono advisories remain unresolved |
| Windows NSIS package | Pass |
| Visual verification | Current Chat composition passes at 1280×800 with live Signal, toolbar and composer above the fold; prior 1920×1080 and 800×800 evidence remains valid |
| Packaged asset smoke | Pass: rebuilt `Morpheus.exe` opens `/chat` with title `Morpheus`, an 84×84 live Signal, and clean shutdown |
| Cleanup | Zero Morpheus processes and zero listeners on port 18789 |

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

- `E:\Larry Lee\Morpheus\Review\1.1.2\packaged-chat-1280x800.png`
- `C:\Morpheus\visual-evidence\1.1.0-final\packaged-activation-1280x800.png`
- `C:\Morpheus\visual-evidence\1.1.0-final\packaged-ready-1280x800.png`
- `C:\Morpheus\visual-evidence\1.1.0-final\packaged-command-center-1280x800.png`
- `C:\Morpheus\visual-evidence\1.1.0-final\packaged-chat-1280x800.png`
- `C:\Morpheus\visual-evidence\1.1.0-final\polished-presence-1280x800.png`
- `C:\Morpheus\visual-evidence\1.1.0-final\polished-welcome-1920x1080.png`

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
- The full unit suite currently has one inherited image-plugin local HTTP fixture
  timeout. Five moderate Vitest/Hono dependency advisories also remain open.
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
