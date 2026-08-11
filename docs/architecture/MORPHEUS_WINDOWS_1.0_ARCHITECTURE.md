# Morpheus Windows 1.0 Foundation — Architecture

This document evolves the implemented 0.5 architecture. It does not replace the
security guarantees in `MORPHEUS_ARCHITECTURE.md` or
`docs/security/PERMISSION_MODEL.md`.

## Repository-grounded decision

Windows 1.0 will **not** mechanically split the repository into many packages.
The existing dependency boundary is already useful:

- `shared/morpheus/**`: platform-neutral contracts and pure validation;
- `electron/services/morpheus/**`: Main-owned authority and persistence;
- `electron/services/morpheus/capabilities/<platform>/**`: native adapters;
- `src/**`: untrusted projections and interaction surfaces.

The core will be made explicit inside these roots. Package extraction becomes
worthwhile when a second host consumes it; doing it before then would create
build churn without proving reuse.

## Central objective pipeline

```text
surface input
  -> ObjectiveOrchestrator (Main)
  -> ContextSelector (Main, bounded)
  -> IntentRouter
  -> MorpheusPlanner adapter
  -> untrusted proposal validation
  -> Main-authored ExecutionPlan
  -> complete-plan trust delta
  -> sequential PlanExecutor
  -> structured observations
  -> ObjectiveEvaluator / Replanner
  -> completion or bounded continuation
  -> artifacts + Activity + Audit + optional speech
```

Every surface calls one typed `submitObjective` host action. The Renderer never
submits a plan, provider credential, executable path, command line, environment,
or unrestricted filesystem path.

## Objective state machine

The durable, truthful states are:

```text
READY -> LISTENING -> UNDERSTANDING -> PLANNING
  -> WAITING_FOR_APPROVAL -> EXECUTING -> OBSERVING
  -> REPLANNING -> COMPLETE
                         \-> SPEAKING -> COMPLETE
Any active state -> CANCELLED | DEGRADED | ERROR
```

Only states backed by Main runtime events may be rendered. Voice capture owns
`LISTENING`; provider work owns `UNDERSTANDING`/`PLANNING`; the plan executor
owns `WAITING_FOR_APPROVAL`/`EXECUTING`; structured review owns
`OBSERVING`/`REPLANNING`.

An `ObjectiveRun` contains the immutable original objective, origin, selected
workspace and Agent Profile, bounded planning iterations, plan ids, structured
observations, produced artifact ids, timestamps, terminal outcome and a safe
summary. Raw provider prompts, credentials, audio and file contents are not
durable objective history.

## Planner contract

The 0.5 `MorpheusPlanner` boundary evolves without moving authority:

- `plan(request)` proposes a validated plan or a truthful clarification;
- `review(request)` evaluates structured step results and returns complete,
  clarify, or a continuation proposal;
- `plannerId` identifies the adapter actually used;
- capability schemas and availability are supplied dynamically by Main;
- context is selected and bounded by Main;
- output is parsed from strict JSON and rejected on unknown capabilities,
  invalid parameters, invalid dependencies, excessive size or invalid scope.

The deterministic planner remains a real offline fallback and a test oracle. It
must never masquerade as AI. Provider adapters run in Main, retrieve credentials
through the existing secure provider service, and support only explicitly
implemented protocols.

## Observation and replanning

Execution remains sequential in Windows 1.0 Foundation.

After each plan, the orchestrator records a reduced structured observation:
step status, typed result metadata, error code, duration and artifact references.
It does not give a provider arbitrary filesystem access or raw audit files.

Replanning is bounded by:

- maximum planning iterations;
- maximum total steps and runtime;
- per-provider timeout;
- cancellation checked between steps and planning calls;
- repeated-plan/cycle detection;
- one active objective per interactive surface by default;
- no continuation after a critical denial or explicit user stop.

A continuation plan is independently validated. Existing exact grants are
reused; only new trust boundaries introduced by the continuation may interrupt.

## Context, memory and workspaces

Context is split into deliberately bounded layers:

