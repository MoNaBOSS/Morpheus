# Morpheus Operator Private Alpha Architecture

This architecture evolves the implemented Objective Core and Signal OS. It
does not replace the typed host-invoke boundary, plan executor, exact grants,
capability registry, Audit, OpenClaw Gateway, or Chat.

## Unified submission

All actionable inputs compile to `SubmitMorpheusObjectivePayload`:

```text
Presence / Command / Voice / Quick Command / Chat Act / Schedule
  -> interaction-mode router
  -> ObjectiveOrchestrator
  -> ContextSelector
  -> PlannerSelector
  -> validated ExecutionPlan
  -> PlanExecutor
  -> observation and bounded review
  -> Mission, artifacts, memory candidates, Activity, and Audit
```

`Ask` remains an OpenClaw conversation. `Act` always enters Objective Core.
`Auto` uses a bounded intent decision and fails toward conversation or one
focused clarification rather than fabricating an executable plan.

## Operator session state

An operator session projects one Main-owned objective through Presence,
Command, and Mission. Renderer stores may remember presentation preferences,
but Main owns objective state, route, plan, trust, execution, result, and
durable memory mutations.

Execution remains sequential. A continuation plan is independently validated
and compared to existing trust; no concurrency or resource locking is added in
this campaign.

## Automatic memory

The Objective Orchestrator may propose memory candidates only after a truthful
terminal result. A deterministic extractor handles explicit statements such as
`remember that...` and stable setup preferences. A provider may later propose
typed candidates, but Main validates source, kind, scope, sensitivity, length,
and provider-use policy before atomic persistence.

No capability execution result content is automatically memorized. File
contents, credentials, audio, transcripts, and raw provider exchanges are
excluded.

## Hero website builder

The business-site journey uses existing capabilities where they are sound and
adds narrow capabilities only for gaps:

- workspace folders and exclusive text-file creation for source artifacts;
- a typed website-project manifest for validation and preview;
- a Main-owned local preview lifecycle with no arbitrary command or shell;
- an optional typed staging adapter whose credentials remain in secure provider
  storage and whose destination is compiled/configured, not renderer-authored;
- Morpheus reminders/schedules created through a validated Main service;
- provider planning that may propose content but cannot execute, choose paths,
  or create authority.

The initial package can complete the local website, preview, analytics-ready
files, content plan, and follow-up artifacts without hosting credentials. It
reports staging deployment as unavailable until a supported destination is
configured; it never fakes a public URL.

## Autonomy profile

Fresh private-alpha profiles default to Autonomous after the setup explanation.
Autonomous may proceed with explicitly enumerated reversible capabilities in a
Main-registered workspace or compiled-in target while displaying and auditing
the reason. Critical categories remain unwaivable. Persistent denials and Audit
degradation still outrank profile defaults.

The registry, not model output, declares whether a capability is eligible for
autonomous first use. Unknown, broad, credential-bearing, destructive,
financial, privilege, security, or arbitrary-command capabilities are never
eligible.

## Host portability

Shared contracts remain under `shared/morpheus/**`. Windows implementation
lives under `electron/services/morpheus/capabilities/win32/**`. Future macOS,
Linux, bootable, web, and mobile hosts implement adapters around the same
objective, plan, memory, artifact, and provider contracts.

