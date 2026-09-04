# Public release gates

Status: NOT APPROVED FOR PUBLIC RELEASE. This checklist is evidence, not a
marketing roadmap. No hosted billing or pricing screens are part of this work.

## Locally verifiable gates

- Full unit suite, typecheck, lint, harness and communication replay/compare.
- Real Electron journeys for arrival, voice setup/recovery, trust, execution,
  route continuity and unavailable updates.
- Dependency advisory review, including separately bundled OpenClaw/plugin trees.
- Windows package built from a committed source and hashed after final signing.
- Exact packaged executable startup, gateway readiness and process cleanup.
- Untracked artifacts, screenshots, credentials and profiles excluded from Git.

## Independent release gates (must not be replaced with test fixtures)

1. Valid planning/STT/TTS provider credentials configured locally. The last real
   speech probe returned HTTP 401. A configured key is not verified access.
2. Real microphone/accent tests: transcription, interruption, background capture,
   quiet/noisy rooms, repeated commands, mute and shutdown. Capture stays opt-in.
3. A real website objective with provider-side usage reconciliation. Current Core
   request/output limits are not a currency budget. Independent OpenClaw Chat
   loops and other clients of the same key are outside that budget. Do not make
   whole-product cost guarantees before this boundary is addressed and tested.
4. Morpheus-owned signing credentials and approved publisher identity. Verify
   both installed executable and installer trust; outer-installer signing alone
   does not establish inner-binary trust. Never use inherited ValueCell identity.
5. Clean Windows 10/11 x64 installation, upgrade with existing profile, uninstall
   keep-data/remove-data choices, and reinstall. Do not erase a developer profile
   to simulate a clean machine. Use a disposable VM or independent device.
6. Owned release/support destination, privacy/data-handling policy and review of
   the cloud audio disclosure. Legal review belongs to the product owner.
7. Signed-update endpoint and exact-artifact update verification before enabling
   auto-update. Until then retain the truthful not-configured state and use
   manually downloaded, verified installers.

## CI signing configuration (names only)

Secret: `SIGNPATH_API_TOKEN`.
Repository variables: `MORPHEUS_SIGNPATH_ORGANIZATION_ID`,
`MORPHEUS_SIGNPATH_PROJECT_SLUG`, `MORPHEUS_SIGNPATH_POLICY_SLUG`.
No values belong in this repository or in chat. CI requires these for stable tags.
Tagged builds create drafts; publication is a separate owner-reviewed action.

Never describe a locally green suite, unsigned build, mocked voice error or
unreconciled cost estimate as passing these independent gates.
