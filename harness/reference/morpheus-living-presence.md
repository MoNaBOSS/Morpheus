# Morpheus Living Presence and Neural Voice

This reference defines the completion boundary for the companion presentation.
It extends the existing Objective Core and Voice service; it does not create a
second assistant runtime.

## Living Signal

The Morpheus Signal is an original abstract intelligence presence. Its visual
state is derived only from persisted or emitted runtime truth:

- asleep and ready from Voice presence;
- listening and transcribing from bounded microphone capture;
- understanding, planning, trust, execution, replanning and completion from the
  Objective Core;
- speaking from actual audio playback;
- degraded and failed from real runtime failure.

The Signal may use rings, filaments, a waveform and sparse Matrix data texture.
It may not imply capabilities, progress or health that the runtime did not
report. Reduced motion preserves the state label and sequence without motion.

## Neural speech

Provider speech generation is Main-owned. Renderer submits bounded text that was
already selected from a real Objective result or activation copy. Main resolves
an enabled OpenAI or explicitly compatible account, obtains the credential from
the provider service, validates HTTPS, calls the fixed `/audio/speech` endpoint,
and returns bounded ephemeral audio. Credentials never cross the host boundary.

Speech text and generated audio are never persisted or included in Audit.
Audit records provider id, model id, voice id, character count, byte count,
latency and outcome before the renderer reports speaking state. Audit degradation
blocks provider disclosure. Windows speech synthesis is a truthful fallback, not
reported as neural speech.

## Personality and proactivity

The Main-owned onboarding preference is context, not execution authority.
Preferred name and personality may shape provider planner instructions and
concise spoken presentation. They cannot alter plans, grants, capability scopes
or safety policy. Proactive check-ins map to the existing bounded proactive
service and never create unbounded model polling or native execution.
