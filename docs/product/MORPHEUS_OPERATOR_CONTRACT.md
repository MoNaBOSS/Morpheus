# Morpheus Operator Contract

Status: canonical product contract for the Windows private alpha.

This document freezes the product decisions approved on 2026-08-22. When an
older roadmap, release note, screenshot, or inherited ClawX interaction conflicts
with this contract, this contract governs the operator campaign.

## Product promise

Morpheus is a persistent personal AI operator. The user gives an outcome and
Morpheus handles the path:

```text
objective
  -> understand intent and bounded context
  -> choose an agent, workflow, or direct route
  -> produce a typed plan
  -> evaluate the complete trust delta
  -> execute deterministic capabilities sequentially
  -> observe results and replan when needed
  -> deliver artifacts and a concise outcome
  -> remember useful inspectable context
  -> continue scheduled or long-horizon work
```

Chat is a conversation surface. It is not the product, planner, permission
authority, or native execution engine.

## One core, three everyday experiences

1. **Morpheus Presence** lives in the Windows tray and opens through the global
   shortcut, push-to-talk, tray, or an explicitly enabled wake phrase.
2. **Command Center** directs and observes Missions, outcomes, context, trust,
   artifacts, and ongoing work.
3. **Chat** remains the OpenClaw thinking and conversation surface.

Every actionable objective from every surface enters the same Main-owned
Objective Core. No surface owns a private planner, memory, grant store, event
stream, or executor.

## Ask, Auto, and Act

- **Ask** keeps the interaction conversational and does not start native work.
- **Act** submits the message as an objective to Morpheus Core.
- **Auto** is the default. It distinguishes a request for information from a
  request for work and routes accordingly. The mode is an interaction hint, not
  a second engine.

When Ask receives an obviously actionable request, Chat may offer one contextual
`Let Morpheus handle it` action. It must not nag or market a second product.

The external promise may describe Morpheus as a next-generation Super AI
operator. Product controls use the calmer terms `Ask`, `Auto`, `Act`, and
`Morpheus Active`.

## Personality and relationship

- Setup asks what Morpheus should call the user.
- Default personality is friendly, witty, confident, concise, and adaptive.
- Humor is contextual, never constant or obstructive.
- During work lasting several minutes, Morpheus may occasionally check in or
  ask how the user's day is going. This is optional, frequency-limited, and
  immediately adapts when the user ignores or disables it.
- The user can change name, voice, warmth, humor, talkativeness, and form of
  address without changing the execution architecture.
- The default visual presence is an original abstract Morpheus identity. No
  actor likeness, copyrighted movie imagery, or imitation dialogue is used.

## Autonomy and protected boundaries

Autonomy is the default product behavior. Morpheus warns briefly, records what
it is doing, and continues with reversible work inside explicit user context.
It does not ask the user to supervise individual tool calls.

Morpheus interrupts only when:

- the objective cannot be understood precisely enough to form a valid plan;
- money, a financial transaction, wallet signing, or a purchase is involved;
- credentials, secrets, or another person's private information would be
  disclosed or accessed beyond an already explicit connection;
- privilege elevation or a security-setting change is required;
- an action is genuinely irreversible and no automatic recovery is possible;
- a new public identity or materially broader public destination would be used;
- a continuation materially widens authority beyond the accepted objective.

Routine creation, editing, organization, screenshots, application control, and
workspace work should use Trash, backups, versioning, exact roots, visible
indicators, and Audit instead of repeated permission dialogs. Critical
boundaries remain Main-owned and cannot be waived by provider output.

## Voice and background presence

- Setup offers tray startup and wake phrase as explicit choices.
- Push-to-talk and the global shortcut are always available when the desktop
  runtime is running.
- Wake detection should be local when a reliable detector is available. Until
  then, the product must truthfully disclose provider-backed ambient capture.
- A persistent microphone state and immediate mute control are mandatory.
- Audio is ephemeral. It is not written to Mission history, Memory, or Audit.
- If speech is unclear, Morpheus asks for one repeat. Minor ambiguity is inferred
  when safe and reported afterward.
- Speech is concise and interruptible. Morpheus does not narrate every step.

## Memory

Memory is automatic, local-first, inspectable, editable, exportable, and
deletable. Morpheus may retain useful preferences, explicit decisions, routines,
project context, and stable relationship settings. It must not silently turn
unbounded transcripts, secrets, audio, raw audit data, or transient file content
into durable memory.

Each memory item retains source, scope, sensitivity, provider-use policy, and
timestamps. Optional encrypted synchronization is a later host service; it does
not change the memory contract.

## Editions and providers

- **Free** uses user-supplied provider credentials.
- **Pro** will use a Morpheus-managed provider gateway, automatic routing, and
  managed voice allowances.
- **Ultra** uses the same Morpheus Core with higher limits, premium integrations,
  and the NerdGPT personality/provider layer.

NerdGPT is not a second agent engine and cannot bypass Morpheus authority.
Managed provider keys never ship inside Electron. Accounts, subscriptions,
quotas, metering, and hosted routing are a later commercial service after the
private-alpha operator experience is validated.

## Private-alpha hero objective

The first complete demonstration begins with a business idea and produces a
real, inspectable result:

```text
business objective
  -> bounded discovery and assumptions
  -> provider-backed business and site plan
  -> brand direction and copy
  -> working responsive website inside an approved Project
  -> local verification and preview
  -> credential-dependent staging deployment when configured
  -> analytics-ready configuration
  -> thirty-day content and management plan
  -> reminders or schedules for follow-up
```

Morpheus may build and operate a business system. It must never promise income,
market certainty, or financial returns. Domain purchases, advertising spend,
payment accounts, and other financial commitments stop at the protected
boundary.

## Private-alpha delivery boundary

The next delivery is a Larry-quality Windows private alpha. It includes the
real local/BYOK operator experience, not commercial billing or a hosted managed
provider gateway. A feature counts only when the packaged application exercises
its real path. Contracts, mock providers, placeholder pages, and synthetic
progress do not count.

