# Return to PC — 2026-09-28

Source branch: `codex/morpheus-phase6-managed-layer`.
Mac checkout: `/Users/mona/Documents/Work/Morpheus`.
The branch includes Phase 4, the Phase 5 accounting checkpoints, the Phase 6
foundation (`4fcde964`), and the subsequent desktop account integration.
Use the latest pushed branch tip; `4fcde964` alone does not contain today's work.

Later on 2026-09-28, the user requested smooth Siri-like motion alternatives. The
[three-option motion study and integration decisions](../design/MORPHEUS_MOTION_STUDY.md)
are included for review. The live app's animation has not been replaced by these
concepts; select and integrate the effect before claiming Windows acceptance.

## Interactive design checkpoint

The [experience guide](../design/MORPHEUS_EXPERIENCE_REVIEW.md) and
[portable browser experience](../design/morpheus-experience/index.html) cover the
newest requested direction: immersive Windows desktop, top-right animated orb,
hover-to-type composer, expanded task workspace, activity and preferences.
Open the HTML file from the fetched checkout on PC; no install/build is needed.
Use Experience → Opening for first use, or hover the desktop orb immediately.

The standalone Mac working source is
`/Users/mona/Documents/Work/morpheus-experience-preview`; the copy in this branch
is a portable checkpoint. Local Mac URL while its server runs:
`http://127.0.0.1:43830/`. This address is not remotely accessible from the PC.
For Larry, use the live [GitHub Pages experience](https://monaboss.github.io/Morpheus/).
It was published from `gh-pages`, which contains only static design files.
The earlier Sites publication attempt remained unavailable.

Verified in the browser: desktop hover and draft retention, quick request to full
workspace, file permission and undo, all five preferences tabs, activity
restoration, three motion selections, flowing desktop orb, reduced motion and
390px layout without horizontal overflow. Earlier full-journey checks covered
background work, offline/failure/retry, returning and speech interruption.
These are design checks; the Electron app has not adopted the new visual system.
Next on PC, integrate selected surfaces with real mic/task/voice state and verify
monitor/DPI placement, keyboard focus, resource use and all four locales.

## Mac checkpoint evidence

2026-09-28: full unit suite **2,828 passed, 17 skipped** (278 passing files,
3 skipped files). Seven skipped tests specifically require Windows; 10 skips are
inherited. Node/web/managed typechecks, build, communication replay/comparison and
harness validation/dry-run/CI pass. Full lint: zero errors, 12 existing warnings.
Six distinct Electron account/onboarding/voice scenarios passed; the three account
scenarios and onboarding were rerun against the final build. Hosted auth cases use
fixtures; unconfigured account UI uses real Main. No paid requests or real hosted
login occurred. Windows hardware and packaging remain untested on this Mac.

## Promised versus delivered

| Commitment | Delivered now | Still required |
| Realistic, interactive design and orb alternatives | Portable Windows-style experience, top-right hover composer, three animations and interface/state guide | Collect Larry’s feedback, integrate chosen visuals into Electron, and validate on PC |
| --- | --- | --- |
| Preserve the Windows companion direction | Approved M/orb/Matrix UI, typing and BYOK paths preserved; account controls added to Settings | Repeat real daily workflows on Windows; extend supported app adapters |
| Add Phase 6 without waiting for payment | Protected desktop account lifecycle, Google/email integration, allowance UI, durable ledger, authenticated gateway and runnable account service | Hosted setup, live login acceptance, evaluated model/voice routes, real trial lifecycle |
| Prepare a full-version plan | Ordered PC checklist and hosted runbook; readiness document covers coverage, evaluation, operations and release | Execute the recorded acceptance gates; Phase 5/6 are not fully accepted |
| Finish a tested Mac source checkpoint | Portable test fixes, onboarding/profile/quiet-mode fixes, passing validation and four-locale account UI | Windows-only tests, hardware, packaging and upgrade acceptance |
| Handle API pricing and payment | Versioned-rate/evaluation approach and prior published-price snapshot documented | Measure actual cost per successful task/voice minute; choose commercial pricing and payment provider later |

## Today's order

1. **Preserve and identify the PC checkout.** The historical path is
   `C:\Morpheus\morpheus-core`; verify it, the remote, branch and local changes.
   Do not reset, clean, overwrite the existing profile or assume an old installer
   represents this source. If the checkout is dirty or has divergent work, create
   a separate review worktree from the fetched branch and reconcile deliberately.
2. **Run the Windows source checks.** Install the pinned dependencies, generate
   the extension bridge, typecheck, lint, test, replay communication and build.
   The seven explicitly Windows-only drive-rooted tests skipped on Mac must run
   here. Record the exact commit, Windows version and all skips/failures.
3. **Accept the actual companion experience.** Start with the existing BYOK path
   and preserve the approved orb/Matrix interface. Run the checklist below on
   the user's hardware. Record actual results, not only automated test totals.
4. **Enable hosted identity when infrastructure exists.** Use the runbook below.
   Test Google and email sign-in, expiry, refresh, cancel and sign-out. Verify
   that provider accounts and local work survive. Account sign-in alone does not
   enable a managed model or grant a real trial.
5. **Complete Phase 5/6 with live providers.** Choose and evaluate bounded provider
   adapters, connect task/voice/OpenClaw paid paths and trial provisioning, measure
   usage/quality, and reconcile costs. Then connect the first-run real trial.
   Payment selection remains deferred by the user.

## Safe source pickup

Run inside the verified existing Git checkout in PowerShell:

```powershell
git status --short --branch
git remote -v
git log -5 --oneline
git fetch origin
git log -1 --oneline origin/codex/morpheus-phase6-managed-layer
```

If existing local work needs preserving, an isolated review checkout avoids
touching it (use an unused destination directory):

```powershell
git worktree add ..\morpheus-phase6-review origin/codex/morpheus-phase6-managed-layer
Set-Location ..\morpheus-phase6-review
```

This creates a detached review checkout. Create a development branch there before
making further changes. Do not blindly cherry-pick all checkpoints onto a branch
that already contains some of them. Review ancestry and local changes first.

```powershell
pnpm install --frozen-lockfile
node scripts/generate-ext-bridge.mjs
pnpm run typecheck
pnpm run lint:check
pnpm test
pnpm run comms:replay
pnpm run comms:compare
pnpm harness validate --spec harness/specs/tasks/morpheus-phase6-mac-completion.md
pnpm run build:vite
pnpm exec playwright test tests/e2e/morpheus-managed-account.spec.ts tests/e2e/morpheus-companion-missions.spec.ts tests/e2e/morpheus-wake-orb.spec.ts tests/e2e/morpheus-phase-3.spec.ts
```

Use the pnpm version pinned in `package.json`. Windows symlink tests may need
Developer Mode; record that dependency rather than weakening capability checks.
Git line-ending conversion can affect the harness frontmatter parser; retain LF
for specification Markdown if that known checkout issue appears.

## Windows acceptance record

For each row record pass/fail, commit, device/environment, and evidence or issue.

| Scenario | Expected observation | State before PC testing |
| --- | --- | --- |
| Fresh first use + existing profile | Name/preferences save; providers, grants, memory and history survive | Pending |
| Orb, compact, full, tray | Shared conversation/task state, no wake focus theft, correct monitor/DPI placement | Pending |
| Mic/headset changes + wake | Real activation success/false activations; muted mic stays muted; sleep/resume works | Pending |
| Voice audition and follow-up | Natural chosen voice, actual first audible response time, usable recognition | Pending |
| Interrupt speech + independent task | Audio stops promptly; selected task cancellation is distinct; research continues | Pending |
| Background research + app launch | Quick command remains responsive; foreground control is serialized correctly | Pending |
| Restart mid-task | Uncertain effects reconciled; completed actions are not blindly duplicated | Pending |
| Quiet mode, DND and profile edits | No unsolicited panel/focus; drafts and saved preferences behave correctly | Pending |
| Managed account without setup | Honest unavailable state; Basic/BYOK still works | Mac UI passed; Windows pending |
| Hosted identity configured | Google/email, cancellation, refresh and sign-out tested against the actual issuer | Hosted setup pending |
| Real managed trial | Evaluated model and speech routes, allowance and all charged paths agree | Not enabled |
| Package + upgrade | Correct source packaged, install/upgrade/uninstall checked without data loss | Pending |

Use `pnpm package:win` only after source checks, then test that newly built private
candidate. Signing, updates/rollback and public distribution remain separate
release gates; no public release is authorized or certified by this handoff.

## Hosted account setup runbook

No Supabase project, public endpoint or owner credentials were supplied during the
Mac work. The implementation is configurable and tested with local fixtures.
The following setup is required before claiming a live login:

1. Create/configure the chosen Supabase Auth project. Enable Google and email;
   configure the Google OAuth client in the provider console and Supabase. Keep
   Google secrets and all provider/service-role keys server-side.
2. Add the loopback return URL
   `http://127.0.0.1:43821/morpheus/auth/callback` to the Auth redirect allowlist.
   The app binds only `127.0.0.1`, adds a random state parameter and uses S256 PKCE.
   Test that the configured issuer preserves that query parameter. Another app
   occupying the port produces a sign-in failure; change both app configuration
   and the issuer allowlist together if necessary.
3. Set the email template to send the six-digit `{{ .Token }}` value. The app accepts
   an email code, not a magic-link callback. Configure real email delivery, allowed
   users and issuer-side rate/abuse controls before inviting users.
4. Run the account-only service on a persistent host behind HTTPS. Set
   `MORPHEUS_AUTH_ORIGIN`, `MORPHEUS_AUTH_PUBLISHABLE_KEY`, an absolute
   `MORPHEUS_LEDGER_PATH`, and optionally `MORPHEUS_MANAGED_PORT` (default 43820).
   Run `pnpm managed:serve`. It binds loopback; the TLS reverse proxy exposes the
   public endpoint. No auth bypass, automatic trial grant or inference route is
   installed. Do not use an ephemeral/serverless filesystem for this SQLite pilot.
5. Supply Electron Main's environment with `MORPHEUS_MANAGED_ORIGIN` (HTTPS service
   origin), `MORPHEUS_AUTH_ORIGIN`, `MORPHEUS_AUTH_PUBLISHABLE_KEY`, and optionally
   `MORPHEUS_AUTH_CALLBACK_PORT` (43821). `.env.example` documents the names; do not
   assume a packaged app loads a shell `.env` automatically. A production installer
   needs a reviewed deployment-configuration mechanism before public distribution.
