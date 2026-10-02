# I Windows candidate — preparation, not acceptance

2026-10-02. Current status is in the [fixed Windows checklist](WINDOWS_COMPLETION_CHECKLIST.md);
the sections below retain historical evidence, not independent next-action queues.
The old `6e19fadc` installer is not the current product.

Pre-build review found inherited installation cleanup that killed globally named
Morpheus processes, prefix-matched neighboring paths, moved registry-discovered
folders, recursively deleted locked targets/backups, and offered deletion across
other Windows user profiles. Those behaviors are removed before the new candidate.

The installer now uses a fixed PowerShell `-File` helper with literal path
arguments. It rejects drive/shared folder, relative, reparse, source-checkout and
non-product nonempty targets. It asks the user to close running processes from the
exact target directory; it never kills processes by name or changes security
settings. An upgrade keeps the entire old folder at an exact `._rollback_N`
sibling. Extraction failure preserves the partial folder and restores the previous
one when possible. Locked or failed recovery is reported and left recoverable;
no recursive deletion or delayed wildcard cleanup. Backups consume disk space and
are intentionally retained for explicit later cleanup.

Uninstall retains application profiles, credentials and `.openclaw`; it no longer
offers broad profile erasure. Its existing exact-install CLI PATH cleanup remains.
Other users' and opposite-scope installations are not removed or unregistered.

32 focused unit checks pass, including four actual Windows PowerShell fixture
journeys: apostrophe/Unicode paths, backup/partial extraction restore, invalid and
occupied targets, redirected/source directories, and a running owned process in
an exact versus similarly prefixed neighboring directory. No user-owned process,
installation or profile was modified. These are **helper/source tests**, not a
compiled NSIS install/upgrade/uninstall pass.

Next: compile the fresh candidate on E:, inspect notices/runtimes and record exact
source/hash, then isolated packaged lifecycle and normal startup. Never run the
NSIS installer against the owner's existing registration/profile as a test.
Signing, authorized update feed, physical voice/performance, live hero workflows,
G2.3 ACP managed conversation and G3/G4 service/payment acceptance remain open.

## Normal startup exposed a launch blocker

The d5954e6c `1.2.0-preview.1` NSIS installer compiled successfully. A normal
(not E2E-mode) launch in a separate synthetic Windows home/profile failed to
start Gateway: `utilityProcess.fork` rejected undefined credential-clearing
entries with `Invalid value for env`. Reduced UI tests had skipped this launch.
The app retained its bounded retry policy; it was not a usable runtime candidate.

The Gateway launch boundary now omits undefined values **after** all provider
overrides, including cleared Windows case aliases. It neither restores inherited
credentials nor serializes the word `undefined`, and preserves selected SecretRef
values. An actual Electron utility child verifies omission and selected-value
delivery without a network provider. Windows Electron itself drops empty strings
in the child environment; the boundary keeps them valid, not stringified.
Gateway manager/state also honor the existing environment port override so the
normal-startup fixture cannot share an owner's default port. No runtime, tool,
session or permission owner has been replaced.

The real utility-process regression passes (3.3s). The first full suite exposed
nine outdated config mocks and the pre-preview version assertion; those fixtures
were corrected, not runtime safety checks weakened. The preview.2 candidate must
include this fix and the 37095e95 first-run correction. Normal Gateway readiness,
full packaged lifecycle and exact source/hash remain pending until rebuilt.
Evidence: `E:\Morpheus-builds\phase7-runtime-launch-final-evidence-20261002`;
failed normal preview.1 evidence under `phase7-20261002-0253` is retained.

Final source validation: **3,301 units pass + two inherited skips, 319 files,
62.93s**; all three typechecks, scoped lint, comms replay/compare and the narrow
diff-aware harness validate/dry-run pass. This closes the source launch regression,
not the still-pending packaged normal-startup gate.

## Preview.2 follow-through and ACP endpoint correction

The 208eff4d preview.2 package starts the real Gateway in an isolated normal
profile (14.1s in this run), shows the approved welcome, completes system
information, and creates/selects a protected synthetic local provider. Its ACP
bridge then tried port 18789 while Main's Gateway ran on 55147; the ordinary reply
never reached the fixture provider. Evidence is retained under
`E:\Morpheus-builds\phase7-20261002-0319\normal-runtime-evidence.json`.

