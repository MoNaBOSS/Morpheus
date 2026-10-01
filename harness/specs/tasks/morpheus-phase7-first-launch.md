---
id: morpheus-phase7-first-launch
title: Use the approved arrival on a genuinely fresh profile
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Remove the legacy setup prerequisite without bypassing Main-owned onboarding persistence or runtime readiness.
touchedAreas:
  - package.json
  - src/App.tsx
  - src/components/morpheus/onboarding/MorpheusActivation.tsx
  - tests/e2e/morpheus-arrival-policy.spec.ts
  - tests/e2e/morpheus-first-launch.spec.ts
  - harness/specs/tasks/morpheus-phase7-first-launch.md
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
  - pnpm exec playwright test tests/e2e/morpheus-first-launch.spec.ts tests/e2e/morpheus-arrival-policy.spec.ts --workers=1
expectedUserBehavior:
  - A fresh profile opens the Matrix name and welcome scene, not the legacy installation wizard.
  - A returning profile does not repeat setup when renderer-local state is missing.
acceptance:
  - Fresh-profile tests do not set the skip-setup flag and cover all four locales and reduced motion.
  - Completing arrival persists through the existing Main owner before a first real local task is dispatched.
  - Name and completion survive relaunch without a provider, microphone or paid request.
  - Keyboard focus remains within the active first-launch dialog.
  - Legacy setup remains explicitly accessible; no existing profiles or provider settings are rewritten.
docs:
  required: true
---

The profile in Main is the completion authority. The old renderer setup flag is
not a prerequisite for Morpheus arrival and must not mask a broken first run.
