# Morpheus provider policy

Status: Windows candidate policy, reviewed 2026-09-16.

Morpheus owns provider selection policy but never treats a model provider as
execution authority. Providers may interpret an objective and propose a typed
plan. Electron Main still validates the plan, evaluates trust, executes
registered capabilities, records events and audits the result.

## Product defaults

New OpenAI and OpenRouter accounts default to the Luna tier. It provides tool
calling and structured output at a much lower cost than the premium Sol tier.
Existing accounts are not silently changed: the user can switch the model in
place in **Models -> Edit provider**.

OpenRouter exposes two deliberate planning choices in the setup UI:

- **Balanced:** `openai/gpt-5.6-luna`
- **Economy:** `deepseek/deepseek-v4-flash-0731`

`openai/gpt-5.6-sol` remains available as an explicit premium choice. It is not
the Morpheus default.

These recommendations are a dated policy snapshot, not a permanent claim that
one provider is always cheapest or best. Availability, routing, latency and
price are provider-owned and must be reviewed before a public release.

## Voice through one OpenRouter account

An API-key OpenRouter account is eligible for both transcription and speech.
Morpheus offers two explicit presets:

| Preset | Transcription | Speech | Default voice |
| --- | --- | --- | --- |
| Efficient | `openai/whisper-large-v3-turbo` | `hexgrad/kokoro-82m` | `am_onyx` |
| Expressive | `openai/whisper-large-v3-turbo` | `canopylabs/orpheus-3b-0.1-ft` | `leo` |

The efficient preset is the normal recommendation. The expressive preset is a
quality choice and may cost more. Both use OpenRouter's documented
OpenAI-compatible `/audio/transcriptions` and `/audio/speech` endpoints.

Audio is bounded and ephemeral. Morpheus does not write microphone audio,
transcripts or spoken response text into audit records. Provider account keys
remain in the Main-owned secret store and never cross into the Renderer.

## Cost boundaries

The Objective Core tries deterministic registered capabilities before asking a
model to plan. Provider planning remains bounded by request, duration, step and
output limits, and a successful execution does not spend another model request
on ceremonial review.

These limits do not cap independent OpenClaw Chat loops or the provider's own
pricing. A surprisingly large charge must be reconciled against the provider's
usage log; a local audit record cannot prove the provider's bill.

For low background voice cost, prefer Windows local name detection when it is
available on the machine. Cloud ambient mode remains opt-in and only submits
bounded speech segments, but it still incurs provider transcription cost.

## Commercial boundary

The Windows candidate is BYOK. One OpenRouter key can power planning,
transcription and neural speech, but Morpheus does not embed a reusable company
secret in an Electron installer. A zero-configuration paid edition requires a
Morpheus-owned authenticated proxy with per-user quotas, abuse controls,
revocation, metering and secret rotation.
