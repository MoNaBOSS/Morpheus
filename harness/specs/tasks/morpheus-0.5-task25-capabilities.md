---
id: morpheus-0.5-task25-capabilities
title: Morpheus 0.5 bounded system, web and developer capabilities
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Add bounded Windows system inspection, public URL opening and approved project launch capabilities without introducing arbitrary process or shell authority.
touchedAreas:
  - shared/morpheus/actions/registry.ts
  - shared/morpheus/action-types.ts
  - shared/morpheus/interpreter/deterministic.ts
  - shared/i18n/locales/**
  - electron/services/morpheus/index.ts
  - electron/services/morpheus/capabilities/win32/system-storage.ts
  - electron/services/morpheus/capabilities/win32/system-processes.ts
  - electron/services/morpheus/capabilities/win32/open-url.ts
  - electron/services/morpheus/capabilities/win32/launch-project.ts
  - tests/unit/morpheus-task25-capabilities.test.ts
  - tests/unit/morpheus-execution-plan.test.ts
  - harness/specs/rules/morpheus-native-action-safety.md
expectedUserBehavior:
  - Balanced mode runs aggregate storage automatically because it is privacy-safe and low-risk.
  - Process inventory is high-risk and prompts once for its own exact scope; it never receives command-line input.
  - URL opening accepts only an explicit http(s) URL and opens it through the system browser.
  - Project launch opens an existing folder inside the approved Morpheus workspace with a compiled-in VS Code executable and shell disabled.
requiredProfiles:
  - fast
requiredRules:
  - renderer-main-boundary
  - morpheus-native-action-safety
  - ui-i18n-design-tokens
requiredTests:
  - pnpm run typecheck
  - pnpm run lint
  - pnpm exec vitest run tests/unit/morpheus-task25-capabilities.test.ts tests/unit/morpheus-execution-plan.test.ts tests/unit/morpheus-capability-params.test.ts tests/unit/morpheus-action-registry.test.ts
acceptance:
  - The registry is frozen and all new capabilities are resolved by logical id and platform.
  - Storage returns aggregate byte counts only and uses the Main-owned Morpheus root.
  - Process inventory uses only the verified System32 tasklist executable with fixed arguments and shell false.
  - URL opening rejects file, javascript and custom protocols before execution.
  - Project launch rejects paths outside the canonical workspace and uses only the verified VS Code installation.
  - No renderer payload can provide an executable path, shell string, environment, arbitrary command or unrestricted path.
docs:
  required: true
---

Task 25 extends the existing Morpheus capability framework with a small, bounded set of useful Windows operations. It does not add generic shell execution or arbitrary application launching. The security invariants are defined in `harness/specs/rules/morpheus-native-action-safety.md`.
