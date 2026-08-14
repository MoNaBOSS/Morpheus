# CLAUDE.md

Orientation for AI coding agents working in this repository. Keep this file short —
it points at canonical documents rather than restating them.

## What this product is

**Morpheus is an AI execution platform and AI system builder, not a chatbot.**

```
User objective → intent interpretation → typed execution plan → policy evaluation
→ permission where required → deterministic capability execution → live events
→ results and artifacts → append-only audit history
```

Chat is one interface into Morpheus, not the product itself.

## Canonical documents — read before non-trivial work

| Document | When it governs |
| --- | --- |
| [`docs/product/MORPHEUS_VISION.md`](docs/product/MORPHEUS_VISION.md) | What Morpheus is; honesty requirements |
| [`docs/product/MORPHEUS_COMPANION_VISION.md`](docs/product/MORPHEUS_COMPANION_VISION.md) | Companion presence, autonomy, personality and memory |
| [`docs/product/MORPHEUS_PRODUCTION_COMPANION.md`](docs/product/MORPHEUS_PRODUCTION_COMPANION.md) | Ambient voice, proactivity, Goals, Systems and Windows completion boundary |
| [`docs/product/MORPHEUS_PRODUCT_BRAIN.md`](docs/product/MORPHEUS_PRODUCT_BRAIN.md) | Voice-first experience and durable product decisions |
| [`docs/product/PRODUCT_PRINCIPLES.md`](docs/product/PRODUCT_PRINCIPLES.md) | Operating rules and definition of done |
| [`docs/product/EDITIONS_AND_PLATFORMS.md`](docs/product/EDITIONS_AND_PLATFORMS.md) | Free vs Unrestricted; platform targets |
| [`docs/security/PERMISSION_MODEL.md`](docs/security/PERMISSION_MODEL.md) | Risk tiers, profiles, grant scopes, the interruption principle |
| [`docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md`](docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md) | Plan executor, trust delta, 0.5 decisions |
| [`docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`](docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md) | Objective orchestration, planner/replanner, context and voice boundaries |
| [`docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_COMPANION_MISSIONS_ARCHITECTURE.md) | Companion surface, Missions, Projects, memory and direct routing |
| [`docs/architecture/MORPHEUS_PRODUCTION_COMPANION_ARCHITECTURE.md`](docs/architecture/MORPHEUS_PRODUCTION_COMPANION_ARCHITECTURE.md) | Ambient voice, proactive service, Goals and Systems boundaries |
| [`docs/design/MORPHEUS_DESIGN_SYSTEM.md`](docs/design/MORPHEUS_DESIGN_SYSTEM.md) | Tokens, primitives, accent discipline |
| [`docs/architecture/MORPHEUS_ARCHITECTURE.md`](docs/architecture/MORPHEUS_ARCHITECTURE.md) | Layers, boundaries, extension recipes |
| [`docs/roadmap/MORPHEUS_ROADMAP.md`](docs/roadmap/MORPHEUS_ROADMAP.md) | Sequencing and what is not planned |
| [`docs/releases/0.5.0-ACCEPTANCE.md`](docs/releases/0.5.0-ACCEPTANCE.md) | Current milestone criteria |
| [`docs/releases/1.0.0-FOUNDATION-ACCEPTANCE.md`](docs/releases/1.0.0-FOUNDATION-ACCEPTANCE.md) | Windows 1.0 Foundation end-to-end acceptance |
| [`docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md`](docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md) | Windows production companion acceptance |

If any of the above conflicts with this file, **those documents win**.

## AGENTS.md still applies in full

[`AGENTS.md`](AGENTS.md) remains authoritative for repository mechanics. In
particular, all of these continue to hold:

- **Renderer/Main boundary** — renderer uses `src/lib/host-api.ts` /
  `src/lib/api-client.ts` only. No new direct `window.electron.ipcRenderer.invoke`
  in pages or components. No direct Gateway HTTP or WebSocket from the renderer.
- **Spec-driven harness rule** — changes touching renderer/Main/host-api/Gateway/
  OpenClaw paths start from a task spec under `harness/specs/tasks/` referencing
  `gateway-backend-communication`, validated with `pnpm harness validate`.
- **Spec/rule growth rule** — new features add or update the relevant harness
  scenario and rule specs in the same change.
- **i18n and design tokens** — user-facing text through `react-i18next` with full
  `en` / `zh` / `ja` / `ru` coverage; styling via the tokens and substitution table
  documented in `src/styles/globals.css`.
- **UI change validation** — user-visible changes ship with an Electron E2E spec.
- **Doc sync rule** — update the README set when behaviour or interfaces change.
- **Comms-change checklist** — `pnpm run comms:replay` and `pnpm run comms:compare`
  when touching communication paths.

## Non-negotiables

1. **Main process is the authority.** Renderer sends a logical action id and
   validated parameters — never an executable path, argv, environment, shell string
   or arbitrary filesystem path. Unknown payload keys are rejected, not ignored.
2. **Grants are narrow and revocable.** Exact capability + platform + resource. No
   wildcards. Permissions are evaluated **per plan**, asked once for genuinely new
   boundaries, and only `critical` is unwaivable.
3. **Record before you report.** Audit is written and awaited before a phase reaches
   the renderer. When auditing is unhealthy, degrade — do not proceed.
4. **No fakery.** No simulated events, fabricated capabilities, invented diagnostics
   or unsubstantiated provider/model claims. Unsupported input gets a truthful answer.
5. **`shared/**` is platform-neutral.** No `electron`, no `node:*` imports.
6. **One codebase.** No edition forks, no demo modes, no audience-specific paths.
7. **Preserve OpenClaw.** Chat, gateway, channels, agents, skills, cron and providers
   must keep working. OpenClaw must not define the visible product identity.

## Common commands

| Task | Command |
| --- | --- |
| Type check | `pnpm run typecheck` |
| Lint | `pnpm run lint` |
| Unit tests | `pnpm test` |
| Build renderer | `pnpm run build:vite` |
| E2E | `pnpm run test:e2e` |
| Windows installer | `pnpm package:win` |
| Harness validate | `pnpm harness validate --spec <task-spec>` |

## Known environment quirks (Windows checkouts)

These are pre-existing and unrelated to product code — do not "fix" them by changing
unrelated source:

- `core.autocrlf=true` yields CRLF markdown, which the harness frontmatter parser
  (`harness/src/specs.mjs`) rejects because it only accepts LF.
- `tests/unit/host-api-facade.test.ts` has one boundary assertion that fails on
  Windows due to a `${cwd}/` path join that never matches backslash paths.
- Some tests need symlink privilege (Developer Mode) and fail with `EPERM` without it.
