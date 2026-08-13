# Morpheus Companion and Missions Architecture

## Decision

The companion experience extends the existing Main-owned Objective Core. It
does not introduce another planner, executor, permission path, or assistant
runtime.

```text
Command Center / compact companion / voice / Chat Execute
                         |
                         v
                    Objective Core
          +--------------+---------------+
          |                              |
  deterministic direct route       provider planner
          |                              |
          +--------- typed plan ---------+
                         |
             plan-level trust delta
                         |
             sequential capability runtime
                         |
            observation + bounded replan
                         |
       Mission projection / artifacts / audit
```

## Companion surface

The compact companion is a controlled presentation mode of the existing main
window, not a second privileged renderer. A Main-owned window-mode controller
captures and restores the previous bounds and visibility. Global Quick Command
and voice shortcuts may enter compact always-on-top mode; dismissing restores or
hides the window based on its prior state. Renderer calls only typed logical
operations such as `dismissCompanionSurface` and `expandCompanionSurface`.

This preserves the single active-renderer host-invoke guard and prevents a second
window from duplicating permission dialogs or competing for runtime events.

## Mission model

A Mission is the durable product projection of one or more Objective Core runs.
It is not an execution engine.

- Objective Core creates the Mission identity when work is accepted.
- Every audited objective transition updates the corresponding Mission before
  the Renderer observes it.
- A Mission stores objective, origin, project/workspace/agent references,
  objective-run lineage, latest plan, status, artifacts, summary, and error
  metadata.
- Restart reconciliation maps interrupted objective runs to a truthful failed
  Mission state. It never pretends native work is still running.
- Re-running a Mission creates a new objective run under the same Mission and
  re-enters the full planner, trust, executor, and audit pipeline.

Mission persistence is atomic, bounded, validated, and Main-owned.

## Projects and memory

A Project is an organizational context linked to an existing Main-owned
workspace id. It never establishes a filesystem root.

Durable memory records are Main-owned and include:

- kind: preference, project context, routine, or decision;
- exact optional project scope;
- sensitivity: normal or sensitive;
- provider-use policy: allowed or local-only;
- source and timestamps;
- enabled/revoked state.

Context selection remains bounded. It may include the active Project's concise
instructions and enabled normal memories whose provider-use policy is `allowed`.
Sensitive or local-only memory, audit data, credentials, raw files, audio, and
unbounded transcripts never enter provider prompts.

## Capability-first routing

Before selecting a remote planner, Main runs the deterministic interpreter over
the exact registered capabilities available to the selected Agent Profile and
workspace. A supported direct intent executes without a provider round-trip.
Only an unsupported/open-ended objective proceeds to provider selection.

The selected route is recorded on the Objective and Mission:

- `direct-capability`
- `provider-plan`
- `deterministic-fallback`
- `prepared-workflow`

Provider failure may use the existing truthful deterministic fallback only for
an `auto` Agent Profile. It is never presented as AI planning.

## Trust and sequential execution

The complete plan is resolved before consent. Existing exact grants are reused;
only the trust delta is shown, once. Mission, Project, voice, and companion
surfaces cannot create grants. Execution remains sequential for this campaign.

## Future compatibility

The Mission, Project, Memory, and route contracts are platform-neutral. Windows
owns window presentation and native capability adapters. Later macOS, Linux,
web, and mobile hosts can project the same Mission state without inheriting
Windows window-management code.
