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
