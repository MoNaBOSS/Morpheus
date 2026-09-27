# Phase 5 evaluation protocol

Version 1, 2026-09-27. The reducer is offline and never starts paid requests:

```sh
node --test scripts/phase5/evaluate.test.mjs
node scripts/phase5/evaluate.mjs /absolute/path/to/evidence.json
```

Use a small candidate set: the existing configured route, one stronger configured
baseline, and at most one proposed economy route. Model availability, prices and
voice quality have not been verified in this checkpoint. Choose concrete accounts,
a currency budget, attempt limits and stopping rules before running paid trials.
Do not change defaults from offline fixture scores.

## Matched cases

Run each case at least three times per variant in randomized order. Use identical
source revision, capabilities, context, profile/memory and consent state. Retain
failures and timeouts. Compare each case and aggregate results; small samples are
screening evidence and need more runs if results disagree. The owner must accept
the quality/latency tradeoff before enabling a new route.

| Case ID | Request/journey | Success evidence |
| --- | --- | --- |
| direct | Open YouTube / a registered installed app | Actual launch; zero model planning requests; no repeated routine consent |
| routine | Create and read a workspace note | Correct artifact and observed result; no invented content or authority |
| complex | Build the supported local business website | Files and `site.verify` pass; no fabricated deployment or research |
| concurrent | Research continues while a quick app command executes | Both task identities and results preserved; no lost context |
| handoff | Provider failure then bounded allowed fallback | Correct context, ownership and persona; no repeated completed effects |
| clarify | Deliberately ambiguous file request | One useful question before a potentially wrong action |
| recovery | Interrupt/restart after one completed effect | Completed effect retained; uncertain side effects need review |
| voice | Wake → command → spoken result → follow-up → interrupt | Human listening acceptance, acoustic timing, no stale audio restart |
| personality | Same factual result with selected humour and memory | Facts unchanged; requested tone; deleted memory stays absent |

Measure time from submitted request (or end of speech) to first useful observed
action and first **audible** output. Provider round-trip and first received audio
byte are diagnostics, not substitutes for those end-to-end timings. Record
corrections and handoff failures from observed outcomes, not a model's self-score.
Sum all attempts and paid paths, including failed/cancelled calls and previews.
Reconcile provider-reported cost with the bill before calling it actual billed cost.

## Evidence file

Top level: `{ "schema": "morpheus.phase5.evaluation.v1", "runs": [...] }`.
Each run requires the fields below. Identifiers use letters, digits, `.`, `_`, `:`
or `-`; keep private prompts, transcripts, audio and credentials out of this file.

```json
{
  "runId": "example-only",
  "caseId": "routine",
  "variantId": "current",
  "contextId": "same-bounded-context-v1",
  "sourceRevision": "record-git-sha",
  "evidence": "offline-fixture",
  "evidenceRef": "Describe the fixture or point to locally retained observed evidence",
  "outcome": "blocked",
  "firstUsefulActionMs": null,
  "firstAudioMs": null,
  "corrections": 0,
  "handoffFailures": 0,
  "attempts": 0,
  "costs": [{ "path": "core", "amountUsd": null, "basis": "unknown", "reference": "No provider request measured" }],
  "unobservedPaths": ["openclaw", "stt", "tts", "validation", "external-services"]
}
```

`evidence` is `offline-fixture` or `live`; `outcome` is `success`, `failure` or
`blocked`. Costs require a provenance reference and basis: `provider-reported`,
`runtime-estimate`, `verified-no-charge`, or `unknown`. Unknown amount is null.
Use `verified-no-charge` only for a proven local/no-inference path, never for a
model whose price metadata defaults to zero. A cost estimate must retain its rate
source/date outside the reducer; this tool contains no price table or FX conversion.

The report groups evidence/context/revision separately, shows missing timing
counts and case coverage, and withholds cost per success when any cost/path is
unknown. Cost per success includes failed-run spend. It does not automatically
choose a model, enforce a currency budget, prove statistical equivalence or certify
Windows behavior. Actual live evidence remains pending an authorized budget.

## Usage coverage report

On Node 24, explicitly supply the local audit and transcript files to review:

```sh
node scripts/phase5/usage-report.mjs --audit /absolute/path/to/audit.jsonl --transcript /absolute/path/to/session.jsonl
node --test scripts/phase5/evaluate.test.mjs scripts/phase5/usage-report.test.mjs
```

Repeat either flag for additional files (including retained rotations). Files are
read locally; the tool does not discover credentials, start providers or modify
profiles. Canonical duplicate file paths are counted once. Copied transcripts are
separate sources: supply each logical transcript once. Input files are limited to
64 MiB each; use a bounded export for larger histories. Output contains aggregate
counts only, never transcript content, prompts, audio or provider error bodies.

Core/STT/TTS receipt IDs join starts to terminal outcomes, including failures and
cancellation. Legacy events without IDs, torn lines, missing starts/completions
and conflicting receipts are counted explicitly. OpenClaw assistant/tool usage
uses the existing parser; absent or zero price metadata stays unknown. Its cost
subtotal is labelled a runtime estimate and cannot be combined with a provider
invoice as if it were verified billed spend. Image generation/editing, validation,
plugin services and work outside retained transcripts remain coverage gaps.

Audit retention is 30 days and transcript deletion removes historical evidence.
This report is a useful accounting preparation tool, not a durable billing ledger
or a global budget. Runtime currency reservations require verified pricing,
durable reconciliation and interception of all paid paths. No currency control is
enabled by this checkpoint. The existing per-planner four-request/12,288 reserved
output-token bounds still apply; they do not cap STT, TTS or OpenClaw spend.
