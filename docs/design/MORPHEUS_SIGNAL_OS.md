# Morpheus Signal OS

Status: product and interaction design specification. This document defines the
target experience before implementation. It does not claim the current package
already provides this experience.

## Product experience thesis

Morpheus should feel like an intelligent layer inside the computer, not an
application containing a chatbot. Its interface appears at the depth required
by the work:

1. **Presence** for immediate voice or text direction.
2. **Mission** for observing and redirecting meaningful work.
3. **Command** for managing goals, systems, context and history.
4. **Chat** for extended conversation and thinking.

All four surfaces enter the same Objective Core. They are projections of one
Morpheus state, not separate assistants.

## Original identity: the Morpheus Signal

The defining visual object is the **Morpheus Signal**: a field of fine vertical
traces, folds, pulses and geometric apertures. At rest it is almost invisible.
When Morpheus becomes attentive, coherent traces form an abstract `M`. During
work, the field transforms according to truthful runtime state.

The Signal is not a glowing assistant orb, humanoid avatar, fake waveform or
decorative animation. It is a shared state visualization used in activation,
voice, planning, execution, tray presence, notifications and the application
mark.

### Signal grammar

| State | Form | Motion | Colour |
| --- | --- | --- | --- |
| Asleep | sparse vertical traces | near-still drift | graphite |
| Ready | incomplete `M` aperture | slow coherent breath | muted neutral |
| Listening | traces bend toward input | responsive amplitude | verified green edge |
| Understanding | signal contracts and aligns | short inward sweep | neutral to green |
| Planning | branches form ordered paths | deliberate sequential reveal | cool neutral |
| Trust required | one path pauses at a boundary | still, no alarming pulse | amber boundary |
| Executing | one path advances through plan | directional flow | verified green |
| Speaking | outward low-amplitude waves | speech-synchronized | warm neutral |
| Complete | full `M` resolves briefly | one confirmation settle | verified green |
| Failed | broken path remains inspectable | motion stops | restrained red |
| Degraded | signal loses coherence | slow irregular drift | amber/red by severity |

Green continues to mean live or verified. It is not a general brand fill.

## The three interaction layers

### Presence layer

The Presence layer is the normal everyday Morpheus. It opens from the global
shortcut, tray, push-to-talk or optional wake phrase without forcing the main
window forward.

Default dimensions are approximately 640 by 220 logical pixels. It contains:

- Morpheus Signal and exact state;
- live transcript or command input;
- one-sentence interpretation;
- active Project/workspace context when relevant;
- stop, correct, mute and expand controls;
- a persistent microphone disclosure whenever capture may occur.

It contains no conversation history, sidebar, generic message bubbles, raw tool
calls or permanent settings controls.

#### Presence progression

```text
ready -> listening -> transcript -> understanding -> interpretation
      -> auto-execute | one trust boundary | clarification
      -> working -> concise result -> dismiss to tray
```

Clarification is requested only when Morpheus cannot create a sufficiently
specific plan. It asks one focused question, not a conversational questionnaire.

### Mission layer

A Mission is the visual unit of meaningful work. Presence expands into Mission
when execution will take time, produces artifacts, contains multiple steps, or
the user requests inspection.

The Mission surface is organized by a five-phase spine:

```text
UNDERSTAND -> PLAN -> ACT -> VERIFY -> DELIVER
```

The active phase owns the visual center. Completed phases collapse into concise
evidence. Future phases remain quiet. The screen answers five questions without
opening a technical inspector:

1. What did Morpheus understand?
2. What outcome is it pursuing?
3. What is happening now?
4. Why is it allowed to proceed?
5. What result or artifact exists?

Primary controls are **Pause**, **Redirect**, **Stop**, and **Inspect**. Redirect
adds user intent to the current Objective Core flow; it does not create a hidden
second executor.

### Command layer

The Command Center manages and observes the user's relationship with Morpheus.
It is not a grid of feature cards.

At 1280 by 800, the default composition is:

```text
┌ Intelligence band: Signal · state · command/voice · readiness · trust ┐
├ Today horizon ───────┬ Current focus / Mission ──────┬ Context horizon ┤
│ due work             │ objective and active phase    │ project          │
│ proactive facts      │ result or next action         │ artifacts        │
│ upcoming schedule    │                               │ trust reason     │
├ Recent Missions / background activity / tray presence ────────────────┤
└ contextual navigation; technical depth appears only when requested ──┘
```

The current Mission receives most visual weight. Empty state centers the Signal
and command invitation instead of showing empty panels. The invitation uses the
preferred name collected during setup. Voice is a labeled primary affordance
beside the command field, with the active wake phrase or global push-to-talk
shortcut disclosed in the intelligence band. The compact starter set includes
the real provider-backed business-site journey; it must never advertise a
placeholder objective.

