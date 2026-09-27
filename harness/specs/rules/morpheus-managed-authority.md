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
