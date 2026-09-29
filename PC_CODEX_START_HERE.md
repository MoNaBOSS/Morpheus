# PC Codex: continue Morpheus from the Mac checkpoint

Handoff date: 2026-09-29. This is the first document to read for the current
cross-device continuation. The conversation itself is not automatically
available on another machine; this file and its linked records carry the working
context, decisions, evidence and unfinished work. Do not restart product discovery.

## 1. Identify the correct source before changing anything

- Repository: `https://github.com/MoNaBOSS/Morpheus.git`.
- Active application branch: `codex/morpheus-phase6-managed-layer`.
- Latest implementation checkpoint at handoff: `e467f3917a4c78a9c5cd30e928349998d337c3ea`.
  Use the latest fetched branch tip, which also includes this handoff.
- Historical PC checkout: `C:\Morpheus\morpheus-core`. Verify the actual folder,
  remote and local changes; this path is a clue, not permission to overwrite it.
- Mac application source: `/Users/mona/Documents/Work/Morpheus`. Mac paths are
  provenance only; do not use them as Windows runtime paths.
- The older Windows 1.1.2 installer and older default/Phase 4 branches do not
  represent this checkpoint. Do not start by testing an old installer.

First inspect `git status --short --branch`, `git remote -v`, and `git log -5
--oneline`. After verifying origin, fetch it. Read this handoff without changing
the current checkout if necessary:

```powershell
git fetch origin
git show origin/codex/morpheus-phase6-managed-layer:PC_CODEX_START_HERE.md
git log -1 --oneline origin/codex/morpheus-phase6-managed-layer
```

Preserve all PC changes, profiles, provider settings and untracked files. Do not
use reset --hard, clean, force checkout, automatic stashing or profile deletion.
If PC work is dirty or divergent, create a new worktree in an unused directory:

```powershell
git worktree add -b codex/morpheus-pc-continuation ..\morpheus-pc-continuation origin/codex/morpheus-phase6-managed-layer
Set-Location ..\morpheus-pc-continuation
git merge-base --is-ancestor e467f3917a4c78a9c5cd30e928349998d337c3ea HEAD
```

Check whether that branch/directory already exists before creating it; reuse an
appropriate existing continuation rather than overwriting it. If there is no PC
checkout, clone the specified branch into a new user project directory. Preserve
existing work before reconciling it with the fetched branch.

## 2. Read these records, in this order

Read `AGENTS.md` and `CLAUDE.md` for repository rules, then:

1. [Latest priorities and capability review](docs/roadmap/MORPHEUS_PC_PRIORITY_2026-09-29.md).
2. [PC commands, account setup and acceptance record](docs/roadmap/MORPHEUS_PC_RETURN_2026-09-28.md).
3. [Full agreed experience/use-case plan](docs/roadmap/MORPHEUS_EXPERIENCE_IMPLEMENTATION_PLAN.md).
4. [Phase 6 readiness and actual implementation](docs/roadmap/MORPHEUS_PHASE6_READINESS.md).
5. [Design behavior and feedback guide](docs/design/MORPHEUS_EXPERIENCE_REVIEW.md)
   and [motion alternatives](docs/design/MORPHEUS_MOTION_STUDY.md).
6. [Task continuity architecture](docs/architecture/MORPHEUS_TASK_CONTINUITY.md)
   before changing execution or recovery;
   [Phase 5 evaluation](docs/roadmap/MORPHEUS_PHASE5_EVALUATION.md) before comparing costs.

The September 29 bottom-right direction overrides all older top-right/left-corner
placement descriptions. Dated implementation results override historical roadmap
claims. Recommendations are not user approvals or proof of implementation.
`PROJECT_HANDOFF.md` and older release documents contain useful history, but their
old “current candidate” headings must not supersede this handoff.

Historical Phase 0–3 report folders and two original layout/rain reference images
linked by the old experience plan are not present in this Mac checkout. The
plan retains their decision/status summaries, and the current orb/M artwork and
interactive design are committed. If the PC still has those original archives,
preserve them and reconcile them as historical evidence; do not require them to
start current work or fabricate their contents. The handoff preserves actionable
context, not a verbatim export of every chat message or missing historical asset.

## 3. Preserve the user's decisions

- Product: **Morpheus, your Windows companion**, with Siri-like ease, smooth
  animation, approved M/orb artwork, green identity and restrained Matrix rain.
- **Bottom-right by default**, above the taskbar. Small presence leaves important
  screen space clear. The text composer opens upward on hover without focus theft;
  click/tap focuses typing. Full workspace expansion is explicit. Preserve drafts.
- Initial opening introduces Morpheus, asks the preferred name, then offers useful
  work and optional personalization. Returning users should not repeat onboarding.
- Natural English voice, consistent personality, interruptible speech, follow-ups,
  typing, mute, quiet/DND and reduced motion. Stop speech and cancel task are distinct.