1. active objective context;
2. current session continuation context;
3. selected workspace/project context;
4. explicit user preferences;
5. durable memories safe for provider use;
6. Agent Profile-specific policy.

Morpheus never dumps an unlimited chat transcript into a planner. The
`ContextSelector` enforces item and character budgets, source labels, timestamps
and sensitivity classification.

A workspace is a Main-owned record with an id, display name, canonical root,
associated Agent Profiles/workflows, trust scopes, recent objective summaries
and artifact references. A root enters the system only through a Main-owned
native folder picker or a compiled-in Morpheus root. The original path is
canonicalized and stored atomically; Renderer text cannot create a workspace.

## Agent Profiles, workflows and schedules

These remain configuration over the one core, never separate engines.

- Agent Profiles select instructions, planner/provider preference, capabilities,
  workspace/memory policy and execution limits. They can narrow authority only.
- Workflows are validated and compiled in Main to the same `ExecutionPlan`, then
  submitted through the Objective Orchestrator. Renderer never submits a plan.
- Schedules resolve their logical workspace, compile the referenced workflow in
  Main, and submit it to the same Objective Orchestrator with a distinct schedule
  origin. Scheduled runs wait for the active objective to finish so Windows 1.0
  retains the single sequential execution lane.
- Objective history, permission evaluation, runtime observation, artifacts and
  audit ordering are therefore identical for commands, workflows and schedules.

All user-authored definitions are exhaustively validated in Main, receive
Main-authored ids and timestamps, and are written atomically. Store failures roll
back in-memory state. Definitions may narrow capability/workspace authority but
cannot create grants or bypass policy.

## Voice

Voice is one input/output adapter around the objective pipeline:

```text
microphone -> bounded recording -> Main transcription adapter
  -> transcript preview/correction -> submitObjective
final safe summary -> Renderer speech adapter -> system voice
```

- The Renderer may capture audio because it owns the microphone interaction,
  but Main validates format, size and duration before using a provider.
- Provider credentials never enter the Renderer.
- Audio is ephemeral by default and never written to Audit.
- The transcript is shown before or while submitted and remains cancellable.
- Text-to-speech speaks only an explicit final/user-facing summary, never hidden
  reasoning, secrets or raw file contents.
- Push-to-talk and a global voice shortcut ship first. Always-on wake-word
  support remains prepared but is not claimed until a reliable local detector
  and privacy model exist.

## OpenClaw and Chat

Ordinary `/chat` messages continue through ACP unchanged. Chat gains an explicit
Morpheus execution affordance that submits an objective to the same core. This
preserves conversation behavior while proving Chat is a core entry surface.

OpenClaw is accessed through an adapter where planning or memory reuse is
appropriate. The plan executor remains independent of Gateway/ACP modules.

## Windows host

Current capabilities are retained. Additions are selected for real workflows,
not count:

- typed reveal/open operations for approved workspace artifacts;
- bounded developer task templates for exact trusted workspaces;
- reliable application/window operations only where Windows behavior can be
  proven without arbitrary shell input.

No renderer-controlled executable, argv, shell, PowerShell, environment or broad
path surface is introduced.

## User interface

The Command Center becomes a stateful instrument, not an admin dashboard. Its
first viewport prioritizes Morpheus state/voice, current objective, current plan,
live execution, active Agent Profile, artifacts and trust. Builder counts and raw
audit data are secondary navigation.

The permanent design system is extended before page-specific styling. Visual
concepts and rendered screenshots are compared throughout implementation at
1280x800 and the current desktop resolution.

## Dependency rules

- `shared/morpheus/core/**` imports only shared Morpheus contracts.
- the objective orchestrator may depend on planner, context, policy, executor,
  artifacts and audit interfaces;
- the plan executor must not depend on providers, voice, UI, Gateway or ACP;
- provider and OpenClaw adapters may propose/review but never call capabilities;
- voice adapters may submit objectives but never execute plans directly;
- Renderer stores may project state but never author trusted runtime records.
