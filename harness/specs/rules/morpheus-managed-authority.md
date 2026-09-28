---
id: morpheus-managed-authority
title: Managed identity and allowance authority
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Managed entitlement, price bounds and balances are server-owned. A desktop
account/provider object is not proof of subscription. Authenticate each request
and bind idempotency to account, operation and request content. Commit reservation
and dispatch state before provider work. Never automatically release uncertain
dispatched spend, replay a dispatched request, or switch to BYOK on exhaustion.
Reject unpriced/unmediated managed routes. Keep provider credentials and raw
prompts/audio out of the allowance ledger. Payment return pages cannot grant
entitlements. Fixtures do not establish live model, billing or Windows acceptance.

Desktop hosted sessions stay in Main and encrypted with OS-backed safeStorage,
scoped to auth/service origins; never expose tokens in host status or renderer
storage. Google callback exchange must require the originating S256 verifier and
validated loopback state. Verify email codes with the configured HTTPS issuer.
Refresh is single-flight; sign-out/cancellation invalidates stale async results.
Missing configuration or plaintext storage must fail closed without breaking BYOK.
Mock auth is test-only and must not become a production fallback. Test account UI
in Electron and preserve four-locale coverage. Windows drive-rooted fixtures run
on Windows; explicit Mac skips cannot establish Windows acceptance.
