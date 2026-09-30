---
id: packaged-runtime-pruning-guards
title: Guard packaged runtime pruning for native payloads and notices
scenario: plugin-lifecycle-management
taskType: plugin-lifecycle
intent: Keep packaged OpenClaw cleanup size-conscious while retaining required native payloads and existing package notice assets.
touchedAreas:
  - scripts/after-pack.cjs
  - scripts/bundle-openclaw.mjs
  - scripts/openclaw-bundle-config.mjs
  - scripts/package-notice-guards.cjs
  - tests/unit/after-pack-cleanup.test.ts
  - tests/unit/openclaw-bundle-config.test.ts
  - harness/specs/rules/packaged-runtime-pruning-guards.md
  - harness/specs/tasks/packaged-runtime-pruning-guards.md
  - docs/releases/phase7-package-notices.md
expectedUserBehavior:
  - Packaged tree-sitter-bash runtime loading keeps a usable native prebuild for every architecture in the target artifact.
  - Size cleanup still removes non-target platform packages and known runtime junk for single-architecture builds.
  - Both packaging cleanup stages retain existing license and notice assets without copying all documentation.
requiredProfiles:
  - fast
requiredTests:
  - tests/unit/after-pack-cleanup.test.ts
  - tests/unit/openclaw-bundle-config.test.ts
acceptance:
  - `cleanupNativePlatformPackages` keeps same-platform x64 and arm64 native packages when the electron-builder arch resolves to `universal`.
  - `cleanupNodeModulesRuntimeJunk` keeps same-platform x64 and arm64 `tree-sitter-bash/prebuilds` directories when the target arch is `universal`.
  - Non-target platforms are still pruned from scoped native packages and tree-sitter-bash prebuilds.
  - The bundle script still skips a duplicate nested `openclaw` package.
  - Case-insensitive license/licence, notice, copying and copyright filename families survive both cleanup stages, including inside pruned documentation/test directories.
docs:
  required: false
---

This task captures packaged-runtime cleanup invariants for OpenClaw extension
and native payload bundling. The size optimization path may prune unused
platform binaries, generated declarations, source maps and known non-runtime
files, but it must not treat macOS `universal` as a literal architecture.

Universal macOS artifacts contain both x64 and arm64 slices. Cleanup helpers
therefore keep same-platform x64 and arm64 packages/prebuilds while still
removing Linux, Windows and other non-target platform payloads.
