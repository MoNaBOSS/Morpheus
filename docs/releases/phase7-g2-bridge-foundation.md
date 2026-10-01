# Phase 7 G2 — managed bridge foundation, not runtime acceptance

2026-10-01. Preserve this work; do not mark G2 complete or advertise live Premium.

The existing managed service has fixed server-configured text/STT/TTS adapters,
required model/rate/maximum configuration, pre-dispatch reservations and durable
correlated receipts. Cancellation/malformed responses retain uncertain usage;
duplicate requests never repeat provider work. STT validates canonical bounded
PCM16 WAV duration from its bytes. TTS streams PCM24k with a final receipt.
Missing configuration does not invent models, prices, a trial or credentials.

Main's managed client and runtime bridge validate correlation and session
generation, bounded frames, final receipts and cancellation. Explicit persisted
BYOK/managed choice is distinct from login; the bridge getter returns null only
for BYOK. Invalid/corrupt managed configuration fails closed at this bridge.

IMPORTANT: planner, conversation-history owner and voice-service composition do
not yet consume this getter. Renderer capture/playback needs bounded PCM/WAV
integration. Do not claim application-wide no-fallback enforcement before these
joins and their negative tests exist. Service-mode UI must remain unavailable
for normal use until runtime wiring is complete. Existing Basic/BYOK stays intact.

Adapter/ledger/client tests pass in the combined source suite. Three fresh
Electron account regression journeys pass with unconfigured Main or synthetic
identity responses; they do not prove a paid managed operation or service-mode
runtime integration. No external server/domain/payment account is provisioned.
User chose Stripe and crypto; business payment country remains unspecified.
