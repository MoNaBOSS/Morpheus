# Phase 5 paid-path inventory and evidence boundary

Source review on 2026-09-24, expanded 2026-09-27, from `codex/morpheus-phase4-mac-handoff`. This is a
code-path inventory, not a provider bill reconciliation or a live benchmark.

| Path | Entry and owner | Existing observation | Gap before a complete cap |
| --- | --- | --- | --- |
| Direct registered actions | `objective-orchestrator.ts` → deterministic planner and capability registry | Objective and stage audit; no model request on this path | Native side effects may incur external service charges that token accounting cannot infer. |
| Core provider planning and review | `planner-selector.ts` pins an account/model on a selected planner; `provider-planner.ts` calls OpenAI completions/responses, Anthropic messages, Google generateContent or local Ollama | `provider-usage` audit records started/completed and token counts if returned; request count, prompt and output bounds already exist | Failed/ambiguous requests lacked a terminal usage marker; no provider bill amount, model price, shared reservation or cross-session cap. Retry can make another billable request. |
| OpenClaw chat and agents | `acp-chat-service.ts` sends ACP `session/prompt` to embedded OpenClaw; gateway and agent runtime own model/tool selection | `token-usage-core.ts` scans assistant and tool transcript usage and optional `usage.cost.total`; Models history shows this retrospectively | Transcript rows can be missing, late or deleted; ACP/Gateway and tools do not reserve through Core. Costs are runtime-reported, not reconciled to invoices. |
| OpenClaw cron, channels, skills, tools | Gateway `cron.run` and configured OpenClaw runtime/plugins | Some completed runs appear in transcripts if the runtime writes usage | Plugin network calls and non-transcript work are not intercepted or exhaustively metered. Cron may run while UI is closed. |
| Image generation/editing | `media-api.ts` → `openclaw-image-generation-runtime.ts` → OpenClaw SDK; bundled `resources/openclaw-plugins/clawx-openai-image/index.mjs` supports its own configured account and up to four images | Image artifacts, provider/model and attempt metadata; chat tool usage only if emitted by runtime | Dedicated image calls do not pass through Core or voice accounting; sizes/counts and edits have provider-specific charges. No complete cost observation or reservation. |
| Speech recognition | `voice-service.ts` posts bounded audio to `/audio/transcriptions` (explicit or ambient capture) | Voice audit has provider, model, audio bytes/duration, transcript length and latency | Provider amount/units are absent; request retries after uncertainty can be charged; no shared reservation. Local Windows wake itself has no cloud request. |
| Neural speech | `voice-service.ts` posts bounded text to `/audio/speech`; streamed and preview calls use the same service | Voice audit has provider, model, input characters, audio bytes and latency | Provider amount/units are absent; cancellation may still be charged; no shared reservation. Windows speech fallback has no provider call. |
| Account validation | `provider-validation.ts` uses `/models` or `/auth/key`, with small model probes on some fallback paths | Validation result and HTTP status, no usage ledger | `/responses`, `/chat/completions` and `/messages` fallback probes can be paid. No cross-path cap. |
| Other connected services | Channel APIs, browser/tools and provider plugins | Service-specific status; no unified billing evidence | External APIs may have their own charges. Only owner/provider bills can establish total spend. |

All cloud inference is BYOK today. `shared/morpheus/provider-policy.ts` contains
default model recommendations, not measured quality rankings. The chosen provider
account is kept for an objective; no automatic cheap/strong switching is justified
yet. `electron/shared/pi-ai-model-cost.ts` explicitly normalizes missing cost
metadata to zero for runtime compatibility. Zero there is **not** proof of a free
model or zero bill.

### Model configuration inventory

These are **source defaults**, not verified live availability, prices or quality.
Explicit account/agent selections override them; OpenClaw can use additional
configured models and tool providers. Inspect the saved account/model bindings
when collecting live evidence rather than assuming these defaults were used.

| Source path | Model IDs found in this checkpoint |
| --- | --- |
| Provider registry defaults (`electron/shared/providers/registry.ts`) | Anthropic `claude-opus-4-8`; OpenAI `gpt-5.6-luna`; Google `gemini-3.1-pro-preview`; OpenRouter `openai/gpt-5.6-luna`; Moonshot regional/global `kimi-k2.6`; SiliconFlow `deepseek-ai/DeepSeek-V3`; DeepSeek `deepseek-v4-pro`; MiniMax regional/global `MiniMax-M3`; Z.AI regional/global `glm-5.2`; Model Studio `qwen3.6-plus` |
| Configured models without one fixed registry default | Ark endpoint IDs, Ollama local model IDs and custom compatible accounts; any explicit account model or Agent Profile override |
| Morpheus curated planner choices (`provider-policy.ts`) | `gpt-5.6-luna`, `openai/gpt-5.6-luna`, `deepseek/deepseek-v4-flash-0731`, `openai/gpt-5.6-sol` |
| Voice service defaults | STT `whisper-1`; TTS `gpt-4o-mini-tts`, voice `cedar` |
| Voice presets | STT `gpt-4o-mini-transcribe` or `openai/whisper-large-v3-turbo`; TTS `gpt-4o-mini-tts` / `hexgrad/kokoro-82m` / `canopylabs/orpheus-3b-0.1-ft`; selected voices `cedar` / `am_onyx` / `leo` |
| Independent image plugin | `gpt-image-2` default, configurable compatible endpoint/model; generation and editing |

The path table describes the inherited baseline. Phase 5 adds correlated terminal
receipts and offline coverage reporting; see the [delivery record](MORPHEUS_PHASE5_DELIVERY.md)
for the remaining limits. In particular, model inventory is not proof that an
installed third-party skill cannot incur another service charge.

## Evaluation before switching models

Run the same versioned tasks with the current default and a stronger configured
baseline, using the same capabilities, context and consent state. Cover direct
navigation, file work, a multi-step website, background research plus a quick
app command, restart recovery, a clarification, provider failure, and spoken
follow-up/interruption. Record per task: actual verified result, first useful
action, first audio, corrections, extra prompts, handoff failures, total attempts,
and measured cost evidence. Keep human listening scores separate from automated
scores. Randomize order, repeat runs and retain failure cases. Do not claim a
cheaper route passes because its token price is lower.

Evidence labels: `live` means a real provider request with recorded provider
usage and bill reconciliation; `offline-fixture` means a mocked/local replay;
`estimate` means a cost calculation from documented rates and measured units.
Unknown amount remains unknown rather than zero. Do not run live paid trials
until a budget and providers are explicitly chosen. A BYOK budget can be
enforced only after every paid path is mediated or clearly excluded; provider
invoices remain the final source for actual charges.

## Windows acceptance still open

The Phase 4 source checkpoint did not certify the packaged app, microphone/wake,
neural voice listening choice, tray, registered app control, interruption/restart,
upgrade or release behavior on the user's PC. A single later Windows pass should
exercise these together with representative live cost and task-quality evidence.
