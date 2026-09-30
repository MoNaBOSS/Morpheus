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

7A.1 Main session, 7A.2 editable native upward composer, 7A.3 compact
conversation continuity and 7A.4 shared orb motion/ephemeral visual audio level
pass focused Windows Electron source automation. They are not installer/hardware/
live-provider acceptance. **7B.1 is in progress in the linked worktree, not accepted.**
The app-owned static-key store and legacy adapter now write an OS-protected,
versioned file, verify before legacy cleanup and fail closed when protection is
unavailable. Focused synthetic store/adapter/provider-service tests passed 33/33.
The current source path also uses pinned OpenClaw env SecretRefs for new
app-owned static and image-relay keys, rather than writing those keys into
auth/config files. Synthetic runtime tests, typecheck, lint, communications
replay/compare, narrow harness validation, the full unit suite (2,925 passed,
two skipped), seven fresh-build isolated provider-lifecycle Electron journeys,
and a synthetic Windows same-user protected-store restart have passed. No real
provider key or owner profile was used. Exact-match pre-commit and pre-spawn
reconciliation now make app-owned static-key and protected image-relay
rotation/relaunch recoverable in source tests without overwriting imported
mismatches. A legacy image key can be adopted only by explicitly re-entering
that same key; conflicting keys are preserved and rejected before a vault
write. **7B.1 remains open**: pre-existing image-relay keys without matching
app provenance are preserved,
upstream OAuth and transient upgrade snapshots have separate plaintext limits,
and a copied existing-profile upgrade plus packaged/live verification are not
yet complete. Next finish the narrow
[7B.1 task checks](harness/specs/tasks/morpheus-phase7-b1-provider-secret-migration.md)
and a safe existing-profile upgrade rehearsal before paid live-path testing.
Do not destroy real keys or claim upstream OAuth
plaintext elimination without a supported path. Preserve the same
assistant/conversation/task owner; no second engine or dashboard.

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
