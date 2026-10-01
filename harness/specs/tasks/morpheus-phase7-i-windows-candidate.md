---
id: morpheus-phase7-i-windows-candidate
title: Preserve installed files and isolate the fresh Windows candidate
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Remove inherited broad process termination and destructive upgrade cleanup before packaging.
touchedAreas:
  - package.json
  - scripts/installer.nsh
  - scripts/windows/install-guard.ps1
  - scripts/patch-nsis-extract.mjs
  - tests/unit/installer-nsh.test.ts
  - tests/unit/windows-install-guard.test.ts
  - tests/unit/patch-nsis-extract.test.ts
  - harness/specs/tasks/morpheus-phase7-i-windows-candidate.md
  - harness/specs/rules/morpheus-phase7-assistant-contract.md
  - docs/releases/phase7-i-windows-candidate.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - docs-sync
  - morpheus-phase7-assistant-contract
requiredTests:
  - pnpm exec vitest run tests/unit/installer-nsh.test.ts tests/unit/windows-install-guard.test.ts tests/unit/patch-nsis-extract.test.ts
expectedUserBehavior:
  - Only a conflicting target installation must be closed; no globally named process is killed.
  - Upgrade retains the previous installation and failed extraction as recoverable siblings.
  - Profiles and other users' installations remain untouched.
acceptance:
  - Broad relative non-product and reparse targets fail before moving files.
  - No recursive deletion or wildcard delayed cleanup in upgrade or rollback.
  - Source package hardware and live boundaries remain distinct.
docs:
  required: true
---

I1 internal Windows candidate; no release publication or signing claim.
