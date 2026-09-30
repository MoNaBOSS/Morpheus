# Phase 7 package notice retention

Source cleanup previously named `LICENSE.md` as disposable documentation and
removed `.markdown` files without a notice exception. Bundle and after-pack
general cleanup now retain existing license/licence, notice, copying and
copyright filename families regardless of case or extension. Notice assets
inside pruned docs/test trees retain their parent directories; unrelated docs
and development artifacts are still removed. Native/platform pruning is unchanged.

Focused synthetic validation on 2026-10-01: `after-pack-cleanup.test.ts` and
`openclaw-bundle-config.test.ts` passed 8/8. Fixtures execute the production
bundle cleanup followed by after-pack cleanup across top-level packages,
extensions and nested extension dependencies. They verify notice contents,
mixed-case Markdown suffixes, notices in docs/test trees, removal of ordinary
README/source-map/test files, and the existing universal native payload guards.

This is source/fixture evidence only. A rebuilt final package must still be
inspected for retained notice assets. This change preserves existing shipped
assets; it is not a license inventory or a redistribution/legal acceptance claim.

Diff-aware narrow harness validation and selected-flow dry-run passed after C2
was committed. The final renderer/Main build and all three typechecks passed;
lint has zero errors and the 12 existing Fast Refresh warnings. A concurrent
full unit run timed out in an unchanged image-plugin loopback fixture; its
isolated rerun passed 2/2. A full non-build-concurrent rerun is required before
the candidate is described as passing all source checks.
