# Morpheus Next-Session Handoff

## Purpose

This is the concise, authoritative transfer document for continuing Morpheus in
a fresh ChatGPT/Codex account. Repository evidence outranks prior conversation
claims. Read `AGENTS.md`, `CLAUDE.md`, and the canonical documents linked below
before changing code.

## Product truth

Morpheus is intended to be a persistent, voice-first autonomous AI operator and
AI system builder. It is not primarily a chatbot and it is not merely a Windows
automation utility.

The normal experience is:

```text
user objective from voice, Quick Command, Command Center, Chat or schedule
  -> understand intent and context
  -> select an Agent Profile or workflow when useful
  -> create a typed plan
  -> evaluate the whole plan against exact trust
  -> ask once only for a genuinely new or consequential boundary
  -> execute deterministically and observe progress
  -> replan within bounded authority when needed
  -> return spoken/visual results and artifacts
  -> preserve inspectable Mission, Activity and audit history
```

Chat is a secondary thinking interface. OpenClaw remains the embedded chat and
agent runtime, but Morpheus owns visible identity, planning, trust, execution,
artifacts, Missions, workflows, schedules and product experience.

## Desired experience

The product should feel like a calm, premium, futuristic intelligence—not a
chat application decorated with automation pages.

1. **First launch:** a cinematic full-window Morpheus activation introduces the
   assistant, truthfully checks runtime/provider/microphone readiness, guides
   setup, and transitions naturally into the Command Center.
2. **Living presence:** a distinctive visual intelligence core communicates
   asleep, armed, listening, understanding, planning, awaiting trust, working,
   speaking, complete and degraded states.
3. **Voice first:** push-to-talk is immediately discoverable. Optional ambient
   wake phrase is explicit and visible. Speech is natural, interruptible, and
   uses the same Objective Core as every other input.
4. **Autonomous execution:** one instruction becomes a complete plan. Permission
   is evaluated at plan level and interruption occurs only for ambiguity,
   materially broader trust, sensitive disclosure, financial/credential/
   privilege boundaries, destructive or irreversible effects.
5. **Background companion:** Morpheus can live in the tray and be summoned by a
   global shortcut into a compact voice/text surface without opening Chat.
6. **Command Center:** the home surface shows intent, current plan, live work,
   results, artifacts, trust reason and relevant context—not raw tool chatter or
   a generic card dashboard.
7. **Personality:** concise, capable, adaptive and occasionally humorous. It
   does not always say "sir," manufacture progress, or narrate hidden reasoning.

Matrix influence is restrained: near-black layered surfaces, precise typography,
green only for live or verified state, subtle signal fields, premium motion and
strong reduced-motion support. Avoid neon-green overload and cheap terminal
styling.

## Verified implementation foundation

At local HEAD `2e23a076d17f954d32642ed20bb3e021d4dfb971` on branch
`codex/morpheus-production-companion`, the repository contains substantial
reusable infrastructure:

- Electron/React/Vite desktop shell with OpenClaw Gateway and Chat integration;
- typed Renderer -> Main host-invoke boundary;
- Main-owned Objective Core, sequential typed ExecutionPlans and runtime events;
- exact-scope, plan-level permission/trust evaluation and append-only audit;
- 19 controlled Windows capabilities without arbitrary shell/PowerShell;
- provider-neutral planning boundary plus deterministic direct routing;
- Command Center, Quick Command, Missions, Projects/context, Goals, Agent
  Profiles, workflows, schedules, Systems, Activity and artifacts;
- push-to-talk and opt-in provider-backed ambient voice infrastructure;
- Morpheus identity, NSIS packaging, tests and packaged smoke coverage.

Canonical implementation references:

- `docs/product/MORPHEUS_VISION.md`
- `docs/product/MORPHEUS_COMPANION_VISION.md`
- `docs/product/MORPHEUS_PRODUCTION_COMPANION.md`
- `docs/architecture/MORPHEUS_WINDOWS_1.0_ARCHITECTURE.md`
- `docs/architecture/MORPHEUS_PRODUCTION_COMPANION_ARCHITECTURE.md`
- `docs/security/PERMISSION_MODEL.md`
- `docs/design/MORPHEUS_DESIGN_SYSTEM.md`
- `docs/releases/WINDOWS-1.0-PRODUCTION-COMPANION-ACCEPTANCE.md`

## Critical UAT finding

The installed application did not convincingly deliver the desired experience.
The user encountered an interface that still felt primarily like inherited
OpenClaw Chat. The existence of voice, Quick Command, plans and companion
contracts did not translate into a coherent Jarvis-style first impression.

Therefore:

- Do not describe the current package as the finished product.
- Do not equate contracts, routes, tests or backend services with experiential
  completion.
- Do not hide the gap behind capability counts or passing test totals.
- Do not replace sound Main-owned execution/security architecture merely to
  restyle the UI.
- Validate every major experience claim in a normal packaged launch from a
  fresh synthetic profile.

## What must be designed before further implementation

Produce three concrete UI/UX directions, each showing the same key states at
1280x800:

1. **Living Intelligence** — a central animated Morpheus core and cinematic,
   state-led interaction.
