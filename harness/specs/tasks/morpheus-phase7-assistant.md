---
id: morpheus-phase7-assistant
title: Morpheus Phase 7 assistant architecture and delivery contract
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Finish the companion through small verified checkpoints without replacing existing runtime authority or mistaking source design for packaged acceptance.
touchedAreas:
  - docs/**
  - harness/**
  - SOL_START_HERE.md
  - PC_CODEX_START_HERE.md
  - CLAUDE.md
  - README*
  - shared/**
  - electron/**
  - src/**
  - resources/morpheus-orb/**
  - services/managed/**
  - tests/**
  - scripts/**
  - .github/**
  - electron-builder.yml
  - vite.config.ts
  - package.json
  - pnpm-lock.yaml
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - ui-i18n-design-tokens
  - morpheus-production-companion-safety
  - morpheus-task-continuity
  - morpheus-managed-authority
  - morpheus-phase7-assistant-contract
expectedUserBehavior:
  - Bottom-right presence stays quiet and ordinary conversation remains compact until the user expands.
  - Existing work, providers and capabilities survive; real task results and costs remain distinguishable from plans or fixtures.
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm test
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run harness:ci
acceptance:
  - Surface changes preserve conversation, task and draft identity and never create separate execution authority.
  - A real editable native composer, actual voice and worker evidence are required for corresponding feature claims.
  - Source, fixture, native automated, hardware and live service acceptance are recorded separately.
  - Existing provider secrets migrate without loss or plaintext fallback before distribution.
  - Public managed and signed release gates cannot be closed by an internal BYOK source build.
docs:
  required: true
---

Umbrella contract, not permission for one giant patch. The 2026-09-30 Astra pass
changes documentation only. Runtime implementation creates a narrow child task
spec for the active row in docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md, preserving
these rules and adding focused tests. Required tests here describe implementation
and candidate gates; they are not claimed run for a docs-only change.

Reference: harness/reference/morpheus-phase7-assistant.md.
