---
id: morpheus-production-companion-safety
title: Morpheus Production Companion Safety
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Ambient voice must be disabled by default, visibly armed and bounded. Audio and
transcripts may not be persisted or written to Audit. Renderer microphone state
cannot establish an ambient Main session id. Provider disclosure requires an
explicit stored user setting and healthy Audit.

Provider speech generation is Main-owned and may return only bounded ephemeral
audio. API keys never cross the host boundary. Speech text and audio may not be
persisted or written to Audit; only privacy-safe provider, model, voice, size,
latency and outcome metadata may be recorded. Audit degradation blocks the
provider call. Renderer playback state is presentation, not execution authority.

Proactive observations may read only validated Mission, Goal, schedule,
workflow and workspace projections. They cannot invoke native behavior directly.
Any action or notification enters the single Objective Core and plan/runtime
path. Duplicate source fingerprints must coalesce; quiet hours suppress delivery.

Goals and Systems are organizational state, not authority. A Goal continuation
resolves its objective and context in Main. A System must reference existing
validated Agent Profile, workflow, workspace/Project and schedules. Testing and
activation execute through Objective Core. Activation must not create a grant,
register a capability, accept a Renderer-authored path or introduce shell access.

All state mutations and emitted transitions must be audited in order. Audit
degradation blocks provider disclosure, unsafe background execution and System
activation while leaving local read-only inspection available.

Tray handoff must be explicit and must not enable microphone capture, startup or
new grants. Main must verify a live tray before hiding the window. Stopping or
superseding speech invalidates pending audio and fallback as well as playback.

Planner calls must carry protocol-specific output limits and bounded input and
request allowances. Cancellation must abort Main-owned provider speech. Neither
usage diagnostics nor audit records may contain prompt, speech or audio payloads.

Voice authentication and endpoint failures must be surfaced truthfully without
raw provider error bodies. Release verification must distinguish configuration,
mocked tests, real endpoint success and actual microphone quality. Public release
publication is a separate review gate, never inferred from a successful build.

Local wake detection is an explicit mode. Its helper receives validated data,
never caller-authored code or argv, and must stop with the owning session. Main
audits wake acceptance and admits at most one bounded command capture per
conversation turn. A terminal voice Objective may open one time-bounded follow-up
turn, but Renderer follow-up state is not a grant and cannot widen execution
authority. Local detector failure must never enable
cloud monitoring implicitly. Configuration changes invalidate pending transcripts.

Saved companion listening consent is separate from foreground presentation.
Visible full/compact conversation and Settings suspend automatic microphone and
wake activity through Main-owned scope; only explicit microphone input may run
there. Returning to a hidden/minimized companion may resume saved consent, never
enable it. Master mute stops all capture. Capture errors take precedence over
armed/listening labels; installed voice assets do not establish an input test.

Streaming speech must be correlated, sequenced, byte-bounded and transient.
Record speech-start before the first audio chunk. Playback failure must cancel
pending generation; a preview must report the engine that actually completed.
Audio-level animation is presentation only and must release its analyser and
listeners without high-frequency React updates.

The default workspace uses the approved orb and a restrained Matrix field. Its
conversation and result panes must project actual Objective records. Do not
show internal mode selectors, plan stages or provider diagnostics as everyday
controls; keep necessary settings reachable without changing Main authority.

Automatic end-of-speech detection is Renderer microphone lifecycle only. It must
retain a visible manual stop, discard no-speech timeouts without provider calls,
and cannot manufacture transcript, Objective or completion state. Compact
Presence must restore the exact saved full-window state on close or expansion.

Desktop presence defaults to the bottom-right of the current display work area,
with space for the taskbar. Wake, tray and global shortcuts use the same compact
anchor; the compact panel grows upward and stays inside the available work area.
Waking the orb must not steal focus. Full workspace expansion remains explicit.
Browser hover designs are not evidence of native hover or audio integration.

Unrestricted appearance is a local, labelled preview until the service is
configured. Persist only the validated presentation enum through existing Main
settings; a red theme cannot alter entitlement, execution authority or microphone
consent. Payment presentation must distinguish plans and service availability.
Absent billing configuration, expose no invented price, address or working checkout.

Voice precision reports retain their corpus version, exact transcript, destination
and engine identity. Generated speech is useful regression evidence, not proof of
human accent, room-noise or microphone performance. Preserve literal search text
and route multi-action requests as complete objectives rather than running only
the first matched utility command.

Public Windows release and update checks require the configured publisher and
valid timestamped signatures for the actual installer and embedded application.
An unsigned preview or self-signed test cannot satisfy commercial signing.

Optional Deepgram speech is a separate protected connection, not a task-model
account or a funded entitlement. Save/test never unmute or activate it. Main
owns fixed HTTPS/WebSocket endpoints, credential headers and bounded deadlines;
Renderer sends sequenced selected-microphone PCM through the typed host API.
Only natural final turns or explicitly requested finish can complete input.
One session has one result consumer; overlapping starts, mute, setting/key
changes and cancellation abort old transport and discard stale results. Cloud
mode retains local wake detection, uploads only admitted original addressed
audio, and never opens a paid idle ambient stream. Kit model alias resolution
is allowlisted; matching SpeechMetadata, not Flushed, completes actual PCM.
