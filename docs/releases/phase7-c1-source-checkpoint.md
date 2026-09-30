# Phase 7 C1 narrow source checkpoint — 2026-10-01

Partial source implementation; hardware and packaged acceptance remain open.

The existing Windows helper now loads an addressed wake-plus-dictation grammar
alongside the bare wake grammar. A recognized bounded command suffix is passed
locally to Main, audited before publication, and projected once through the
existing presence event and renderer route. It opens no additional capture window
and makes no second STT call. Bare wake retains the existing audited capture flow.
Commands stay ephemeral in memory; audit details do not contain command text.
Recognition still depends on installed English System.Speech and its confidence
threshold; unsupported/missing input produces the existing truthful error.

Ambient capture cancels a pending microphone acquisition safely, rechecks capture
admission after the audit transition, and releases all microphone/context/timer
resources when a track ends. The renderer ends the Main session on capture error,
blocks silent retry, and gives a reconnect/restart error. Asleep/error presence
releases capture and does not automatically reopen it. Existing settings update
provides the explicit restart path. Existing Main session teardown rejects stale
wake callbacks after mute/lock/end; no second execution owner was added.
Missing/disconnected microphones now have a device error classification and
localized reconnect/restart guidance in the runtime and settings for all four
locales (en, zh, ja, ru).

Focused evidence:

- Five voice unit files: 59 tests passed (wake bridge, Main voice service,
  renderer voice store, ambient capture and existing voice settings). Added same-breath suffix protocol,
  audit-before-emission, duplicate suppression, no-second-capture/STT,
  cancelled acquisition, and device-loss resource checks.
- Node, web and managed typecheck passed.
- Communications replay and compare passed.
- Focused lint and a fresh renderer/Main/preload build passed after localization.
- Six fresh-build isolated Windows Electron journeys passed: new duplicate
  wakeCommand event admission with exactly one route/objective and zero extra
  capture/STT/TTS invocations; missing-microphone localized recovery with zero
  transcription; provider-missing ambient rejection and direct recovery; truthful
  Windows fallback; real Electron MediaSource MP3 playback before completion.
  The Main wake event and missing device are fixtures. MP3 is synthetic silence,
  not real neural voice quality. Native orb remained unfocused; screenshot is
  under `test-results/morpheus-wake-command-a-lo-94b88-thout-second-capture-or-STT/`.
- Diff-aware narrow harness validation and selected-flow dry run passed with
  `--since HEAD` after B1 was committed as `2469c650`.
- No paid provider calls or owner profiles used. No commits made by this pass.

The narrow task spec is
`harness/specs/tasks/morpheus-phase7-c1-capture-lifecycle.md`. Initial validation
against simultaneous uncommitted B1 changes rejected that unrelated scope; the
diff-aware validation above supersedes that temporary failure.

Remaining acceptance: actual same-breath recognition accuracy and latency on a
Windows microphone; System.Speech/Chromium concurrent input ownership; real
mute/lock, unplug/replug, missing-input and speaker/headphone behavior; exact
packaged candidate. Source/native fixtures prove dispatch
and cancellation, not actual audio recognition or hardware quality. C1 remains
open until those gates pass.
