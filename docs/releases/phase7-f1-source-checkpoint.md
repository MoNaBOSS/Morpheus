# Phase 7 F1 — approved app discovery source checkpoint

2026-10-01, Windows. Existing logical keys (Notepad, Calculator, Paint, Spotify),
permission scopes and fixed argument lists remain. Main checks known system and
per-user/program installation directories, then bounded read-only App Paths
registration using trusted System32 reg.exe, never PATH or a generated shell.
Registration may narrow an approved root, not introduce arbitrary executable
locations. Files are revalidated after permission and immediately before spawn.
Unknown/Store-only targets report unsupported instead of inventing a launch.

92 focused tests passed across application launch/discovery, filesystem actions,
reminders, workflows, deterministic routing, parameters and the action runtime.
Fixtures are regular temporary files and are never executed. They cover normal
and registered installs, missing/moved targets, directories, unapproved roots,
arguments, variables, protocol/UNC paths and registry-output bounds.

This is source regression evidence. Actual installed target behavior, desktop
controls, packaged install/upgrade and owner-hardware acceptance remain open.
