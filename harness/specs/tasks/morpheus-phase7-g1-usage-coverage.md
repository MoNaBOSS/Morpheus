---
id: morpheus-phase7-g1-usage-coverage
title: Preserve known managed charges and expose remaining usage gaps
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Aggregate only supplied evidence without turning unknown provider spend into zero or a complete spending cap.
touchedAreas:
  - scripts/phase5/usage-report.mjs
  - scripts/phase5/usage-report.test.mjs
  - harness/specs/tasks/morpheus-phase7-g1-usage-coverage.md
  - harness/specs/rules/morpheus-managed-authority.md
  - docs/releases/phase7-g1-usage.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - morpheus-managed-authority
  - docs-sync
requiredTests:
  - node --test scripts/phase5/usage-report.test.mjs
expectedUserBehavior:
  - Managed settled charges are separate from BYOK estimates and unknown spend.
acceptance:
  - Cancelled transcription is counted rather than disappearing.
  - Contradictory or uncorrelated amounts never count as settled charges.
  - No supplied prompt audio credentials or raw request identifiers enter the report.
  - Incomplete paths and live economy qualification remain explicit.
docs:
  required: true
---

G1.1 is an offline evidence reducer checkpoint, not all-paid-path qualification.
Retain the existing report shape additively. No new provider calls or price tables.
