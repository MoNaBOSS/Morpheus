# Morpheus Windows acceptance candidate — preview.5

This is the local Windows/BYOK candidate, **not a signed public release or completed
Premium product**. Existing capabilities and the approved bottom-right companion
remain intact. NerdGPT stays deferred. Do not install an older preview as this build.

## Artifact identity

- Version: `1.2.0-preview.5`, Windows x64.
- Application source: `c8d021dda41d7abfeff8511bc1988b17b794ecad`.
- Installer: `E:\Morpheus-builds\p7-preview5\candidate\release\Morpheus-1.2.0-preview.5-win-x64.exe`.
- Size: **343,080,980 bytes** (327.2 MiB); unpacked application approximately 1.33 GB,
  before profile/runtime data, temporary installation files and any rollback backup.
- SHA256: `cf82b227b90299bc1be1cf01bacfe7421be267449f37cf7c9cfd90e98b60b9c4`.
- Authenticode: **NotSigned**. No automatic update feed, public upload or release tag.
- The first 50231971 installer failed final bundled-dependency inspection and is
  retained under `E:\Morpheus-builds\p7-preview5\rejected-50231971`, not delivered.
- Build/evidence directory: `E:\Morpheus-builds\p7-preview5`.
- Original source checkout, user profiles, provider settings and installation
  registrations were not modified by the tests. All app fixtures used synthetic homes.

## Verified scope

- Source: 3,329 unit passes / two platform-gated skips (macOS JXA and non-Windows
  bridge guard), three typechecks, zero lint errors / 12 inherited warnings,
  communications replay/compare and harness validation/CI. Fifteen native journeys
  cover four-locale startup/history, unavailable Premium and shared motion.
- Dependency audit: zero unresolved registry advisories after same-major updates;
  two image-size advisories covered by the existing verified patch (142 checks).
  This is not a guarantee that all vulnerabilities are absent.
- Actual package inventory additionally checks embedded channel dependencies,
  which the normal package-manager audit does not cover. Discord/QQ/WhatsApp
  now contain the reviewed locked undici/ws/protobufjs copies; five actual bundled
  Node 22.22.3 dependency-load checks and protobuf round-trip pass without network.
  Same-version plugin refresh identities include the backports. All seven bundled
  channels are retained; all 197 loaded modules resolve inside the payload. No live
  channel account or delivery has been tested here.
- Normal packaged app: real Gateway startup, approved welcome, real system-information
  task, OS-protected synthetic provider, original ACP compact reply, reload and full
  quiet restart. One free local model-fixture request total, no inference on recovery.
- Screenshots inspected: actual first-run and restored compact history, no internal
  personality instructions. These are real UI captures with synthetic answer content,
  not proof of live model quality.
- Exact package lifecycle: Main and UI reject unavailable Premium; a real local
  task finishes during controlled Gateway outage, recovery preserves history,
  no queued/duplicate turn, no page/console errors, all owned processes exit.
- Final c8d021dd five-minute unarmed idle (312.4s): **0.915% total CPU**, below the unchanged 1%
  target; stable process set, working set 1,326,252,032 → 1,307,578,368 bytes;
  zero provider requests. This includes Gateway/ACP children, not just the renderer.
  Only the small idle halo is stepped at 5 Hz; active aurora/audio remains fluid.
  This is the corrected package's own measurement, not the preceding package's
  result. Controlled recovery, clean console and all owned-process exits pass too.
- Actual compiled EXE: embedded archive integrity passes; **40,511 file paths/sizes**
  match the qualified payload. Extracted executable, app archive, motion CSS and
  runtime manifest hashes match; extracted channel manifests contain the patched
  versions. All 725 inventoried upstream license/notice assets remain. The build
  cache junction is materialized as ordinary archive files, not a required user path.
  7-Zip reports trailing data because it reads the embedded 7z stream inside NSIS;
  CRC checks pass. This static check does not certify installer execution.

Environment: Windows 10.0.26300, i5-14600K / 20 logical CPUs / approximately 16 GB RAM;
1920×1080, scale 1. Native Electron Playwright used because Browser plugin unavailable.
New runtime: Electron 41.10.6; existing pinned OpenClaw 2026.7.1 retained.
The c8d021dd package's first copied-payload Gateway was ready in 50.95s;
quiet returning window 2.565s / Gateway 7.484s. These single observations do not meet
all startup targets
and are not stable latency distributions. UI/local work do not require a ready
AI Gateway. Do not present this as a fully optimized latency result.

