---
id: morpheus-phase5-accounting
title: Morpheus Phase 5 routing and usage evidence
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Preserve task ownership and record correlated bounded provider and voice outcomes for offline quality and cost evaluation without claiming a complete paid-service cap.
touchedAreas:
  - electron/services/morpheus/**
  - electron/services/providers/provider-validation.ts
  - shared/morpheus/**
  - tests/unit/morpheus-**
  - tests/unit/provider-validation.test.ts
  - scripts/phase5/**
  - docs/**
  - harness/specs/tasks/morpheus-phase5-accounting.md
  - harness/specs/rules/morpheus-phase5-evidence.md
  - harness/specs/scenarios/gateway-backend-communication.md
  - README.md
  - README.zh-CN.md
  - README.ja-JP.md
  - README.ru-RU.md
expectedUserBehavior:
  - An objective keeps its selected provider and model while bounded retries and reviews run.
  - Existing voice and direct actions remain available and failures have inspectable usage evidence.
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-phase5-evidence
requiredTests:
  - pnpm run typecheck
  - pnpm run lint:check
  - pnpm exec vitest run tests/unit/morpheus-provider-planner.test.ts tests/unit/morpheus-planner-selector.test.ts tests/unit/morpheus-voice-service.test.ts tests/unit/morpheus-audit.test.ts tests/unit/morpheus-usage-evidence.test.ts tests/unit/provider-validation.test.ts
  - node --test scripts/phase5/evaluate.test.mjs scripts/phase5/usage-report.test.mjs
  - pnpm run comms:replay
  - pnpm run comms:compare
  - pnpm run build:vite
acceptance:
  - Task route ownership cannot change through mutable account objects or cross-objective planner reuse.
  - Requests retain bounded attempts and output even after failure or cancellation.
  - Usage records correlate starts and terminal outcomes without retaining content or credentials.
  - Missing usage, unknown costs and unobserved paths never become zero spend or a complete cap.
  - Offline fixtures cannot choose the production model or establish Windows hardware acceptance.
docs:
  required: true
---

See docs/roadmap/MORPHEUS_PHASE5_COST_PATHS.md and
docs/roadmap/MORPHEUS_PHASE5_EVALUATION.md. Paid evaluations require a separately
specified budget. The approved interface, model defaults and voice choice remain
governed by the Mac handoff and later measured acceptance.
