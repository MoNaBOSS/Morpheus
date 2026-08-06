# Morpheus — Project Handoff

Written at the end of a Windows session, for continuing on macOS. Snapshot as
of the commit below — re-read [`CLAUDE.md`](CLAUDE.md) and the docs it points
to before making changes; they are canonical, this file is a status snapshot.

## 1. Current status

**Milestone 0.1.1 (productization) is complete and verified on Windows.**
Concept Build 0.1 (native action framework: registry, capability adapters,
permission gate, audit, boot, command surface) shipped first as its own
checkpoint commit; 0.1.1 converted the product from ClawX to Morpheus and
added the execution-plan and risk-based permission layers on top of it.

Working tree was clean at handoff. **Not yet pushed to `origin`** — see
§9, this needs your action.

## 2. Branch

```
feat/morpheus-productization-0.1.1
```

Base: `df37560` (`feat(morpheus): implement concept build 0.1`, the Concept
Build 0.1 checkpoint, tested and packaged on its own before productization
began). 10 commits ahead of that checkpoint; do not rewrite the checkpoint.

## 3. Current commit

```
56d4b0f  spec(morpheus): update harness task spec for the 0.1.1 milestone
```

Full log back to the checkpoint (`git log --oneline df37560..HEAD`):

```
56d4b0f spec(morpheus): update harness task spec for the 0.1.1 milestone
88a0c5a docs(morpheus): sync README set to the 0.1.1 surface
aefcf75 test(morpheus): update inherited navigation specs for the route move
4c55ea1 test(morpheus): verify productization and permission behaviour
b5c3b4e feat(morpheus): productize command center and boot experience
5e25caa fix(morpheus): correct escaped path literal in api test fixture
6780562 feat(morpheus): wire policy engine into runtime and host API
2443d46 feat(morpheus): add scoped permission policy and execution plans
93c4b17 feat(morpheus): establish desktop identity and profile migration
2ffb8bb docs(morpheus): define product doctrine and permission model
```

## 4. Latest installer

