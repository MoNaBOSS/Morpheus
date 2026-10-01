---
id: morpheus-phase7-quiet-startup
title: Preserve quiet companion and explicit tray presence on launch
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Close the normal-launch presentation gap without changing microphone or startup consent.
touchedAreas:
  - electron/main/index.ts
  - electron/main/tray.ts
  - tests/unit/morpheus-tray-handoff.test.ts
  - tests/e2e/morpheus-quiet-startup.spec.ts
  - harness/specs/tasks/morpheus-phase7-quiet-startup.md
  - harness/specs/rules/morpheus-phase7-assistant-contract.md
  - docs/releases/phase7-h-native-readiness.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
  - e2e
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - comms-regression
  - docs-sync
  - morpheus-phase7-assistant-contract
requiredTests:
  - pnpm exec vitest run tests/unit/morpheus-tray-handoff.test.ts tests/unit/main-window-focus.test.ts
  - pnpm exec playwright test tests/e2e/morpheus-quiet-startup.spec.ts --workers=1
expectedUserBehavior:
  - Returning launch shows the quiet orb instead of an automatic full workspace.
  - First launch still shows the approved welcome and explicit foreground requests remain effective.
  - Explicit tray handoff hides both workspace and orb without enabling listening.
acceptance:
  - Initial presence reads the same Main-owned onboarding profile, never a second profile store.
  - The saved start-minimized preference uses a verified tray; missing tray falls back to an accessible orb.
  - No startup or microphone settings change as a side effect of showing or hiding a window.
  - Returning startup and native input are covered in all four locales.
docs:
  required: true
---

Implements the existing architecture's startup/presence table, not a redesign.
