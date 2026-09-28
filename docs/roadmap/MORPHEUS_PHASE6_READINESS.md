# Phase 6 readiness, implemented foundation, and full-version path

Updated 2026-09-28. Active Mac checkout: `/Users/mona/Documents/Work/Morpheus`.
Branch: `codex/morpheus-phase6-managed-layer`, based on Phase 5 `baa7709f`.

The user authorized adding the layer now, with no stated evaluation spending
limit and payment selection deferred. This checkpoint adds the payment-independent
source foundation and a configurable desktop account connection. It does not provision accounts, spend on providers, enable
an unlimited public trial, or mark Phase 5/6 accepted.

## Direction and readiness

Keep **Morpheus — your Windows companion**: approved M/orb, Matrix atmosphere,
natural conversation, real actions, remembered preferences and concurrent work.
“Windows Siri” is the interaction goal; Morpheus retains its own identity.
The necessary shift is toward dependable daily workflows and measured acceptance.
Another visual redesign is not the dependency for Phase 6.

We can build Phase 6 contracts and services while closing Phase 5 evidence gaps.
We cannot promise managed allowance enforcement for a route that bypasses the
gateway, or choose a production model/retail price from fixture results.

| Area | Source evidence | Readiness consequence |
| --- | --- | --- |
| Desktop execution | `shared/morpheus/actions/registry.ts` has 22 registered actions | Useful foundation; app launch is not general application control |
| UI/companion | Approved onboarding, orb/compact/full, task continuity and local profile | Preserve presentation; connect account/allowance states contextually |
| Existing accounts | `electron/services/providers/`, `electron/utils/browser-oauth.ts` | These are provider accounts, not Morpheus identities/subscriptions |
| Secrets | `electron/services/secrets/secret-store.ts` writes provider secrets and legacy API keys to electron-store | Do not put hosted session tokens there; broader BYOK/runtime secret migration remains separate work |
| Phase 5 | Correlated Core/STT/TTS receipts and offline reducers | Not an authoritative billing ledger; live quality and complete BYOK currency caps remain open |
| Windows evidence | Mac builds/tests do not exercise the user's PC | Real wake/audio, tray, app control, upgrade and installer acceptance remain mandatory |

## What this checkpoint implements

- `shared/morpheus/managed-types.ts`: account, session, feature, allowance and receipt
  contracts. Local provider identity is separate from hosted identity.
- `services/managed/ledger.ts`: persistent SQLite transactions, one-time trusted
  account provisioning, feature/expiry checks, micro-USD integer allowances,
  reservation, dispatch ownership, settlement and append-only accounting events.
  Separate connections share the same balance. Restart does not release pending
  or uncertain spend. Grants and settlements are idempotent; conflicts fail.
- `services/managed/gateway.ts`: authenticated Fetch API handler for account status,
  execution and receipts. Only server-registered routes can run. Client-supplied
  account, price, tier, endpoint and extra envelope fields are rejected. Provider
  idempotency keys include account identity. Output/error size and time are bounded.
- `services/managed/identity.ts`: configurable Supabase Auth user verification over
  HTTPS. Identity is verified with the issuer, not inferred from unverified JWT
  claims or a desktop profile. Google/email issuance must still be configured.
- `electron/services/morpheus/managed/`: Main-only client and protected session-store
  boundary. Separate encrypted storage, no plaintext downgrade, explicit missing/
  expired/unavailable states, no automatic retry or BYOK switch, and stale responses
  discarded after local sign-out/account changes.
- Dedicated server typecheck and focused tests, plus a durable harness rule/spec.

The 2026-09-28 checkpoint connects Settings → Morpheus account through the typed
host API to Main-owned Google PKCE/email-code sign-in, refresh, cancellation and
sign-out. Main uses Electron safeStorage and origin-scoped session files. All four
locales are covered; missing deployment configuration stays explicitly unavailable.
`pnpm managed:serve` now starts the account-only HTTP service on loopback when its
required environment is supplied. Deploying it behind HTTPS remains owner setup.

The first-run real trial, Core planner, voice and OpenClaw managed inference are
**not connected**. No provider route is installed by default and no account receives
an automatic grant. Existing BYOK behavior remains unchanged. Use the
[PC return and hosted setup runbook](MORPHEUS_PC_RETURN_2026-09-28.md).

