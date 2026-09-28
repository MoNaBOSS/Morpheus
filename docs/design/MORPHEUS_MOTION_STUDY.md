# Morpheus motion study — 2026-09-28

User direction: smooth Siri-like animation with multiple examples. Preserve the
approved Morpheus orb artwork and green/teal identity. The reference is fluidity,
responsive voice feedback and continuous transitions. These are interactive
concepts; the production orb has not been replaced by this study.

Open [the self-contained motion comparison](morpheus-motion-study.html) in a modern
browser. It includes three animated options, five state previews, a conversation
sequence, pause and reduced motion. Voice amplitude is simulated and labelled;
no microphone, provider or network connection is used. The embedded thumbnail is
resized from `resources/morpheus-orb/orb.png`; the original artwork is unchanged.

Browser verification on Mac: canvas motion changes over time; pause and reduced
motion hold a stable frame; all five states and concept selection update; a full
conversation reaches Done; layout fits 320 px and 736 px content widths. Browser
console: zero errors or warnings. This is interaction/layout evidence, not a GPU
benchmark or acceptance of the Windows production animation.

## Options and recommendation

| Option | Character | Suggested role |
| --- | --- | --- |
| A — Breathing halo | Restrained rings and a slow light sweep | Idle companion, small desktop presence |
| B — Fluid aurora | Overlapping organic green/teal contours | Main listening and speaking response |
| C — Voice ripple | Circular waves with a voice-like envelope | Clear input/output feedback at larger sizes |

Recommendation: B for active interaction with A's restraint while idle. Keep the
center artwork stable and animate the surrounding light. Treat this as a proposed
direction until the user chooses. The preview starts with B selected for comparison;
that is not approval to replace the production design.

## Current source alignment

`src/components/morpheus/MorpheusFluidOrb.tsx` already uses the exact artwork and
subscribes to live microphone amplitude during listening. The shared meter is
`src/lib/morpheus-audio-level.ts`. Existing CSS changes the surrounding glow and
animation speed by state. Speaking animation currently changes speed; it does not
meter the speaker output. `src/lib/morpheus-speech-player.ts` reports speaking
start/stop, which can anchor playback state but does not by itself provide an
amplitude envelope. Existing hidden-page and reduced-motion handling should be
retained and tightened consistently when integrating the selected effect.

## Settle on Mac before PC acceptance

1. **Choose the motion family and strength.** Review A/B/C in idle and active states.
   Use the same family for onboarding, compact, workspace and wake presence, scaled
   for each size. Preserve the approved M rather than morphing the identity itself.
2. **Define truthful state transitions.** Map existing listening, planning,
   execution, speaking, permission, failure and completion states. Planning/working
   motion must not imply a percentage of completion. Only actual playback drives
   speaking; interruption should settle promptly into the real remaining state.
3. **Connect actual voice amplitude.** Smooth microphone input; add output metering
   for supported playback paths. If output cannot be measured, show a restrained
   speaking-state animation without presenting it as an audio waveform. Keep meter
   samples local and ephemeral. Avoid per-frame React state updates.
4. **Set motion and accessibility rules.** Initial integration targets: 200–350 ms
   state transitions, roughly 60–100 ms attack / 150–250 ms release for voice
   smoothing, small scale variation, no flashes or abrupt color changes. Reduced
   motion uses static state feedback; hidden/minimized views stop animation work.
   These are tuning targets, not measured hardware performance.
5. **Verify the selected effect in Electron.** Check small orb legibility, keyboard
   focus, state labels, cancellation, repeated start/stop and reduced motion. Measure
   renderer/GPU work and clean up frame callbacks, meters and resize observers on
   unmount. Avoid keeping a full-screen Matrix effect active behind hidden windows.
6. **Keep the PC source handoff exact.** Fetch the latest
   `codex/morpheus-phase6-managed-layer` tip after this study. Follow
   [the PC return runbook](../roadmap/MORPHEUS_PC_RETURN_2026-09-28.md). Account setup
   and payment selection need not block the visual comparison.

## Requires the PC

- Actual microphone/headset input and speaker output; synchronization and perceived
  first-audio delay, including interrupted and streamed speech.
- Wake/tray appearance, click-through/focus rules, multi-monitor/high-DPI scaling,
  sleep/resume and repeated activation on the user's Windows hardware.
- GPU/CPU/battery behavior at idle and during background work, including integrated
  graphics and low-power mode. Mac browser smoothness is not Windows acceptance.
- The selected motion in the packaged build and upgrade flow, with existing local
  settings/providers/tasks preserved.

Phase 6 still needs live identity setup, measured provider/voice integration,
trial lifecycle and operations. Motion polish does not close those gates. See
[Phase 6 readiness](../roadmap/MORPHEUS_PHASE6_READINESS.md).
