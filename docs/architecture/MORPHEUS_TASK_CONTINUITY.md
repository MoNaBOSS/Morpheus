# Morpheus Phase 3 — Task continuity

Experience-reset implementation, 2026-09-22. This supersedes the earlier
single-active-objective rule and fresh-profile Autonomous default. It does not
replace the Main execution boundary or remove any OpenClaw features.

## Scheduling and surfaces

- Objective Core admits up to 32 tasks. Up to four provider-planned objectives
  can own planning slots; direct commands and prepared workflows bypass that
  queue. Native resource coordination separately permits up to four disjoint
  plans/actions. These are limits, not a promise of four desktop controllers.
- Main derives an atomic lease set from registered capabilities and canonical
  roots. App/browser launch and screen capture share the desktop; overlapping
  parent/child workspaces conflict; clipboard and reminder resources have their
  own lanes. A workspace lease spans the plan, conservatively including reads,
  so another internal task cannot interleave a dependent write sequence.
- Manual queued work takes priority over background work. Waiting background
  requests age into priority after 30 seconds. No mid-effect preemption.
- Native cancellation is cooperative: queued steps stop, but an already-running
  non-interruptible effect may finish. Its lease remains held until it settles.
  Cancellation is not rollback and does not close an app already launched.
- Full/compact command input stays available during work. The task selector
  chooses the task shown/stopped; background events do not replace that choice.
  Consent requests retain separate plan identities and display sequentially.
  Snapshots preserve newer events received during their round trip.
- `Stop talking` stops speech, not tasks. `Cancel research` matches one active
  task by its objective words. Ambiguity asks the user to select rather than
  cancelling everything. A new voice wake can occur while earlier work continues.

## Restart contract

Main stores `morpheus/task-checkpoints.json` alongside objective history in the
existing application profile. It is local task data, not an audit log: plans can
contain the content needed for unfinished file actions. It is not encrypted by
this phase and must not be uploaded as diagnostics.

Admission persists the task/workspace binding; prepared workflow plans are saved
before starting. Each step persists intent before invoking the capability and
persists its conclusive result before the next step. File artifacts are checked
against their recorded size/digest and canonical workspace on recovery.

After the renderer loads, recovery validates stored plans, current capability and
Agent Profile boundaries, workspace access and permissions. Schedulers start
after reconciliation. Paused profiles resume recovery only when unpaused. Saved
one-time approvals do not become standing authority after restart.

- Completed effects are retained, not replayed. Started side-effect fingerprints
  also prevent a replan from blindly repeating an earlier effect.
- An interrupted known read may run again. An interrupted launch, write,
  notification or other effect with no conclusive checkpoint needs review.
- A changed/missing completed file, changed workspace or exhausted recovery
  limit stops that task. No claim of exactly-once external delivery: uncertainty
  is surfaced instead of risking a duplicate.
- An interrupted scheduled occurrence links to its existing objective rather
  than creating a second execution.
- Checkpoint/audit failure stops new effects. Terminal history is committed
  before checkpoint cleanup; a leftover checkpoint cannot revive terminal work.

Recovery is limited to three attempts. Existing objective bounds remain three
iterations, twelve steps per plan, twenty-four total steps, fifteen minutes per
attempt, sixty seconds per provider request and at most two transient attempts.
These bound work; they are **not a global currency budget** across OpenClaw, STT
and TTS. Unified cost accounting belongs to Phase 5.

## Useful permissions and registered routines

Fresh profiles and first setup use Balanced. Existing explicit profiles/grants
are preserved. A Main-matched direct request to open a registered app or website
does not prompt again in Balanced. Strict, a saved denial, elevated risk, audit
failure and critical confirmation remain authoritative. Provider-proposed or
scheduled launches do not inherit the direct-request exception.

“Always do this without asking” answers the single pending eligible plan's
displayed scopes. Multiple pending plans or a critical boundary require a
specific choice. Grants retain capability/group, canonical resource, platform,
risk, origin and optional agent identity. Workspace-group membership is still
the existing finite registry, not all filesystem actions. Web grants bind to the
validated URL origin. Revocation stays in Permission Center.

Named navigation includes YouTube, Instagram, Pornhub, GitHub, Gmail and Google;
plain domain requests and explicit HTTP(S) URLs also work without a model call.
Spotify is registered at `%APPDATA%/Spotify/Spotify.exe`, verified as a regular
file inside its registered directory with no user-supplied arguments. Microsoft
Store-only Spotify installs and arbitrary unregistered apps are **not** silently
claimed supported. Missing installs produce an honest resolution error.

## Validation boundary

`tests/unit/morpheus-recovery.test.ts` exercises the real stores, orchestrator,
policy and executor with controlled native effects. The Phase 3 Electron spec
uses temporary profiles, real host routes and local file actions, plus a held
loopback planner fixture for concurrent-task timing. That fixture is not evidence
of real web research quality. OpenClaw research/chat remains separate and intact;
Objective Core still executes only its registered capabilities.

Real microphone, wake-word accuracy, voice quality, normal-profile behaviour and
installed-app launch require PC acceptance. Phase 4 owns the complete companion
persona/onboarding/adaptive workspace; this phase does not claim those finished.
