# Companion experience campaign

Approved 2026-09-14. Baseline: `9908e7d`, Windows 1.0.3 private candidate.
The goal is a dependable personal operator, not another feature-count release.

## Milestones and release gates

1. **Conversation activation**: calling Morpheus alone acknowledges the user;
   a bounded follow-up window accepts the next utterance without repeating the
   name. Cancel, timeout, configuration changes and stale transcription cannot
   accidentally submit work. Preserve Main policy and audit. Develop local wake
   detection separately from the existing explicitly disclosed cloud mode; never
   describe transcript matching as offline detection.
2. **Voice quality and readiness**: preview the actual selected neural voice,
   show whether playback was neural or Windows fallback, improve delivery style,
   verify microphone separately from account configuration, reduce avoidable
   delay without unlimited background provider calls. Preserve saved choices.
3. **Responsive presence**: one glowing Signal across arrival, invoke and active
   listening; real audio energy drives visual response without per-frame React
   renders. Respect reduced motion, hidden-window cleanup and clear mute state.
4. **Packaged acceptance**: introduce/name -> verified mic/speaker -> tray -> call
   name -> acknowledgement -> command -> real execution -> spoken result ->
   follow-up -> interruption. Test repeat trials with real audio hardware and
   providers. Record stage latency, false activations, failures and cost limits.

## Status

1. Conversation activation is implemented: bounded bare-name follow-up, local
   acknowledgement, generation guards and opt-in Windows native detector. Dialogue
   and Main capture-boundary tests pass. Native audio initialization fails on the
   current machine; real wake accuracy and false-activation trials remain blocked.
2. Voice readiness is implemented: selected-voice preview, separate non-executing
   mic check, improved delivery instructions and bounded MP3 streaming. Real
   Electron decoding starts before fixture generation completes. The normal
   packaged preview failed authentication and used Windows fallback. Natural
   neural speech is therefore not verified or certified.
3. Responsive presence is implemented: shared luminous orb, transient microphone
   level animation, opaque welcome, hidden-view cleanup and reduced-motion support.
   Visual and Electron interaction checks cover 1280x800 and 1920x1080. These do not
   replace real microphone/voice acceptance.
4. Windows 1.0.4 packages successfully and normal packaged greeting, Command Center,
   real system report, OpenClaw gateway, Chat navigation and shutdown passed. The
   complete hands-free journey is NOT accepted. See the candidate release report.

This is a private candidate, not the finished public product. It implements a
single bounded follow-up command, not uninterrupted full-duplex dialogue or an
adaptive humorous voice personality. No new pricing or account service is included.

## Boundaries

Reuse Objective Core, sequential execution, grants, capabilities, artifacts,
OpenClaw and audit. No new commercial pricing, permission weakening, fabricated
diagnostics, model calls just to animate an orb, or account/profile resets.
Audio and transcripts remain ephemeral. Do not publish this as a production
release until the real-device journey passes and existing release gates close.
