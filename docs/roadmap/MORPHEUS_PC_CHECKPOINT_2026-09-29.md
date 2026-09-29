# Windows continuation checkpoint — 2026-09-29

This is a source-and-test checkpoint, not installer, hardware, voice, provider,
browser-research or public-release acceptance. Continue with
[the PC priorities](MORPHEUS_PC_PRIORITY_2026-09-29.md).

## Source preserved

- Verified `C:\Morpheus\morpheus-core` was clean on the Phase 4 handoff branch,
  with origin `https://github.com/MoNaBOSS/Morpheus.git`. Fetched and checked
  out `codex/morpheus-phase6-managed-layer` at `92fe48fa` (an ancestor-compatible
  checkout); no reset, stash, profile or provider-setting changes.
- Windows 11 Pro N, build `10.0.26200`; Node `24.15.0`; pinned pnpm `10.33.4`.
- Read `PC_CODEX_START_HERE.md` directly from the fetched branch, then the
  specified repository rules, roadmap, design and architecture records.

## Source checks before native changes

`pnpm install --frozen-lockfile`, extension-bridge generation, node/web/managed
typechecks, lint (0 errors; 24 inherited Fast Refresh warnings), Vite build,
communication replay/comparison and Phase 6 harness validation passed. The full
Windows unit run passed **2,849 tests, 2 skipped, 281 files**; the Windows-only
cases skipped on Mac ran. A freshly built Electron app passed **14/14** selected
E2E journeys, including the native orb and screenshot-permission cases. These
results are for the fetched source before the hover change.

## First native implementation slice

The sandboxed Windows orb now expands up and left after a short hover dwell,
without moving the M artwork or taking keyboard focus. Pointer exit collapses
the preview. Clicking opens the existing compact conversation and focuses its
real input; it does not create a second task surface. The preview is an entry
affordance, not a text field or new executor. The orb follows work-area changes
on display add/remove/metrics events. Bounds are constrained to the work area,
including negative monitor coordinates. The existing draft and task state remain
in the main renderer.

The native artwork and quiet green identity are unchanged. The published GitHub
Pages experience is still a separate interactive design, not an app test.
Motion alternative selection is still open; no concept effect was silently
adopted. Hover uses existing low-key native movement and respects reduced motion.

After this slice: **16/16** targeted placement/orb unit tests, **14/14** selected
Electron E2E journeys, node/web/managed typechecks, full lint (0 errors, 24
inherited warnings), Vite build and companion harness-spec validation passed.
The E2E journey asserts hover without focus, pointer exit, reopen, click-to-type
focus, compact position and full-window restoration. Native screenshot evidence
was reviewed locally at `native-orb-hover-composer.png` under the PC task output
folder. The full 2,849-test suite was not rerun after this narrowly scoped edit.

## Still unverified or unimplemented

- Real multi-monitor movement, every taskbar edge/DPI combination, installed
  keyboard/focus behavior, sleep/resume, acoustic wake, microphone/headset and
  neural voice quality require hardware acceptance. Automated bounds/Electron
  checks are not substitutes.
- Browser opening exists, but a complete Objective-owned browse/extract/cite
  workflow and saved research artifact are next. Browser opening alone is not
  research success.
- Interactive website creation, revision and authorized publication need a
  scoped development worker and real verification; the current restricted
  static-site verifier must not simply be weakened.
- Hosted identity, managed AI/voice routes, trial and billing are not live.
  BYOK and existing provider settings were preserved. Hermes remains an
  evaluation candidate only.

Next practical slice: browser navigation and cited research saved as an
inspectable artifact under the existing Objective, permission, cancellation and
usage boundary. Then test it beside an independent quick command on Windows.