### Chat layer

Chat remains the OpenClaw-powered surface for discussion, ideation and deep
reasoning. It is deliberately secondary:

- executing a conversational objective still routes through Objective Core;
- raw tool activity is collapsed under an inspectable detail control;
- returning to Command shows the same Mission, plan and artifacts;
- the persistent application shell does not organize itself around chat
  sessions while the user is outside Chat.

## Information architecture

The primary product navigation is reduced to:

1. **Command** — presence, Today, current focus and execution.
2. **Missions** — active and historical outcomes.
3. **Systems** — reusable Agents, workflows and schedules composed together.
4. **Library** — Projects, artifacts, skills and inspectable memory/context.
5. **Chat** — conversation through OpenClaw.

Settings remains a utility destination. Existing routes may remain for
compatibility, but the primary shell does not expose Models, Agents, Channels,
Skills, Cron, Agent Profiles, Workflows, Schedules, Activity, Projects and Goals
as equally weighted permanent entries.

### Contextual ownership

| Existing concept | Primary home in Signal OS |
| --- | --- |
| Agent Profiles | Systems and Mission configuration |
| Workflows | Systems |
| Schedules | Systems and Mission follow-up |
| Goals | Command Today horizon and Missions |
| Projects | Library and Mission context |
| Artifacts | Mission result and Library |
| Activity/Audit | Mission history; technical inspector |
| Providers/Models | Readiness and Settings |
| Permissions/Grants | Trust inspector and Settings |
| OpenClaw Agents/Channels/Skills/Cron | Advanced runtime section, not primary identity |

## First-launch activation

Activation is one continuous directed experience, not a sequence of setup cards.

### Scene 1 — emergence

The window is dark. Sparse traces respond to real application readiness. They
resolve into the Morpheus Signal and original `M`. Reduced-motion mode replaces
formation with a restrained opacity transition.

Morpheus says, if speech is available:

> I’m Morpheus. Tell me the outcome you want. I’ll handle the path.

The user can skip animation without skipping required setup.

### Scene 2 — truthful readiness

Runtime, provider, voice and local execution appear as four signal locks. Each
uses real state and provides one direct remedy when unavailable. Technical
provider forms remain behind **Configure**; activation explains the user benefit
first.

### Scene 3 — relationship

The user selects:

- push-to-talk and optional ambient wake phrase;
- spoken responses;
- concise, adaptive or warm personality;
- Strict, Balanced or Autonomous trust profile;
- whether Morpheus remains available in the tray.

Balanced is recommended and explained in plain language. Ambient microphone
disclosure remains explicit.

### Scene 4 — proof through action

Morpheus requests one small real objective appropriate to available capabilities.
It must execute through Objective Core. A fake tutorial result is forbidden.

If no provider is configured, offer a deterministic objective such as system
information or creating a note. If provider and voice are ready, invite speech.

### Scene 5 — handoff

The real result becomes the transition into Command. Morpheus offers to remain
available in the tray and teaches the global shortcut once.

## Trust interaction

Trust is represented as a boundary in the plan, not a modal detached from the
objective.

The interruption states:

- what Morpheus intends to accomplish;
- the genuinely new scope;
- why existing trust is insufficient;
- what will happen after approval;
- Deny, Allow once, Allow this session, or Always allow this exact scope.

The safest non-execution option receives keyboard focus. After approval, the
plan continues from the paused boundary without restating every capability.

Routine work should visibly explain automatic authorization in one short line,
for example: `Proceeding inside trusted Project · Balanced`.

## Result delivery

Results are not assistant messages. They are outcome surfaces:

- one concise spoken/visual conclusion;
- artifact previews with real paths and open/reveal actions;
- what changed;
- verification evidence;
- unresolved limitations;
- logical next action, if useful;
- a quiet path to technical details.

A background completion uses a native notification and tray Signal. Opening it
returns directly to the relevant Mission result.

## Personality and language

Morpheus is calm, sharp and adaptive. It can be warm or dryly humorous when the
moment permits. It does not imitate copyrighted dialogue, constantly call the
user "sir", expose chain-of-thought, or narrate each tool invocation.

Examples:

- `Got it. Three steps. Nothing here needs additional permission.`
- `That folder is outside the trusted Project. Include it for this Mission?`
- `The first build failed verification. I corrected the configuration and ran it again.`
- `Done. The report is ready—and considerably less boring than the source material.`

## Visual system

### Palette

- Base: blue-black and graphite, not pure black.
- Text: warm off-white for primary language; cool grey for machine context.
- Verified/live: restrained phosphor green.
- Context: desaturated cyan-grey.
- Trust attention: warm amber.
- Failure/destructive: restrained red.

### Typography

- Editorial display face for identity, objectives and results.
- Neutral humanist sans for controls and explanatory language.
- Monospace only for ids, paths, hashes, plan structure and machine truth.

