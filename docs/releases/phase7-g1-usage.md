# G1 usage coverage — incomplete qualification

2026-10-02, G1.1 after voice checkpoint `c26b2629`.

The existing offline usage report now recognizes matched settled managed charges
from Core/STT/TTS audit receipts. It reports these in integer micro-USD separately
from OpenClaw runtime cost estimates. A verified settled zero is distinct from an
unknown cost. Started/terminal owner and route metadata must match; conflicting
cost/rate evidence or missing started evidence cannot count as settled currency.
Cancelled transcription is now counted (previously its event did not match the
report filter). No prompt, audio, credentials or raw request identity is returned.

`node --test scripts/phase5/usage-report.test.mjs`: **10/10 pass**. Added coverage
includes out-of-order settled receipts, actual zero, cancelled input, uncertain
output, contradictory amounts/rates/owners and malformed/wrong-route currency.
Only explicitly supplied files are read. No provider requests or pricing lookup.

This is **not full G1 completion**. The reducer retains `completeSpendingCap:false`
and `totalBilledCostUsd:null`; it cannot certify missing/deleted logs or unobserved
provider validation, images, plugins/external services or background runtime work.
G2.3 managed ACP conversation still needs its runtime adapter. Matched live
economy/strong model qualification needs an identified account and bounded budget;
none was spent or inferred. Existing default model choices are unchanged.

Next release work follows the roadmap's non-blocking Larry/BYOK order: H native
failure/performance checks and I fresh Windows candidate. G2.3 and live managed
G3/G4 remain explicit, mandatory gates for a managed-ready product. A BYOK candidate
must not be marketed or handed off as the complete managed product.
