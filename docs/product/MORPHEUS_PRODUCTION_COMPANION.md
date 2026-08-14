# Morpheus Production Companion

This document defines the Windows product boundary that completes the companion
campaign. It builds on the canonical [Morpheus vision](MORPHEUS_VISION.md) and
[companion vision](MORPHEUS_COMPANION_VISION.md); it does not replace them.

## Product promise

Morpheus is the user's persistent intelligent computing layer. The normal loop
is not chat-first:

```text
objective from voice, Quick Command, Command Center, Chat, schedule or system
  -> understand current Project, Goal and memory context
  -> route a known capability or produce a typed plan
  -> compare the whole plan with exact trust
  -> ask once only for a genuinely new consequential boundary
  -> execute, observe and replan within bounded limits
  -> preserve the Mission, artifacts, checkpoints and useful follow-up
```

## Everyday presence

Morpheus has four truthful states:

1. **Asleep** — ambient listening is disabled; global push-to-talk remains
   available.
2. **Armed** — the user explicitly enabled ambient voice. A persistent visible
   indicator shows that microphone capture may begin. No objective is inferred
   until the configured wake phrase is present in a real transcript.
3. **Engaged** — Morpheus is listening, transcribing, planning, waiting for
   trust, working, observing or speaking. The exact state is visible and
   interruptible.
4. **Proactive** — Morpheus surfaces factual attention items derived from real
   Missions, Goals, schedules and repeated work. It may notify within the
   user's quiet-hours policy; it never invents urgency or hidden work.

Ambient voice is opt-in and provider-backed in the Windows 1.0 product. Audio
may be disclosed to the configured transcription provider only after the user
enables that mode. A loopback/local provider keeps that disclosure local. The
product must explain this before activation and audit session metadata without
persisting audio or transcripts.

## Long-horizon work

A **Goal** gives multiple Missions a durable purpose. It records success
criteria, milestones, next action, target date, Project/workspace context and
real Mission lineage. Goal progress comes from completed milestones and linked
Mission outcomes—not model confidence or decorative percentages.

Morpheus may recommend continuing, correcting or scheduling a Goal. Continuing
always creates a new Objective Core run; interrupted native work is never
silently resumed after restart.

## Proactive intelligence

The Today briefing is derived from inspectable facts:

- Missions that failed, need clarification or were left incomplete;
- Goals with a due or overdue next milestone;
- schedules due soon or recently failed;
- repeated successful objectives that are candidates for a reusable System;
- explicit reminders created by the user.

Every item states its source and can be dismissed, snoozed or acted on. Morpheus
does not use fake diagnostics, hidden scoring or unbounded background model
calls. Quiet hours, notification behavior and proactive categories are
user-controlled.

## AI System Builder

A **System** is a reviewed composition of existing Morpheus architecture:

- one Agent Profile;
- one validated reusable workflow;
- one exact Project/workspace context;
- zero or more Morpheus-owned schedules;
- exact capability/trust boundaries;
- output and artifact policy;
- run history linked to Missions.

The safest path is **Mission -> review -> test once -> activate**. A completed
Mission may become a System only when its latest typed plan is reusable. Content
or transient secrets that are deliberately not retained become required inputs
instead of silently entering the System. Activation never grants new authority;
the first real run still evaluates exact plan trust.

Systems are not code plugins and do not add shell authority. Future provider
planning may propose a System through the same validated contracts, but model
output can never register a capability or bypass Main-owned review.

## Personality and response

Morpheus is concise, calm and adaptive. It may be warm or humorous when the
moment supports it. It does not always call the user "sir", narrate hidden
reasoning, or force ordinary work into a chat exchange. Speech output is
interruptible and never claims success before audited execution has completed.

## Completion boundary

The Windows production companion is complete when ambient and push-to-talk
voice, proactive Today, durable Goals, reusable Systems, Missions, Projects,
workflows, schedules, exact trust, provider planning, capabilities, artifacts,
Activity and OpenClaw Chat operate together in the packaged application.

Future macOS/Linux hosts, mobile/web companions, a bootable ISO, third-party
connected-service catalog, arbitrary software control, and financial execution
remain separate product campaigns. They must not be represented as shipped by
this Windows release.
