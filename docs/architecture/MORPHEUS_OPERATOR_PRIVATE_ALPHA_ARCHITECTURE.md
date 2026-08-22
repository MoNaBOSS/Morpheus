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

The business-site journey reuses the sequential plan executor and adds three
narrow registered capabilities for the remaining gaps:

- `file.create` exclusively creates bounded non-executable text assets at a
  validated workspace-relative path. It never overwrites and cannot create a
  script or executable extension;
- `site.verify` resolves the future project path during whole-plan trust
  preparation, then re-resolves and inspects the real completed project only
  after its dependencies succeed. It rejects links, scripts, forms, embeds,
  remote resources, missing responsive metadata, and invalid analytics
  configuration before returning a typed website manifest;
- `reminder.schedule` creates one persisted Morpheus workflow containing one
  bounded notification and a real one-time or daily Morpheus schedule. It has
  no command, executable, URL, environment, shell, or path parameter.

Verified website outcomes become durable metadata-only artifacts. Command
Center preview sends the manifest's workspace root plus relative entry path to
the existing Main-owned local HTML preview policy; the Renderer cannot replace
it with an arbitrary file URL. Provider planning may propose file content and
steps, but cannot execute, choose an absolute root, or create authority.

The initial package can complete the local website, preview, analytics-ready
files, content plan, and follow-up reminder without hosting credentials. A
typed staging adapter is deliberately not implemented yet; public deployment
remains unavailable until a supported destination and credential boundary are
implemented, and Morpheus never fakes a public URL.

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
