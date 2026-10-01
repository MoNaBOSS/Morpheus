---
id: morpheus-phase7-d3-research
title: Source-bound research and saved reports
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Reuse Core retrieval and bounded review to save cited reports through the existing file permission and audit path.
touchedAreas:
  - shared/morpheus/research-types.ts
  - shared/morpheus/planner.ts
  - shared/morpheus/provider-plan.ts
  - electron/services/morpheus/core/objective-orchestrator.ts
  - electron/services/morpheus/core/research-report.ts
  - electron/services/morpheus/planning/provider-planner.ts
  - src/pages/CommandCenter/**
  - src/components/common/MorpheusCitationLink.tsx
  - src/components/file-preview/FilePreviewBody.tsx
  - src/components/file-preview/FilePreviewOverlay.tsx
  - src/components/file-preview/MarkdownPreview.tsx
  - tests/unit/morpheus-citation-link.test.tsx
  - shared/i18n/locales/*/dashboard.json
  - tests/unit/morpheus-research*.test.ts
  - tests/unit/morpheus-objective-orchestrator.test.ts
  - tests/unit/morpheus-provider*.test.ts
  - tests/e2e/morpheus-research*.spec.ts
  - harness/specs/tasks/morpheus-phase7-d3-research.md
  - harness/specs/rules/morpheus-bounded-worker.md
  - harness/specs/scenarios/morpheus-bounded-worker.md
  - docs/releases/phase7-d3-research.md
  - docs/releases/MORPHEUS_PHASE7_ACCEPTANCE.md
  - docs/roadmap/MORPHEUS_PHASE7_EXECUTION_PLAN.md
  - SOL_START_HERE.md
  - README*
requiredProfiles:
  - fast
  - comms
requiredRules:
  - renderer-main-boundary
  - backend-communication-boundary
  - morpheus-bounded-worker
  - comms-regression
  - docs-sync
requiredTests:
  - pnpm run typecheck
  - pnpm run comms:replay
  - pnpm run comms:compare
expectedUserBehavior:
  - Research shows readable retrieved sources and saves a cited Markdown report in the approved workspace.
  - Unavailable sources are labeled and unrelated local commands remain available.
acceptance:
  - Citation ids resolve only to Main-observed sources belonging to this objective; provider URLs are never citation authority.
  - Source data remains bounded and untrusted; no extra planner owner or increased request ceilings.
  - Report saves through normal file creation permissions audit and no-overwrite checks; success requires a real file artifact.
  - Sources open through the existing safe external link route, not inside a privileged or local HTML preview.
docs:
  required: true
---

First deliver D3 source-grounded reports for retrieved public pages. Search
discovery is not a citation and unsupported sources are not invented. Keep live
provider/site and final package acceptance separate from fixtures.