Built locally, **not committed** (`release/` is gitignored — rebuild it
yourself, don't expect it to appear after `git clone`):

| | |
|---|---|
| File | `Morpheus-0.1.1-win-x64.exe` |
| Size | 263,542,288 bytes (251.33 MB) |
| SHA-256 | `DFE2E069DA589CC5C43BB51E2465914503EAA2CFB2E019BD8166A8B8D50D4D10` |
| Authenticode | **Not signed** — expected; `electron-builder.yml` has no certificate, production signing is CI-only via SignPath |

Windows-only. On macOS you'd run `pnpm package:mac` for a `.dmg`/`.zip`
instead — untested this session, no mac-specific work has been done.

## 5. Test status (Windows, this session)

| Suite | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm run typecheck` | pass |
| `pnpm run lint` | 0 errors, 7 pre-existing warnings |
| Morpheus unit tests | 290/290 pass (16 files) |
| Morpheus E2E | 27/27 pass (routing, command center, permissions, audit, boot) |
| Regression canaries (app-smoke, main-navigation, developer-mode, light-neutral-theme) | 8/8 pass |
| Packaged smoke (14-point checklist) | 15/15 pass |

**Known pre-existing failures — 26 tests, all in files this milestone never
touched, all present before this work started:**
- `harness-specs` (7) / `harness-runner` (1) — `core.autocrlf=true` gives CRLF
  markdown; the harness frontmatter parser (`harness/src/specs.mjs`) only
  accepts LF. Environment artifact, not a code bug.
- `openclaw-cli` (9), `plugin-install` (6), `openclaw-auth`,
  `openclaw-upgrade-snapshot`, `host-api-facade` — a `${cwd}/` path join that
  never matches backslash paths on Windows.
- `patch-nsis-extract`, `patch-nsis-install-section` — two suites fail to
  parse under this Node/Vitest combo on Windows.

**On macOS, re-run the full suite before trusting this list** — some of these
are Windows-path-specific and may simply not reproduce; others might surface
differently. Don't assume the counts carry over unchanged.

## 6. Known limitations (genuine, not TODOs)

- Deterministic command interpreter handles a small, fixed phrase set
  (system report / create text file / open Notepad). Temporary by design,
  behind the permanent `ExecutionPlan` contract — see
  `docs/architecture/MORPHEUS_ARCHITECTURE.md`.
- Windows only. Capability adapters exist under
  `electron/services/morpheus/capabilities/win32/`; contracts are
  platform-neutral and `unsupported-platform` is already a normal typed
  outcome, but no macOS/Linux adapter exists yet. **This is your next
  natural piece of work on a Mac** — see §10.
- Plans are single-step only; `ExecutionStep.dependsOn` is modelled and
  unused.
- No update feed configured (`electron/main/updater-policy.ts` —
  `MORPHEUS_UPDATE_FEED = null`). Updates report `not-configured`, by
  design, until a real endpoint exists.
- Local Authenticode signing unavailable; CI-only via SignPath.
- Pre-existing, unrelated-to-this-milestone app-wide gaps, documented not
  fixed: `sandbox: false`, no CSP, `gateway.rpc` forwards arbitrary method
  strings, `file:read*` is unrestricted despite a comment claiming
  otherwise. Flagged in `docs/security/PERMISSION_MODEL.md` context but out
  of scope for 0.1.1.
- **`resources/icons/icon.icns` is still the OLD ClawX icon.**
  `scripts/generate-morpheus-icons.mjs` regenerates `.ico`, the PNG set and
  `.svg` from `resources/branding/morpheus-mark.svg`, but has no `.icns`
  encoder — Apple's format needs a `.iconset` bundle run through
  `iconutil`, which only exists on macOS. `electron-builder.yml` references
  `resources/icons/icon.icns` for both `mac.icon` (line 75) and `dmg.icon`
  (line 101), so **a `pnpm package:mac` build today ships the wrong icon.**
  Fix on the Mac: build an `.iconset` from the same source SVG (e.g. via
  `sips`/`iconutil`, or extend the generator script to shell out to
  `iconutil` when `process.platform === 'darwin'`) and regenerate
  `icon.icns` before packaging. Do this before or alongside the macOS
  capability-adapter work in §11.

## 7. Architecture summary

Canonical docs (read these, this is just a pointer):
[`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md) ·
[`PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md) ·
[`EDITIONS_AND_PLATFORMS.md`](docs/product/EDITIONS_AND_PLATFORMS.md) ·
[`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md) ·
[`docs/architecture/MORPHEUS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_ARCHITECTURE.md) ·
[`docs/roadmap/MORPHEUS_ROADMAP.md`](docs/roadmap/MORPHEUS_ROADMAP.md)

One-paragraph version: Electron shell + OpenClaw as the embedded agent
runtime. Morpheus owns identity, execution planning, permissions,
capabilities and audit. A command becomes a typed `ExecutionPlan`
(`shared/morpheus/execution-types.ts`), is evaluated by a risk-based policy
engine (`electron/services/morpheus/policy/`) against Strict/Balanced/
Autonomous profiles and exact-scope grants, executes through a capability
registry keyed by `(actionId, platform)`, and every phase is written to an
append-only audit log **before** it reaches the renderer. `/` is the Command
Center; `/chat` is the OpenClaw chat interface — both first-class, chat is
not the product.

Renderer talks to Main only through `src/lib/host-api.ts` →
`window.clawx.hostInvoke` → `HostApiRegistry`. `shared/**` has zero
`electron`/`node:*` imports — it's shared by both processes.

## 8. Required software

- **Node.js** — this session used v24.15.0. No `engines` pin in
  `package.json`; match the major version if possible.
- **pnpm 10.33.4**, pinned via `packageManager` in `package.json`. Use
  Corepack: `corepack enable && corepack prepare` picks it up automatically.
- **Git**.
- For packaging on macOS: Xcode Command Line Tools (`xcode-select --install`)
  for native module builds; a valid Apple ID / app-specific password / team
  ID only if you intend to notarize (see env vars below) — not required for
  an unsigned local build.

## 9. Setup commands

```bash
git clone https://github.com/ValueCell-ai/ClawX.git morpheus-core
cd morpheus-core
git checkout feat/morpheus-productization-0.1.1
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
```

`pnpm run init` = `pnpm install` + `pnpm run uv:download`. See §12 for the
`git clone` caveat — the branch isn't on `origin` yet.

## 10. Environment variable names (never values)

From `.env.example` — copy to `.env` and fill in locally, never commit real
values:

```
OPENCLAW_GATEWAY_PORT
VITE_DEV_SERVER_PORT
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
CSC_LINK
CSC_KEY_PASSWORD
GH_TOKEN
```

The `APPLE_*` and `CSC_*` vars are for macOS notarization / code signing —
you'll likely want these set on the Mac if you plan to build a signed
`.dmg`. None are required for an unsigned dev build or `pnpm dev`.

## 11. Next recommended task

**macOS capability adapters.** The architecture was built for this
specifically:

1. Add `electron/services/morpheus/capabilities/darwin/` mirroring the
   `win32/` structure (`app-launch.ts`, `create-text-file.ts`,
   `system-report.ts`).
2. Register them in `electron/services/morpheus/index.ts` alongside the
   win32 ones.
3. Add `'darwin'` to the `platforms` array on the relevant descriptors in
   `shared/morpheus/actions/registry.ts`.
4. Nothing else changes — runtime, host contract, event channel, audit sink
   and UI are all platform-neutral already. That's the point of the
   `(actionId, platform)` capability-registry design; see
   `docs/architecture/MORPHEUS_ARCHITECTURE.md` "Extension recipes".

Second candidate: fix `icon.icns` (§6 — it's stale, not a maybe), then run
`pnpm package:mac` and fix whatever else is mac-specific in packaging
(entitlements in `entitlements.mac.plist`, DMG background), to get a first
unsigned `.dmg` building.

## 12. MacBook Setup — quick reference

```bash
git clone https://github.com/ValueCell-ai/ClawX.git morpheus-core
```

> **This will not have the branch yet** — `feat/morpheus-productization-0.1.1`
> is local-only on the Windows machine as of this handoff (see §9 in the
> main report / the push blocker below). Either pull it after the Windows
> side resolves push access, or add the Windows checkout as a second remote
> and fetch directly:
> ```bash
> git remote add windows-box <path-or-url-to-windows-checkout>
> git fetch windows-box feat/morpheus-productization-0.1.1
> git checkout -b feat/morpheus-productization-0.1.1 windows-box/feat/morpheus-productization-0.1.1
> ```

```bash
cd morpheus-core
git checkout feat/morpheus-productization-0.1.1
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

Test commands:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm run build:vite && pnpm run test:e2e
pnpm harness validate --spec harness/specs/tasks/morpheus-concept-build.md
```

Packaging (macOS):

```bash
pnpm package:mac
```