2. **Command OS** — an execution cockpit organizing plan, activity, artifacts,
   context and trust around the core.
3. **Invisible Companion** — tray-first global voice/Quick Command overlay with
   the full Command Center available for deeper work.

The recommended synthesis is Living Intelligence for emotional identity,
Command OS for serious work, and Invisible Companion for everyday invocation.
Present descriptions/wireframes to the user before broad UI implementation.

## First vertical-slice acceptance gate

Before calling the redesigned experience successful, a fresh packaged install
must demonstrate this complete journey:

1. Full-window cinematic activation with prominent Morpheus identity.
2. Truthful provider and microphone setup with clear privacy explanation.
3. Obvious push-to-talk interaction without navigating to Chat.
4. User speaks a real supported objective.
5. Morpheus visibly moves through listening -> understanding -> plan -> trust
   if genuinely required -> execution -> spoken/visual result.
6. The result and any artifact are real and auditable.
7. The window can close to tray; global invocation restores the compact
   companion surface.
8. Chat remains available but is visibly secondary.
9. No normal surface exposes ClawX branding or raw implementation-oriented tool
   chatter as the primary experience.
10. The user can understand what Morpheus is and how to use it within one minute.

Do not expand the capability set until this vertical slice feels coherent.

## Current technical and release state

- Branch: `codex/morpheus-production-companion`
- HEAD before this transfer documentation: `2e23a076d17f954d32642ed20bb3e021d4dfb971`
- Origin: `https://github.com/MoNaBOSS/Morpheus.git`
- The branch is currently local and was not shown with an upstream tracking
  branch. Verify and push it before attempting work from another machine.
- Installer: `C:\Morpheus\morpheus-core\release\Morpheus-1.0.0-win-x64.exe`
- Size: 263,669,614 bytes
- SHA-256: `2D2F2388D051BC2907FB15067815373C9EB6415C290591C5EE61B48A33815E98`
- Authenticode: NotSigned
- Generated release files and screenshots are ignored and must not be committed.

Recorded validation from the prior checkpoint:

- 611/611 Morpheus unit tests passed.
- Focused companion, permission, Command Center and voice E2E passed.
- Full inherited unit suite retained 16 Windows path/mock failures in untouched
  OpenClaw tests.
- Full E2E retained two reproducible inherited Chat regressions.
- NSIS packaging and a normal-production packaged smoke completed.

These are historical results; rerun relevant tests after changes.

## Provider and credential truth

- Provider-backed broad planning and transcription need compatible credentials.
- The present voice implementation uses an OpenAI-compatible audio transcription
  endpoint; not every chat reseller supports that endpoint.
- Never paste API keys into prompts, commits, screenshots or documentation.
- Keys previously pasted into a conversation must be revoked and replaced.
- For private testing, use a project-scoped key entered locally in Morpheus.
- A public release must not embed a company master key in Electron. Use a secure
  managed backend with identity, quotas, metering and abuse protection, while
  retaining optional BYOK.

## Constraints that remain non-negotiable

- Main owns action policy, trust, execution authority, filesystem roots and
  audit ordering.
- Renderer sends logical capability ids and validated parameters only.
- No arbitrary executable paths, command arguments, environment variables,
  unrestricted paths, shell or PowerShell authority.
- Provider output is untrusted planning input, never direct OS authority.
- Evaluate trust for the complete plan; batch genuinely new boundaries once.
- Existing exact workspace/session/persistent grants prevent repeated prompts.
- Critical financial, credential, privilege, destructive/irreversible and
  security-changing boundaries retain explicit protection.
- OpenClaw Chat and Gateway must keep working but must not define visible product
  identity.
- One shared architecture must remain extensible to macOS, Linux, web and mobile.
- Do not create demo-only, Larry-specific, fake-event or edition-fork paths.

## Recommended new-session process

1. Verify Git status, branch, HEAD and remote before editing.
2. Read the canonical documents and inspect the actual relevant source.
3. Run the current packaged build or inspect current verification media.
4. Reconcile documentation claims with observed behavior.
5. Present three concrete UX directions and recommend one synthesis.
6. After user selection, implement the first vertical slice end-to-end.
7. Run unit/E2E, package, then test from a fresh profile as a first-time user.
8. Report experiential truth separately from infrastructure/test truth.

## Required software and setup

```powershell
git clone https://github.com/MoNaBOSS/Morpheus.git morpheus-core
Set-Location morpheus-core
git checkout codex/morpheus-production-companion
corepack enable
corepack prepare pnpm@10.33.4 --activate
pnpm run init
pnpm dev
```

Windows 10/11, Node.js 24.x, Corepack and pnpm 10.33.4 are expected. Windows
Developer Mode may be needed for electron-builder symlink extraction.

## Definition of honest completion

Morpheus is not complete merely because its pieces exist. Completion requires
the packaged application to make the intended interaction obvious, coherent,
fast and impressive to a first-time user. Every future report must separate:

1. implemented architecture;
2. automated verification;
3. packaged runtime verification;
4. human UX acceptance;
5. known limitations and future product scope.
