# I Windows candidate — preparation, not acceptance

2026-10-02. A fresh EXE is still to be built from this source checkpoint.
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