- Friendly witty companion, adjustable humor/proactivity, film/anime/One Piece
  references when appropriate. Keep useful local preferences and inspectable memory.
  The full experience plan records the exact onboarding, timing and personality
  decisions; do not replace these with another questionnaire.
- Basic/intermediate work first: browser opening and interaction, research,
  creating/revising/publishing websites, file work and independent background jobs.
  Business/investing tasks come later. Research/paper trading is the recommended
  initial investing scope; no broker connection or transaction is authorized here.
- Keep API operation inexpensive. Exact local commands should avoid model planning.
  Measure success and all paid paths before selecting economy/escalation routes.
- User authorized adding the managed layer and evaluation work; no maximum spending
  budget was specified. Payment selection is deferred. This is not an unlimited
  public trial policy. Do not invent subscription prices or a live allowance.
- Basic/BYOK remains usable. Managed AI/voice and entitlements share the same app
  and execution authority. NerdGPT is a future user-owned dependency, not ready.
- Hermes: user asked whether to use it. Current recommendation is an isolated
  same-model comparison for browser/coding work before adoption. Hermes has not
  been installed, adopted, or authorized to migrate profiles/API keys.
- Work autonomously on already authorized implementation, fixes and validation.
  Ask concise questions only for genuinely missing inputs. Report evidence and
  remaining work honestly; do not call the full product finished from design clicks.

## 4. What is actually done

The branch preserves prior Windows work plus task coordination/recovery,
companion/onboarding work, Phase 5 usage evidence tooling and Phase 6 account/ledger
foundations. Main owns native execution, permissions, provider secrets and audit.
Renderer calls go through the existing typed host API. Keep one Objective/task
identity across surfaces and workers. Follow four-locale and Electron E2E rules.

Latest code fixes: `morpheus-presence-layout.ts` anchors the native orb bottom-right
and keeps geometry inside the display work area; `morpheus-companion-surface.ts`
uses the same anchor for wake, tray and shortcut. Full-window restoration remains.

Mac evidence: September 28 full unit suite 2,828 passed / 17 skipped. September 29
focused placement/controller 10 passed; harness 18 passed; Electron visual 3
passed / 2 Windows-only skipped. Node typecheck, scoped lint, build and harness
checks passed. Three native orb lifecycle unit cases are also Windows-only.
The September 29 change did not rerun the whole suite; no real Windows, live
provider, acoustic or hosted-login acceptance is implied.

## 5. Design site and source locations

- Live design: https://monaboss.github.io/Morpheus/ (public; GitHub Pages).
- Portable source in this application branch: `docs/design/morpheus-experience/`.
  Open `index.html` or serve that directory. No install/build needed.
- Published source branch: `gh-pages`, static files at its root, latest design
  checkpoint `f5cfc2ebad83af6119b069a4941f202888c19b5b`. **Do not check out gh-pages
  as the application source.** Use a separate worktree when updating publication.
- Mac design working folder: `/Users/mona/Documents/Work/morpheus-experience-preview`.
  This standalone folder is not needed on PC; the committed portable copy is current.
- The failed Sites registration is historical. Use GitHub for this site. No need
  to repair Sites or start another hosting project to continue application work.

The website's desktop, tasks, file moves, calendar and voice input are illustrative;
its browser speech synthesis is real when supported. Native hover, selected
animation integration and quiet returning/startup behavior are still unfinished.
Do not confuse the visually complete browser experience with a working Windows
operator. The user wants normal product wording, with design explanation kept
out of everyday screens.

## 6. Start work now, in this order

1. Establish the verified checkout/branch/commit and preserve PC work. Briefly
   confirm the inherited direction and concrete first step. Do not stop at a plan.
2. Install pinned dependencies, generate the extension bridge, and run the source
   checks from the PC runbook. Run the Windows-only placement/lifecycle/screenshot
   permission tests skipped on Mac. Record exact commit, Windows version and results.
3. Start the newly built application and inspect real bottom-right placement,
   taskbar/monitor/DPI behavior, wake focus, compact/full restoration and voice.
   Finish native hover, selected motion and quiet returning presence deliberately.
4. Complete browser → cited research → saved artifact and website → local view →
   revision → verification → authorized publishing as real end-to-end workflows.
   The current native website verifier allows restricted static sites only. Do
   not remove its script restrictions without implementing a scoped development
   worker and verification. Existing OpenClaw/browser facilities need explicit
   task ownership, cancellation, artifact and usage integration.
5. Test independent work, stop speech versus cancel task, restart and outages.
   Benchmark cost per successful task including failed attempts and tools.
6. Configure live identity and managed provider/voice/trial paths when required
   inputs are available; these are not currently enabled merely by account code.
7. Build and test a new Windows candidate, existing-profile upgrade, signing and
   update/rollback. Public application release remains a separate acceptance step.

Keep an evidence record and update these documents as work completes. End each
substantial checkpoint with what changed, what passed, what is still blocked,
and the next practical step. Do not repeat already answered product questions.
