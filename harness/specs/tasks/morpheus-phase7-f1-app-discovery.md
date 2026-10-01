---
id: morpheus-phase7-f1-app-discovery
title: Discover installed targets for existing approved Windows applications
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Resolve the existing frozen application keys through verified common directories and bounded native App Paths lookup while preserving legacy capabilities and authority.
touchedAreas:
  - electron/services/morpheus/capabilities/win32/app-launch.ts
  - electron/services/morpheus/capabilities/win32/application-discovery.ts
  - tests/unit/morpheus-app-launch.test.ts
  - tests/unit/morpheus-application-discovery.test.ts
  - docs/releases/phase7-f1-source-checkpoint.md
  - harness/specs/tasks/morpheus-phase7-f1-app-discovery.md
requiredProfiles:
  - fast
requiredRules:
  - morpheus-native-action-safety
expectedUserBehavior:
  - Existing approved names resolve when installed in supported verified locations.
  - Missing or moved applications fail truthfully before execution.
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-app-launch.test.ts tests/unit/morpheus-application-discovery.test.ts tests/unit/morpheus-filesystem-capabilities.test.ts tests/unit/morpheus-reminder-capability.test.ts tests/unit/morpheus-workflows.test.ts tests/unit/morpheus-capability-routing.test.ts tests/unit/morpheus-capability-params.test.ts tests/unit/morpheus-runtime.test.ts
acceptance:
  - Logical keys permissions profile data and fixed spawn arguments are preserved.
  - Main derives all paths and bounded registry queries with no shell or renderer-provided executable.
  - Target is a regular file in a compiled product installation directory and is revalidated immediately before spawn.
  - Fixtures are distinct from live hardware and packaged acceptance; Store-only targets remain unsupported unless proven.
docs:
  required: false
---

Read-only registration lookup follows Microsoft App Paths documentation.
Parent owns the campaign and README integration after source verification.
