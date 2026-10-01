---
id: morpheus-phase7-profile-continuity
title: Preserve customized agents while upgrading untouched released starters
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Match complete historical starter profiles before updating their capabilities, retaining customized planner and permission choices.
touchedAreas:
  - electron/services/morpheus/agents/**
  - tests/unit/morpheus-agent-profiles.test.ts
  - harness/specs/tasks/morpheus-phase7-profile-continuity.md
  - harness/specs/rules/morpheus-native-action-safety.md
  - docs/releases/phase7-profile-continuity.md
  - SOL_START_HERE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - morpheus-native-action-safety
  - backend-communication-boundary
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-agent-profiles.test.ts
  - pnpm run typecheck:node
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - Unedited released starter agents gain current implemented tools without resetting custom agents or granting new workspace access.
acceptance:
  - Full historical profile equality is required, not just builtIn or an old capability subset.
  - Customized planner, instructions, enabled flag, memory, timestamps and permission narrowing are retained.
  - Loading never rewrites the profile file; existing atomic persistence remains unchanged.
docs:
  required: true
---

Historical definitions were inspected in 04324b3e, cf8eabe4, 9f117075,
32badea9, f0f2b11c, 7a64592c and ebe8e537. Unknown variants fail closed.