## QA evidence and reproducibility

| Rendered check | Result |
| --- | --- |
| Correct application identity / nonblank welcome | PASS, actual packaged preview.5, no E2E mode |
| No framework error overlay / console health | PASS, inspected screens and zero captured page/console errors |
| Screenshot evidence | PASS, first-run 1280×800 and compact restored history 432×512 inspected |
| Interaction loop | PASS, welcome → real local task → protected local provider → ACP reply → reload → quiet restart with original history |

All raw evidence is under `E:\Morpheus-builds\p7-preview5`:

- `candidate-evidence.json`, `installer-inspection.json`, `installer-integrity.log`:
  exact source/hash/signature, asset/notice inventory and compiled EXE inspection.
- `normal-runtime-evidence.json`, `qualification-result.json`: exact normal package,
  controlled outage/recovery, idle samples and clean process teardown.
- `normal-runtime-1790927742881\packaged-first-launch.png` and
  `normal-runtime-1790927742881\packaged-relaunched-history.png`: actual final screenshots.
- `unit-final-backport.log`, `native-tests.log`, `idle5hz-test.log`,
  `dependency-audit.log`, `backport-payload-inventory.json`, `channel-backports-runtime.log`:
  source/native/dependency evidence; earlier runs are not relabelled as final runs.

Key validation: `pnpm test`, the repository's Electron Playwright journeys,
`normal-runtime-smoke.mjs --companion --relaunch`, `qualify-lifecycle.mjs`,
diff-aware harness checks since 59ea1b06, `comms:replay` / `comms:compare`, and
7-Zip listing/integrity/selected extraction plus SHA256 comparison. Browser plugin
not available; existing native Electron Playwright was the fallback. No new test
framework or browser dependency was installed. Windows-only companion sizing,
not mobile/native macOS acceptance.

## Not yet accepted / unavailable

- Physical microphone/wake accuracy, speaker echo/interruption, natural-voice taste,
  unplug/lock/sleep, DPI/multiple monitors and 60-minute mixed-use stability.
- Live paid reasoning/voice quality, live cited research and actual website publication.
  No paid requests, public deployments or owner accounts were used.
- Public browsing is implemented; authenticated account browsing is unfinished.
  Website generation supports the established static and pinned client-interactive
  paths, not arbitrary full-stack apps or delivered form submissions.
- Managed Premium remains disabled in both UI and Main. Original managed ACP
  conversation, complete paid-path accounting, hosted identity/payments/operations
  remain unfinished. No fake trial, automatic paid fallback or purchase success.
- Code signing and an owned update feed are absent. Installer helper/rollback tests
  pass; actual clean installation/upgrade/uninstall needs an isolated Windows VM or
  owner-approved test environment. No suitable preconfigured sandbox/VM was found.
- At handoff the system C: drive has only approximately 0.54 GiB free. Do not start
  an installation/upgrade there until adequate space is available. The EXE and
  isolated test data are on E:; no user files were removed to make room.
- The five-minute idle test is not the required 60-minute mixed-use soak.

## One owner PC acceptance checklist

1. Check disk space, then install this exact version in a suitable test environment;
   retain any existing profile. Confirm welcome only for a new profile and quiet
   orb on a quick restart. Unsigned does not mean Windows has approved the publisher.
2. Hover/click/type, Escape, reopen, expand and minimize to tray. Confirm the same
   draft/history survives and the orb stays above the taskbar without stealing focus.
3. Connect your provider through the app's protected settings or secure setup—never
   paste a key in chat. Ask a normal question, restart, and check the reply remains.
4. Enable voice deliberately. Try “Morpheus, open Notepad,” interrupt a spoken reply,
   mute, unplug/reconnect the mic and sleep/resume. Choose the voice that sounds right.
5. Ask for cited research while opening another app; preview and revise a test website.
   Publish only to a target you approve. Use the app for 60 minutes and report errors
   with the version, action and observed result—no keys or private transcripts.

## Continuation

Use [the fixed checklist](WINDOWS_COMPLETION_CHECKLIST.md), not a fresh discovery
phase. Fix reproduced failures against this identified candidate; do not repeat
already-passed campaigns without a changed dependency or concrete failure.
Public release gates are not silently waived by delivering an EXE.