## Service contract and accounting rules

Implemented service composition (HTTPS deployment pending): HTTPS host → `createManagedGateway` → verified identity →
server route/quote → `ManagedLedger` → bounded provider adapter. The desktop uses
Main → managed client; the renderer continues through the existing host API.
The gateway returns model data, never OS authority. Typed local plans, permission
checks and verification still govern execution on the PC.

| Endpoint | Behavior |
| --- | --- |
| `GET /v1/account` | Current identity's entitlement, remaining/held/spent allowance; no session/provider secrets |
| `POST /v1/execute` | Strict `{requestId, objectiveId?, route, input}`; route-specific input parser; server quote and reservation before dispatch |
| `GET /v1/requests/:id` | Current identity's durable receipt; other accounts receive not-found |
| `/v1/billing/checkout`, `/v1/billing/portal` | Explicit `billing_not_configured`; no pretend checkout or paid entitlement |

Amounts are integer micro-USD (1 USD = 1,000,000 units). Quotes must bound the entire
adapter operation, including retries, tools, reasoning/output and speech. A null
usage amount stays reserved. A timeout/cancellation after dispatch may still be
charged; there is no automatic refund or resend. A trusted reconciler may settle
later using evidence. Undispatched work can be explicitly released.

Duplicate completed requests return the receipt without re-execution. Raw outputs
are not stored for replay; clients must not silently create a new request ID to
recover a lost response. A future content store requires its own retention policy.
Rate estimates, provider-reported amounts and reconciled costs are labeled
separately. Adapter-supplied usage is not automatically an invoice. If assessed
cost exceeds the reservation, preserve the larger provider exposure, charge no
more than the reserved user allowance, and freeze managed access for review.

The initial ledger supports one provisioning grant per account. Renewal, top-ups,
refunds, subscription transitions and revocation policy belong to the later
payment/entitlement work; a second grant currently fails explicitly. Never use
`grant()` as a public endpoint or let a client assign its own tier/allowance.

SQLite is for a single persistent service host/local-volume pilot. Transactions
coordinate multiple connections/processes on that host. It is not a multi-host
or serverless ephemeral-file design. Before horizontal deployment, move these
invariants into tested Postgres transactions. Use Node with `node:sqlite` support
(tested here on Node 22.22.2, where SQLite emits an experimental warning).

## Next implementation slices

