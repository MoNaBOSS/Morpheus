---
id: morpheus-windows-release-qualification
title: Qualify the fixed Windows companion release without adding scope
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Patch advisory-affected dependencies and qualify the actual preserved Windows runtime.
touchedAreas:
  - package.json
  - pnpm-lock.yaml
  - tests/unit/morpheus-identity.test.ts
  - tests/unit/openclaw-bundle-config.test.ts
  - resources/morpheus-orb/motion.css
  - tests/e2e/morpheus-shared-orb-motion.spec.ts
  - harness/specs/tasks/morpheus-windows-release-qualification.md
  - docs/releases/WINDOWS_COMPLETION_CHECKLIST.md
  - docs/releases/phase7-i-windows-candidate.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/releases/WINDOWS_PREVIEW5_HANDOFF.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - docs-sync
  - morpheus-phase7-assistant-contract
requiredTests:
  - pnpm test
  - pnpm run security:check
  - pnpm exec playwright test tests/e2e/morpheus-shared-orb-motion.spec.ts --workers=1
  - pnpm exec vitest run tests/unit/morpheus-managed-account-api.test.ts tests/unit/installer-nsh.test.ts tests/unit/windows-install-guard.test.ts
expectedUserBehavior:
  - Existing companion and original tools/history remain unchanged.
  - Unfinished hosted Premium cannot activate; typing and BYOK stay usable.
acceptance:
  - Keep same-major advisory fixes; no new UI or replacement runtime.
  - Rebuild dependencies rather than reuse old bundled caches after changing the lockfile.
  - Normal packaged startup, protected local provider, compact reply and original history pass reload and quiet restart.
  - Inspect actual screenshots and record exact EXE hash, source, notices and signature status.
  - Physical/live/installer gates stay explicit; do not turn automation into full acceptance.
  - Limit only the tiny idle halo changes to ten updates per second; active aurora/audio and reduced-motion/hidden pause behavior remain intact.
docs:
  required: true
---

The owner's fixed Windows checklist governs scope. All test homes are synthetic;
no owner credentials, installation registration, microphone or paid provider used.
Baseline 59ea1b06 preview.4 passes normal reply/reload/relaunch. Final dependency
audit identified same-major fixes; package identity advances to preview.5.
