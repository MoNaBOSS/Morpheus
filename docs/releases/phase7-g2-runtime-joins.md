# G2 runtime joins — ongoing, not live Premium

2026-10-02, after F2 `068dc9c2`.

## G2.1 planner

Main now supplies the existing managed runtime getter to the existing Core planner
selector. Direct/local and explicitly deterministic work stay local. Explicit
managed mode resolves before any BYOK account/key enumeration. BYOK's current
protocols, profiles, context and behavior are retained.

Managed and BYOK use one typed plan/review factory: same permitted capabilities,
untrusted observation treatment, source/citation review and strict JSON parser.
The managed adapter pins one objective and service generation, chooses a logical
planning/complex route and permits at most four calls / 12,288 reserved output
tokens / 48,000 prompt characters. Failed attempts count; no automatic personal
key or alternative-route fallback. The server owns actual models, rates and caps.

Started audit precedes dispatch; completion records real model/token counts,
request/objective correlation and receipt amounts/rate evidence. Failed or
cancelled unknown usage remains unknown. Receipts do not certify task success.
Logout/mode invalidation now aborts text/STT requests and prevents late session
resolution from dispatching; streamed speech also checks before dispatch.

**47 focused tests pass**, including the actual authenticated gateway/ledger/
provider-route implementation with injected provider responses, strict authority,
review, budgets, missing owner, audit failure and no-BYOK-fallback. Node typecheck
passes. All three typechecks, zero-error scoped lint, communications and diff-aware
harness validation/dry-run pass. Three fresh-build account regression journeys
pass in 10.7 seconds (missing configuration, fixture sign-in/out and cancellation).
These do not establish live or conversation/voice integration. No hosted account
or paid provider was used.

## Next exact work

G2.2: connect the same Main voice service to the bridge; bounded PCM16 WAV conversion
at the existing renderer capture owner and PCM24k playback at the current speech
owner, correlated usage/cancellation. G2.3: preserve the existing ACP conversation/
history owner when routing managed conversation. Do not create a parallel chat
history or pretend a planning endpoint replaces OpenClaw tools.

`runtimeReady` deliberately remains **false** until these remaining joins and
negative tests pass. G1 full paid-path coverage/economy qualification and G3/G4
deployed identity/trial/billing remain open. No final installer claim.