ACP now validates Main's actual port and passes its loopback URL explicitly.
The same Main Gateway token goes in the owned child environment, never argv or
diagnostics; inherited password cannot override that owner. Session access,
generation, permission and history ownership remain unchanged. Forty-two ACP
units, three typechecks and scoped lint pass. This is not the managed G2.3 join.
Preview.3 will combine this change with quiet startup (1fbea5b9). Build its unpacked
payload first, qualify actual Gateway/ACP/compact history using a free local
fixture, then compress the EXE once the runtime path succeeds. No real account,
live quality, hardware or installer acceptance is implied.

### Pinned authentication compatibility correction

The e7636b70 preview.3 unpacked smoke reached the correct port but failed auth:
OpenClaw intentionally suppresses environment credentials with CLI `--url`.
The source now supplies both owner URL and token in the child environment and
removes inherited case aliases/passwords. Forty-four units pass, including a
real pinned bootstrap compatibility check proving the distinction. Node typecheck
passes. The failed unpacked fixture is retained at `phase7-20261002-0340`; it was
not compressed or handed off. Rebuild and rerun the normal smoke before the EXE.

### Original history recovery

The 3fe59e0c unpacked package reached a real compact ACP reply through one free
local streaming-provider request. Provider metadata/protected storage and the
actual local task passed. Reload then showed an empty conversation: the companion
only loaded ACP when pending admissions existed. The source now replays known
sessions after reload using the original owner. Compact/full requests share one
in-flight load; an untouched local placeholder is not created and pending turns
keep their existing delivery path. A late failure cannot replace another selected
conversation's error. History retry does not send inference.

Six native/rendered journeys pass (21.2s), including four locales, existing-session
replay with zero admissions/prompts and compact reply after reload. 97 related
unit tests pass; all three typechecks and scoped lint pass. Browser plugin absent;
repository Electron Playwright used. Page identity/content, no framework overlay,
zero captured page/console errors and screenshots checked. English compact and
desktop-overlay screenshots inspected. Evidence: `phase7-history-evidence-20261002`
under E: builds. Normal packaged follow-through is still required after rebuilding.

### 50437715 packaged follow-through and visual catch

Normal packaged Gateway, approved welcome/local task, protected provider selection,
real ACP compact reply, renderer reload and full quiet relaunch passed. One local
streaming request total; reload/relaunch caused zero additional inference. Profile
and provider survived restart. This is not a paid/live-quality claim. Evidence:
`E:\Morpheus-builds\phase7-20261002-0403\normal-runtime-evidence.json`.
Cold copied-payload Gateway readiness was 56.4s; a subsequent isolated-profile
run was 7.8s, with returning quiet window 2.53s / Gateway 7.44s. Single observations,
not a stable latency distribution or a closed cold-start performance gate.
The full source suite at this checkpoint passes **3,312 tests + two skips**.

Screenshot inspection caught internal persona text in the restored user bubble.
The preview.3 NSIS compiled but is not the final handoff. New source tags only
Main-generated persona blocks in the existing ACP ledger. User-role display omits
only bounded recognized tagged content; raw prompt matching and model context are
preserved. Untagged historic text, quoted user text, assistant and tool content are
not stripped heuristically. This is presentation metadata, never authorization.
Preview.4 must pass normal restart plus screenshot inspection before compression.

Persona display source validation: **92 focused units**, all three typechecks,
scoped lint, comms replay/compare and narrow diff-aware harness checks pass.
Six fresh-build Electron journeys pass (21.5s), including four-locale tagged
history with the actual user question visible and internal context absent.
Page/console errors and overlay checks pass; English screenshot inspected.
Evidence: `E:\Morpheus-builds\phase7-persona-display-evidence-20261002`.

## Fixed release qualification — 2026-10-02

Preview.4 / 59ea1b06 normal package now passes welcome/local task, protected
synthetic provider, original compact ACP reply, renderer reload and full quiet
restart, using one local inference total. The ambiguous test locator was scoped
to compact; no product change was needed. Screenshots of actual first-run and
restored compact history were inspected, including absence of internal context.
Evidence: `E:\Morpheus-builds\phase7-20261002-0418\normal-runtime-evidence.json`.