### Surfaces

Replace the universal bordered card with three compositional tools:

1. **Horizon** — an aligned information region separated by spacing and a rule.
2. **Stage** — the dominant current state, with no enclosing card unless needed.
3. **Inspector** — a raised technical or contextual surface opened on demand.

Cards remain appropriate for discrete selectable objects, not page structure.

## Motion and sound

Motion reports state. It never exists only to look futuristic.

| Transition | Target duration |
| --- | --- |
| Hover/focus | 100–140 ms |
| Presence open | 180–240 ms |
| Presence to Mission | 280–360 ms |
| Phase transition | 240–400 ms |
| Activation emergence | 1.8–2.8 s, skippable |
| Complete confirmation | under 600 ms |

Sound is optional and sparse:

- one low activation signature;
- subtle listening start/stop cues;
- one trust-attention cue;
- one completion cue;
- no continuous sci-fi ambience by default.

Speech and sound stop immediately on barge-in. Reduced motion and mute retain
all state through text and shape.

## Component architecture

The experience remains modifiable through independent primitives:

- `MorpheusSignal`
- `IntelligenceBand`
- `PresenceSurface`
- `MissionStage`
- `MissionPhaseSpine`
- `ObjectiveStatement`
- `InterpretationSummary`
- `TrustBoundary`
- `ExecutionEvidence`
- `ResultSurface`
- `ArtifactStrip`
- `TodayHorizon`
- `ContextHorizon`
- `TechnicalInspector`
- `TrayPresence`

Components consume truthful projected state. They never fetch native data,
invent progress, infer permission, or own execution authority.

## Existing systems to reuse

The redesign should project, not replace:

- Objective Core and sequential plan executor;
- runtime and audited phase events;
- plan-level trust delta and exact grants;
- Mission, Goal, Project, System, workflow and schedule stores;
- artifact projection;
- voice service, Quick Command window and tray lifecycle;
- OpenClaw Gateway and Chat route;
- typed host-invoke boundary and Main-owned capability registry.

The current `Panel`, timeline, status and path primitives may remain inside
inspectors and technical surfaces. They should no longer dictate the entire
Command Center composition.

## Failure and degraded states

- **No provider:** deterministic actions remain available; setup is one click;
  Morpheus never implies broad understanding is active.
- **No microphone:** text Presence remains primary-capable; microphone remedy is
  contextual, not a blocking page.
- **Gateway starting:** local Objective Core state remains visible; Chat is
  labelled unavailable until ready.
- **Audit degraded:** safe read-only operations remain available; blocked work
  names the security reason and recovery state.
- **Planner uncertainty:** Morpheus presents its interpretation and asks one
  specific clarification.
- **Execution failure:** failed phase stops, evidence remains visible, and a
  bounded correction or retry is offered.
- **Offline:** local capabilities and stored context remain truthful; provider
  and connected actions show unavailable rather than spinning indefinitely.

## Accessibility and usability

- All state is communicated by text and shape, never colour alone.
- Full keyboard operation for Presence, Mission and trust decisions.
- Safest trust decision has default focus.
- Minimum 4.5:1 contrast for normal text.
- Reduced-motion mode preserves sequence comprehension.
- Screen-reader live regions announce phase changes without reading decorative
  Signal motion.
- Voice is an enhancement, not the only route to any action.
- Primary experience works at 1280 by 800 and 125–150 percent Windows scaling.

## Experience acceptance gates

The redesign is not accepted until fresh-profile packaged testing demonstrates:

1. A new user understands what Morpheus is within one minute.
2. The user can issue a voice objective without opening Chat.
3. Listening, interpretation, planning, trust, execution and result are visually
   distinct and truthful.
4. A routine trusted Mission proceeds without repeated prompts.
5. The user can pause, redirect or stop active work.
6. A real artifact is easy to inspect and reveal.
7. Closing the main window leaves an understandable tray companion.
8. Global invocation returns in under a user-perceived instant when runtime is
   warm.
9. Chat remains functional but never appears to be the product home.
10. No normal surface resembles a generic dashboard, terminal skin or messaging
    application.
11. Reduced motion, keyboard navigation, 1280 by 800 and Windows scaling pass.
12. Human review by the product owner—not automated tests alone—accepts the
    first-launch and first-Mission experience.

## Design sequence before code

1. Approve this interaction architecture.
2. Produce grayscale deterministic wireframes for every critical state.
3. Validate hierarchy and keyboard flow without visual effects.
4. Produce the Signal motion study and visual tokens.
5. Build a clickable state prototype using synthetic display data only; do not
   connect native execution yet.
6. Test the prototype at 1280 by 800 with first-time users.
7. Map each approved state to existing runtime projections.
8. Implement one packaged vertical slice before redesigning secondary pages.
