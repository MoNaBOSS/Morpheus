# Phase 7 — preserve existing agent choices

2026-10-02, after E2 `ebe8e537`.

Reading an untouched released starter now selects the current default only after
complete equality with a known historical definition. The comparisons include
instructions, planner, capability list, enabled flag, memory/workspace policies,
timestamps and unknown fields. Merely having a built-in id or a capability subset
is insufficient. Customized OpenClaw/provider/offline bindings and narrowed
permissions are preserved. No credential, workspace grant or owner profile is
modified by this source check; loading does not rewrite the persisted file.

This also removes the old unconditional deterministic-to-auto override for every
built-in id. Only the complete original default receives that migration. Unknown
historical/custom variants retain their exact settings; no blanket profile reset.
Historical definitions were checked directly in Git, not inferred from user data.

Ten focused profile and real Core interactive-site tests pass, including disk-byte
preservation/restart and custom variants; Node typecheck passes. Communication,
lint and diff-aware harness checks accompany the checkpoint. Full source regression
at E2 passed 3,174 tests with two inherited skips. This narrow follow-up has no UI
change, no real owner-profile mutation and no installer acceptance claim.

Continue E3/F2/G/H/I. Fresh package and copied historical-profile acceptance remain
required; source unit tests cannot approve a real user's microphone or API quality.