1. **Accept configured identity and connect a real trial.** Google PKCE with a
   loopback callback, email OTP, refresh, local sign-out, protected storage and
   Settings UI are implemented and fixture-tested. Configure the actual issuer,
   email delivery and service, then test live sign-in and Keychain/Windows DPAPI
   behavior. Account deletion, production configuration delivery and the accepted
   welcome → sign-in → real trial flow remain open; onboarding must not promise a
   trial before provider routes and eligibility/grant controls exist.
   [Official PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
2. **One measured managed vertical slice.** Install a bounded conversation/planning
   route plus actual STT/TTS routes, including voice auditions. Pin server model,
   credentials, versioned rates and per-request maxima. Prove one real task and
   natural spoken response with its receipt. Stream audio with bounded incremental
   reservations before claiming the existing streaming experience is connected.
3. **Complete supported-path coverage.** Route managed Core, OpenClaw chat/agents,
   cron and speech through the same authority. Add image/tool/validation charges
   explicitly. Unsupported managed services stay unavailable; preserve explicit
   BYOK access and do not silently spend from another account. Correlate task and
   speech IDs. Test outage, retry, duplicate dispatch, restart and reconciliation.
4. **Pilot operations.** Deploy behind HTTPS with persistent storage; add backup and
   restore, per-account/device admission limits, verified trial eligibility,
   revocation, reconciliation jobs, operational logs without content, service-wide
   spend controls, and an operator kill switch. Test tenant isolation and abuse
   controls. No public trial until these are operational.
5. **Payment later.** Select an eligible provider when the business country is known.
   Add hosted checkout/account portal and verified, idempotent payment events.
   Reconcile against current subscription state; do not order events by arrival or
   trust a browser success page. Stripe, as an example rather than a selected
   provider, explicitly documents unordered and duplicate events.
   [Official webhook guidance](https://docs.stripe.com/webhooks).
6. **Windows acceptance and release.** Clean install and upgrade without losing
   providers/tasks/grants/memory; actual mic/wake/voice auditions, interruption,
   sleep/resume, multi-monitor/DPI, tray, concurrent foreground actions and recovery.
   Then signing, update/rollback and distribution. Public managed release requires
   the above live service gates; an internal BYOK candidate can be reviewed earlier.

Optional selected-memory sync follows account deletion/conflict handling; keep
memory local by default. NerdGPT and other platforms remain later milestones.

## Broader Windows capabilities and UI/UX

Make a supported-workflow matrix, not a promise to control every Windows app.
Start with repeated acceptance of launch/navigation, file organization, reminders,
clipboard, screenshots, research and background work. Next add typed adapters for
window management, audio/media and selected settings, then browser/productivity
workflows and named app integrations. Each row needs an actual target app/version,
permission scope, verification, cancellation/recovery behavior and Windows evidence.

Prefer documented OS/app APIs, then browser DOM or Windows UI Automation; reserve
visual interaction for tested fallback cases. Coordinate foreground input and
check that the target window is still correct before acting. UI Automation is
subject to Windows integrity/privilege restrictions, so it is not a bypass around
UAC or every protected desktop. [Microsoft security guidance](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-securityoverview).

Keep the orb interaction short: listening → working → verified result. Add only
the account, allowance and recovery states needed for decisions. Trial exhaustion
offers an explicit BYOK choice; payment appears when configured. Preserve typing,
keyboard accessibility, reduced motion, no focus theft and task continuity. Exact
UI additions require tests and all four existing locales, not a replacement dashboard.

## API pricing and evaluation

Published price snapshot retrieved 2026-09-27; these are candidates, not selected
production routes or evidence of Morpheus performance. OpenAI lists standard,
short-context input/output prices per million tokens of $0.10/$0.50 for GPT-6 Luna,
$2/$10 for GPT-6 Sol and $10/$50 for GPT-6 Astra. It estimates
`gpt-4o-mini-transcribe` at $0.003/minute. GPT-Live sessions are $0.05/minute with
backend model/tool usage billed separately. The existing TTS route is not thereby
priced or migrated. [Official API pricing](https://developers.openai.com/api/docs/pricing).

Store rates with model/version, modality, context tier, processing tier, effective
date and source. Measure cost per successful task and active voice minute, including
failed attempts, long context, tools, images, STT/TTS, hosting and payment/support
overhead. Compare matched tasks against a stronger baseline and audition voices on
Windows. Choose allowances and subscription amounts from those measurements;
“no limit” for owner evaluation does not specify an unlimited per-user trial.

## Acceptance and evidence boundary

The focused checks exercise persistent holds, separate connections, duplicate and
conflicting IDs, tenant separation, identity verification, expiry, cap violations,
unknown usage, timeout, cancellation, plaintext refusal, protected session restart,
and stale responses after local sign-out. Fixture prices/outputs are test data.

Validation on this Mac, 2026-09-28: full unit suite **2,828 passed, 17 skipped**;
all node/web/managed typechecks pass; full ESLint passes with zero errors and 12
existing Fast Refresh warnings; harness validation/dry-run/CI and communication
replay/comparison pass; renderer/Main/preload build passes with inherited bundle
warnings. Six distinct Electron scenarios passed: account UI (3), existing voice
playback/availability (2), and onboarding/profile editing (1). Account/onboarding
were rerun against the final build. UI auth uses controlled host fixtures; the
unconfigured account case exercises real Main.

The prior nine Mac failures are resolved through two canonical-path expectations
and explicit platform guards on seven Windows drive-rooted tests. Those seven
must run on PC; no Windows capability implementation was weakened or ported.
The prior four UI lint errors are fixed, including transcript/draft state handling
and quiet-mode prompt behavior. The remaining 10 skips predate this checkpoint.

No paid calls, public deployment, checkout, live login, production provider choice,
Windows hardware acceptance or full Phase 5/6 completion is claimed. Historical
baseline results remain in [Phase 5 delivery](MORPHEUS_PHASE5_DELIVERY.md); current
acceptance steps and remaining scope are in the [PC runbook](MORPHEUS_PC_RETURN_2026-09-28.md).