6. Open Settings → Morpheus account. Try Google and email separately, cancel a
   browser flow, restart after login, exercise token refresh and sign out during
   an in-flight response. No token should appear in renderer status or logs.
   An authenticated new user currently sees Basic/no managed allowance.

Sessions are scoped to auth + service origins and stored with Electron safeStorage,
separately from existing BYOK accounts. The Mac encryption boundary was unit-tested
with real authenticated encryption, but real Keychain/DPAPI access still needs
configured sign-in acceptance. Linux plaintext fallback is refused. Local logout
clears tokens immediately; remote revocation is best effort during an outage and
already issued access tokens remain subject to the issuer's expiry behavior.

Official integration references: [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[Auth API schema](https://github.com/supabase/auth/blob/master/openapi.yaml).

## Remaining work after this Mac checkpoint

- Live identity/deployment acceptance and production configuration delivery.
- Evaluated provider adapters with versioned bounded rates; streamed STT/TTS and
  task/voice/OpenClaw integration through the ledger. No complete global spend cap
  is claimed while independent paid routes remain outside it.
- Trial eligibility/grant lifecycle, account deletion, revocation policy, quotas,
  reconciliation jobs, backup/restore, service-wide limits and operations.
- Broader Windows app-control adapters backed by a supported-workflow matrix.
- Payment provider, subscription transitions, refunds and commercial pricing
  after the business country and measured unit costs are known.
- Windows acceptance, packaging/signing/update/rollback and release approval.

These are the named remaining parts of the full version. “Mac checkpoint complete”
means the tested code and handoff are ready to bring to PC; it does not mean every
portable future feature or Phase 6 has been completed.
