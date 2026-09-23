# Morpheus Operator Presence

## Purpose

Morpheus Presence is the visual and spoken projection of the existing Objective
Core. It is not a chat skin and it does not invent system activity. The same
state language is used in first-run activation, Command Center, Quick Command,
the compact Windows companion and voice feedback.

## Primary experience

```text
address -> listen -> transcribe -> understand -> plan -> act -> verify -> speak
```

The luminous Signal is the single state carrier:

- **Ready**: slow, quiet orbit with low emerald luminance.
- **Listening**: microphone energy expands the near field; the microphone is
  visibly identified and a stop control is always reachable.
- **Understanding / planning**: motion folds inward. This state is driven by a
  real transcription or Objective event, never a timer.
- **Working**: a measured forward sweep accompanies the current real plan step.
- **Speaking**: an outward cyan waveform starts only when audio playback starts.
- **Complete**: one brief resolved pulse, followed by a calm state.
- **Trust / error**: amber or red is reserved for intervention and failure.

Emerald means available or verified. It never means permission, risk or
success before evidence exists.

## Windows surfaces

### First encounter

The activation scene owns the full application window. It introduces Morpheus,
asks what to call the user, verifies voice separately from provider
configuration, explains background/tray operation and hands off naturally into
the Command Center. It is skippable, keyboard accessible, time-bounded and
motion-reduced when requested.

### Full workspace (current accepted direction)

The default full window shows the approved orb, a conversation-style projection
of real task requests and results, and a simple voice/text composer. A result
pane opens only when there is a real result, clarification or artifact. Active
tasks are selectable from a small menu. Provider, runtime, trust and plan-stage
details do not occupy the everyday view. The Matrix field stays faint behind
readable content. The old Command Center layout below is historical.

### Former Command Center

The default route is one operator surface:

1. living Signal and the primary objective input;
2. current Mission with Understand, Plan, Act, Verify and Deliver progress;
3. compact truthful readiness for runtime, provider, voice and trust;
4. real results and artifacts.

Subsystems remain reachable, but they do not compete with the objective.

### Presence

The Windows global shortcut, tray command and wake event summon a compact,
always-on-top surface. It keeps the Signal, live transcript/current objective,
one progress line, stop/cancel and expand controls. It is not a miniature copy
of the full application and never shows a chat transcript.

### Chat

Chat remains a separate OpenClaw conversation surface. An interaction routed to
Chat is described truthfully; Presence does not fabricate a conversational
answer or claim that a chat result was executed by Objective Core.

## Voice interaction

- Push-to-talk and shortcut capture stop automatically after real speech and a
  bounded silence, while retaining a manual stop control.
- No-speech timeout ends locally without paying for an empty transcription.
- A voice-initiated result may open one bounded follow-up turn. Follow-up is
  input convenience, not execution authority or permission.
- Background listening remains opt-in. Local wake mode does not silently fall
  back to continuous cloud transcription.
- Neural speech is preferred when a compatible provider has been tested.
  Windows speech is explicitly labelled as fallback and selects the best
  natural installed voice without claiming neural quality.
- Audio, transcript text and spoken result text remain ephemeral.

## Motion and performance

The Signal uses CSS and SVG transforms. Microphone energy updates a CSS custom
property outside React's render loop. Hidden windows stop visual sampling and
reduced-motion removes non-essential transforms and loops. State transitions
use 160-420ms motion; cinematic activation is the only deliberately slower
surface.

## Acceptance

At 1280x800 the objective input, Signal, active Mission, real runtime status and
stop/cancel controls are visible without scrolling. Compact Presence fits the
Windows work area, restores the exact prior window state and remains usable by
keyboard. Every visible live state can be traced to microphone, Objective,
permission, capability, playback or audit evidence.
