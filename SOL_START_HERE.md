# Sol: continue Phase 7 implementation

Prepared by the Astra architecture pass on 2026-09-30 and updated after the Sol
7A.1–7A.4 source checkpoints and the partial 7B.1 source pass. NerdGPT is deferred. **Phase 7 is not complete or
packaged/live accepted.** Read the current checkpoint and evidence ledger for the
actual test scope before extending it.

## Verify source, preserve work

Repository: `https://github.com/MoNaBOSS/Morpheus.git`.
Application branch: `codex/morpheus-phase6-managed-layer`.
Audited application baseline: `32badea9c792863cbc9248100025f18f83d26e00`.
Windows checkout: `C:\Morpheus\morpheus-core`; verify, don't assume.

Inspect status, remote, branch and recent commits; fetch origin only after verifying
the remote. Read this file at the latest branch tip. Never reset, clean, overwrite
or automatically stash user work/profiles/providers. If dirty/divergent work needs
isolation, inspect attached worktrees and reuse a suitable one or create a managed
worktree through the app tools. Do not test an old installer or use `gh-pages` as
the application branch. Git source continuity does not synchronize private user
profiles, keys or chat history between PCs.

## Reading order (once; then read only the active checkpoint's dependencies)

1. `AGENTS.md`, `CLAUDE.md` for repository rules.
2. [Phase 7 execution plan/current checkpoint](docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md).
3. [Assistant architecture and selected native motion](docs/architecture/MORPHEUS_ASSISTANT_ARCHITECTURE.md).
4. [Acceptance gates and evidence ledger](docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md).
5. [September 29 verified PC checkpoint](docs/roadmap/MORPHEUS_PC_CHECKPOINT_2026-09-29.md)
   for inherited results; relevant source/test owners listed in the plan.

These dated records supersede old dashboard/Ask-Auto-Act, left/top-right placement,
two-edition and sequential-all-tasks product descriptions. Existing permission,
audit and runtime-isolation rules remain. Do not reread the entire historical
conversation or redesign a logo to start implementation.

## Next work

7A.1–7A.4 have focused Windows source automation. B.1 app-owned static-key
migration/runtime recovery is committed as `2469c650`: protected storage,
SecretRefs, exact-match rotation/relaunch, stable sibling-account selection,
OAuth activation without stale replay and safe deletion. A copied synthetic
legacy profile and same-user Windows protected restart passed; unrelated
credentials and owner profiles were preserved. The narrow B.1 diff-aware
harness validation/dry-run passed in the isolated build clone against `1edfd536`.
Upstream OAuth, unprovenanced old image keys and transient upgrade snapshots
retain documented plaintext limits; B.1 packaged/real-profile/live gates remain
open. Do not reopen its source discovery or destroy those existing credentials.

Current source work is C.1 wake/capture and C.2 output verification. Read their
narrow source evidence in `docs/releases/` and the current checkpoint in the
roadmap. Exact installer identity/checks appear in the acceptance ledger when
built; a source build or packaged-payload smoke is not hardware/live acceptance.
Preserve the same assistant/conversation/task owner; no second engine or dashboard.

Use [the Phase 7 harness spec](harness/specs/tasks/morpheus-phase7-assistant.md)
as the umbrella and create a narrowly scoped task spec per communication change.
Keep changes reviewable. No generic privileged bridge; no changing the local HTML
viewer into an unrestricted browser; no dropping existing integrations/settings.

The B.1 final-review fixes are implemented: exact runtime deletion/vendor cleanup,
stable active sibling selection, current OAuth activation, scoped compatibility
JSON writes, protected deletion failure reporting, serialized mandatory secret
refresh and the missing-snapshot completion marker fix. Final combined B.1/C.1
source checks passed 2,959 unit tests (two skipped), all typechecks, lint (zero
errors, 12 existing warnings), build, communications and umbrella diff-aware
harness checks. Eight fresh-build provider journeys passed, including copied
synthetic legacy migration and same-user Windows protected restart. B.1 remains
open for exact packaged/real-profile/live acceptance and documented upstream
plaintext limits. The separate C.1 source checkpoint is being verified next;
continue its narrow harness/evidence rather than redoing B.1 discovery.

## Operating rules for continuity and cost

- Main owns authority. Renderer uses typed host API; shared contracts stay
  platform-neutral. Preserve stable task identity, resource leases and recovery.
- Orb remains quiet bottom-right; hover/wake do not steal focus. Ordinary replies
  stay compact. Full expansion is explicit. No everyday Ask/Auto/Act dashboard.
- Use deterministic local commands first; test most behavior without paid calls.
  Do not buy services, publish content or spend from an unknown account merely to
  make a test green. Record bounded live evaluations honestly.
- Keep Basic/BYOK functional. Managed service, natural voice and actual paid-path
  coverage remain required work, not placeholders that count as finished.
- Each checkpoint updates status/evidence/next exact action BEFORE a large build
  or interruption. Commit/push reviewed project checkpoints to the same authorized
  branch; preserve unrelated changes. No force push or release publication.
- UI changes require fresh-build Electron tests, four locales, accessible/reduced
  motion behavior and native screenshots/recordings. Full final candidate suite
  and real Windows/hardware/live tests remain mandatory.
- If a credential or external setup is missing, finish the independent code/tests,
  record that gate as blocked and ask once when relevant. Don't ask answered
  design questions or pretend a fixture proves a real provider/device.
- Stop to hand back only for a genuine missing input, interruption, or achieved
  requested checkpoint; otherwise continue authorized ordered implementation.

User-ready resume prompt:

> Continue Morpheus Phase 7 on Sol from SOL_START_HERE.md on
> codex/morpheus-phase6-managed-layer. Verify the checkout and preserve all work.
> Read the current checkpoint, then finish 7B.1 integration and verification in
> the documented small checkpoints. Keep the approved bottom-right Siri-style Morpheus companion,
> not a dashboard. NerdGPT later. Update tests, evidence and handoff as you go;
> distinguish source implementation from packaged/live acceptance.

Windows `.exe` delivery is still owed. `pnpm run package:win` creates an
unsigned local NSIS installer with `--publish never`; it has **not** been run
for this checkpoint. C: had only about 2.1 GiB free on 2026-10-01; D:/E: had
space. Build on a spacious isolated checkout when the package candidate is
ready, then provide the exact installer path and verify that fresh binary.
