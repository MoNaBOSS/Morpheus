# Morpheus Core Orchestration

Durable reference for the Windows 1.0 objective loop. Native capability safety
remains defined by `morpheus-execution-architecture.md` and
`morpheus-native-action-safety.md`.

## One ingress contract

Command Center, Quick Command, Voice, explicit Chat execution, workflows and
schedules submit an objective or a registered definition id to Electron Main.
Main creates the objective id, timestamps, origin, workspace/profile binding and
all subsequent plan ids.

Workspace selection is a logical id only. Main owns the registry, obtains new
roots from the native directory picker, canonicalizes them, and stamps the
selected id onto every plan. A provider or Renderer cannot propose a root.
Read-only workspace policy is enforced again in the runtime so direct actions,
workflows and schedules cannot bypass the objective planner's capability filter.

## One orchestration owner

The Main-owned Objective Orchestrator coordinates interfaces for context,
planning, plan registration/execution, observation, memory, artifacts, Activity
and Audit. It does not absorb their implementations. This keeps each service
replaceable and preserves the 0.5 executor and policy tests.

## Provider boundary

A provider receives bounded context plus dynamically generated capability
schemas. Its response is proposal JSON. The provider has no references to the
capability registry implementation, runtime, permission store or native adapters.
Main validates the proposal and authors the final `ExecutionPlan`.

## Continuation

After execution, a reduced observation is reviewed. The response is one of:

- complete with a safe user-facing summary;
- needs clarification with a concrete question;
- continuation proposal with a stated reason.

Continuation is a new plan inside the same objective run. It does not inherit
blanket authority from the objective. Exact grants continue to match; changed
scopes pass through a new, deduplicated trust-delta evaluation.

## Truthful fallback

When no supported provider is configured, Morpheus reports deterministic mode.
The deterministic planner executes only objectives it genuinely understands and
does not fabricate reasoning, transcription, observation or replanning.
