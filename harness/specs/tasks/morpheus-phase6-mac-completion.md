---
id: morpheus-phase6-mac-completion
title: Connect the managed account layer and prepare PC acceptance
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Complete credential-independent desktop identity integration and session lifecycle on Mac, fix verified portable validation gaps, and leave an exact Windows handoff.
touchedAreas:
  - electron/**
  - shared/**
  - src/**
  - services/managed/**
  - tests/**
  - scripts/**
  - harness/specs/**
  - docs/**
  - README*
  - CLAUDE.md
  - .env.example
  - package.json
requiredProfiles:
  - fast
  - comms
  - e2e
expectedUserBehavior:
  - Settings reports hosted setup honestly and offers Google or email sign-in when configured.
  - Managed sign-out removes only the hosted session and late authentication cannot restore it.
  - Existing onboarding and BYOK remain usable before hosted service provisioning.
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-managed-authority
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm test
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run build:vite
  - pnpm exec playwright test tests/e2e/morpheus-managed-account.spec.ts
acceptance:
  - Session credentials never cross the host boundary or appear in account status.
  - Browser authorization uses single-use PKCE and loopback callback binding with cancellation and expiry.
  - Concurrent refresh is single-flight and stale auth results cannot cross sign-out/account changes.
  - Unconfigured hosted service never claims a real login or trial.
  - Mac evidence and remaining hosted/Windows gates are documented separately.
docs:
  required: true
---

Payment is deferred by user direction. Real hosted credentials, provider-route
evaluation and Windows hardware acceptance are external setup/device gates, not
reasons to leave the portable code unconnected.
