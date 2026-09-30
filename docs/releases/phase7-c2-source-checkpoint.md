# Phase 7 C2 narrow source checkpoint

2026-10-01, based on C1 source `054996707e5413735635ffecf2b3562642a3f6c6`.

The existing three neural candidate buttons now use one bounded prepared sample
containing a greeting, light fridge joke and explicitly labeled example task
update. English, Chinese, Japanese and Russian are covered. Each click still
uses the existing speech owner and one speech request; no personality-model pass
was added. Neural availability gates the preview and Windows fallback remains
forbidden. Human listening acceptance remains required.

## Verification

- 21/21 focused source units passed: audition locales/guard, speech player,
  dialogue and playback lifecycle. Web typecheck and changed-file lint passed.
- 1/1 Electron silence journey passed against the fresh C1 build. The fixture
  provides a zero-valued Web Audio MediaStream while production Chromium analyser,
  MediaRecorder, VAD and ten-second no-speech timeout run normally. It observes
  listening then the localized retry error, all input tracks ended, and zero
  STT, TTS, interaction-route or objective/assistant-turn requests. It uses an
  isolated profile and no physical microphone or paid provider.
- The initial silence run reached the correct no-speech error but asserted the
  internal message instead of the localized display text; the assertion was
  corrected and the rerun passed. No product change was needed.
- Narrow harness validation/dry-run, communications replay/compare and whitespace
  checks passed. README en/zh/ja reviewed: no interface/setup change requires a
  README edit; this checkpoint records the expanded prepared audition.

## Existing source boundaries inspected

Speech-player units cover immediate stop, late provider audio rejection,
cancelled failures without Windows fallback, stopped playback cleanup and newer
generation supersession. Main voice-service source units cover audited wake
barge-in gating and audited bounded follow-up opening. Dialogue units cover one
unprefixed follow-up within fifteen seconds and expiry/reset. These are synthetic
source tests, not actual speaker echo or real microphone barge-in evidence.
Speech stop uses the speech cancellation owner; independent task cancellation
remains separate. No backend/store changes were made in this checkpoint.

The Electron journey exercises silent explicit listening, not quiet ambient
hours, real microphone permissions, speaker echo, hardware wake latency or
unplug/replug. Audition text/source tests do not prove neural voice quality or
playback in all four languages. This patch's locale samples require the final
fresh candidate build; the silence behavior was tested on the preceding C1
build because this patch changes no capture implementation. Packaged/live and
human audition gates remain open. C2 and Phase 7 are not accepted as complete.