Same package: Main rejects Premium activation and Settings visibly disables it;
local system information completes while Gateway is stopped; controlled restart
works; original history has no duplicate/queued turn; page/console errors are empty;
all owned processes exit. Five-minute unarmed idle has zero provider requests,
stable process set and working set 1,337,704,448 → 1,308,991,488 bytes, but CPU is
2.406% of total capacity, above the 1% target. This is NOT a passed performance
gate. A/B motion diagnosis isolates the halo compositor; stepped tiny idle changes
reduce its activity without changing active aurora/audio. Final package remeasurement
is required. Evidence: `qualification-result.json` and `idle-steps-diagnosis.log`
in the same directory. Some dependency preparation overlapped the initial idle
sample; whole-PC uncontended latency is not inferred.

Dependency audit at this boundary failed on registry advisories; do not distribute
preview.4 as the final product. Preview.5 applies same-major patch/minor fixes and
keeps the OpenClaw runtime pinned. Maintainer evidence includes
[Electron sandbox fix](https://github.com/electron/electron/security/advisories/GHSA-gr2m-v5gq-v685),
[Undici TLS fix](https://github.com/nodejs/undici/security/advisories/GHSA-w293-vg96-wgc3)
and [Axios redirect fix](https://github.com/axios/axios/security/advisories/GHSA-r4gj-5m52-g5wh).
Fresh lock SHA256: `9B2B93BBD50221B363D6ED940BFBBFD9833E42E07D6F761BD457EA30E7C8B44B`.
Updated audit has zero unresolved advisories; 142 installed image-size patch checks
pass (two advisories remain explicitly locally patched, not ignored).
Fresh runtime/plugin bundles are rebuilt from that graph; only unchanged binary
tools/curated skills reuse caches. No paid model or owner account is used.

Preview.5 source validation: **3,320 passes + two inherited skips**, 322 files,
63.77s; all three typechecks; lint zero errors / 12 inherited Fast Refresh warnings;
comms replay/compare and diff-aware harness validate/dry-run pass. The first full
run failed only the old exact Electron version assertion; it was updated to the
reviewed patched version and the entire suite rerun. 31 targeted runtime/installer
helper checks pass. Fifteen fresh-build native journeys pass (1.2m), including
four-locale history/startup, Premium unavailable and shared idle/active/reduced/
hidden motion. Still qualify the actual preview.5 package before EXE compression.

The c2caf22b preview.5 package passed normal reply/reload/relaunch and controlled
outage/local task/managed guard, but its full five-minute idle measured **1.063%**
CPU: improved, still above the unchanged 1% target. No provider requests; memory
1,329,573,888 → 1,290,379,264 bytes; no page/console errors. Preserve
`E:\Morpheus-builds\p7-preview5\qualification-before-idle5hz.json` as failed
performance evidence. The only follow-up is reducing subpixel idle halo updates
from 10 Hz to 5 Hz; active aurora, audio response and reduced/hidden pause are
unchanged. Fresh shared native/React motion regression passes (24.1s), harness
validation passes. Rebuilt package measurement remains the next gate.

### Exact 50231971 payload qualified

Preview.5 source 5023197175b6b08dad8cad4703e06661c5354f03 passes normal packaged
welcome/local task, protected synthetic provider, original compact reply, reload
and quiet relaunch; one free local inference total, none for recovery. The actual
restored UI was visually inspected. Gateway first copied-payload startup 45.19s;
returning window 2.59s / Gateway 7.51s (observations, not closed startup targets).
Final full source run: 3,320 units / two platform skips / 322 files / 63.13s.

The exact payload's controlled outage/local task/recovery, Premium Main/UI guard,
no duplicate/queued history, clean console and owned-process shutdown pass.
Five-minute unarmed idle (312.437s) is **0.9064% total CPU**, below the unchanged
1% target, stable process set, working set 1,329,209,344 → 1,308,626,944 bytes,
zero provider calls. Electron/Main hidden, orb visible, microphone unarmed; includes
Gateway/ACP descendants. It does not certify voice/loaded/60-minute performance.
All test homes are synthetic; no owner account, paid request or installation used.

Evidence: `E:\Morpheus-builds\p7-preview5\normal-runtime-evidence.json` and
`qualification-result.json`; native screenshots and logs live beside them.
The same tested payload is now eligible for prepackaged NSIS compression.

### Final payload audit catch — do not distribute 50231971's EXE

NSIS compression succeeded, but the post-compression dependency inventory failed:
upstream Discord embeds undici 8.5.0; Discord/QQ/WhatsApp embed ws 8.21.0 and
WhatsApp embeds protobufjs 7.6.3. These npm bundledDependencies bypass pnpm's
normal override/audit graph. The source audit was not proof of their actual bytes.
That compiled EXE is rejected, not delivered. All runtime/idle evidence above is
retained as evidence of that payload, not retroactively reassigned to a new build.

Both plugin bundlers now backport those reviewed majors from the exact installed
lock, retain upstream plugin versions/licenses, and fail before compression on
missing/wrong versions or changed dependency closures. The mirror revision also
includes the applied override identities so existing same-version plugin caches
refresh. Focused packaging/revision/notice regressions pass (18 checks). Rebuild,
inventory the payload before compression, and rerun normal packaged integration.

### Corrected c8d021dd payload — 2026-10-02

Both normal package and lifecycle evidence now identify application source
`c8d021dda41d7abfeff8511bc1988b17b794ecad`. The rejected 50231971 artifacts are
preserved outside the clean build clone at `E:\Morpheus-builds\p7-preview5\rejected-50231971`.
Full suite on the final locked Vitest 4.1.11: **3,329 passes / two platform skips**,
323 files, 68.63s. Scoped lint, communications replay/compare and diff-aware harness
checks against the actual 59ea1b06 checkpoint pass. An initial clone harness run
used origin/main and included historical changes/rejected build files; its log is
preserved and the correctly bounded check supersedes it, not a disabled diff check.

Pre-compression payload inventory has no mismatched audited same-major overrides.
Five actual bundled Node 22.22.3 dependency-load checks pass for Discord/QQ/WhatsApp,
including protobuf encode/decode and refreshed same-version plugin identities;
no channel account/network call. `backport-payload-inventory.json` and
`channel-backports-runtime.log` preserve this separate physical-bundle evidence.

Normal welcome/local task/protected provider/original ACP reply/reload/quiet restart
pass, with one free local inference total. Final screenshots inspected. First
copied-payload Gateway 50.95s, returning UI 2.565s / Gateway 7.484s; not a closed
startup performance gate. Local work does not depend on the Gateway being ready.
The exact corrected payload passes outage/local task/recovery, unavailable Premium,
no duplicate or queued turn, zero page/console errors and clean owned-process exit.
Five-minute unarmed idle: **312.422s, 0.9152% total CPU**, stable process set, memory
1,326,252,032 → 1,307,578,368 bytes, zero provider calls. The 1% target is unchanged.
Final EXE is compressed from this qualified payload, not the rejected older one.

### Identified EXE and static installer acceptance

Final `Morpheus-1.2.0-preview.5-win-x64.exe`: **343,080,980 bytes**, source c8d021dd,
SHA256 **cf82b227b90299bc1be1cf01bacfe7421be267449f37cf7c9cfd90e98b60b9c4**,
Authenticode **NotSigned**. Full path, limits and the single PC checklist are in
[the current handoff](WINDOWS_PREVIEW5_HANDOFF.md). No installer execution, release
publication or auto-update feed is implied.

Actual EXE's embedded archive integrity passes. All **40,511 file paths/sizes**
match the qualified payload, including materialized cache-link contents. Extracted
Morpheus executable/app archive/motion/runtime manifest hashes match; extracted
channel versions are the patched ones. The package retains 725 inventoried
license/notice assets. 7-Zip warns of data after the embedded archive (NSIS wrapper);
CRC checks and identity comparisons pass. `installer-inspection.json`,
`candidate-evidence.json` and `installer-integrity.log` record the actual result.
NSIS install/upgrade/uninstall execution is still unverified: no preconfigured
isolated VM/sandbox and owner installation/profiles were preserved. C: has only
about 0.54 GiB free; address this before owner acceptance. Phase 7 is not closed.
