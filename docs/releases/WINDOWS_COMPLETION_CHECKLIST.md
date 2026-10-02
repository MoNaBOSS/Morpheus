# Fixed Windows completion checklist

Scope locked by the owner, 2026-10-02: finish the existing Windows/BYOK companion,
preserving all capabilities and the bottom-right M/orb/upward composer. No redesign,
new feature phase, replacement agent engine or NerdGPT. Hosted Premium is unavailable
until its separate integration and live-service gates pass. This does not redefine
unverified features as complete or waive the Phase 7 acceptance requirements.

## Release checklist — update these rows, do not restart discovery

| ID | Fixed outcome | Current status / evidence |
| --- | --- | --- |
| W1 | Verify source, preserve existing profiles and all work | DONE: clean isolated worktree at 59ea1b06; original PC checkout untouched. |
| W2 | Source regression for existing implemented capabilities | DONE at 59ea1b06: 3,320 unit passes, 2 inherited skips; source/native evidence linked from Phase 7 ledger. Not live acceptance. |
| W3 | Normal packaged welcome, local task, protected provider, compact original-runtime reply, reload and quiet restart; visually inspect restored history | PASS on preview.4: scoped locator, screenshots inspected, one local inference total. Requalify preview.5 after dependency patches. |
| W4 | Verify hosted Premium stays unavailable; no fake trial/payment or automatic BYOK fallback | PASS on preview.4: actual Main rejects activation, UI disabled/no fake sign-in. 22 focused guard/bridge/recovery checks pass. G2.3/G1 full accounting/G3/G4 remain unfinished, explicitly outside this local candidate. |
| W5 | Packaged reliability/performance checks possible without owner's devices, secrets or external writes | PARTIAL: local task during controlled Gateway outage, restart, no duplicate history, clean shutdown pass. Five-minute unarmed idle: zero provider requests, stable process set/memory, but 2.406% CPU exceeds 1% target; motion diagnosis ongoing. Physical sleep, microphone, DPI/monitor and 60-minute human mixed use remain separate gates. |
| W6 | Package the visually qualified payload; record version, source, SHA256, notices and signing status | IN PROGRESS: final dependency audit found advisory-affected packages. Same-major updates and fresh bundle in preview.5; updated audit has zero unresolved findings (existing image-size patch verified). Never reuse old runtime bundles under the new lockfile. |
| W7 | Verify installer without altering owner's installation/registration/profile | TODO: safe static/payload inspection and isolated installation only if an existing safe Windows sandbox/VM is available. Helper tests alone do not certify NSIS install/upgrade. |
| W8 | Deliver EXE, exact limitations and one short owner acceptance checklist | TODO: distinguish implemented, fixture-tested, packaged-tested and human/live pending. Do not call all Phase 7 complete. |

## External / human gates, not reasons to stop independent local work

- Live provider and natural-voice evaluation: securely connected provider and an
  explicitly bounded paid test; no plaintext credentials in chat. User chose secure
  OpenAI key creation, but it has not been started or needed for local qualification.
- Owner PC: physical wake/command, interruption, chosen voice, actual apps/media,
  monitor/taskbar/DPI/sleep and 60-minute mixed use on this exact candidate.
- Live research/publication: real provider quality and approved account/repository/
  deployment target. Public browser exists; authenticated-browser scope is unfinished.
- Public distribution: signing identity, owned update feed and verified install/upgrade
  in an isolated Windows environment. No public release inferred from building an EXE.
- Public Premium: managed original conversation and complete accounting, hosting,
  identity and eligible payment setup; do not market these as available.

## Next exact action

Finish measured idle diagnosis and preview.5 source checks; rebuild and qualify
the patched runtime before EXE compression. Do not repeat already-passed feature
campaigns without a changed dependency or reproduced failure.

Existing detailed requirements/evidence remain in
[Phase 7 acceptance](MORPHEUS_PHASE7_ACCEPTANCE.md) and
[Windows candidate evidence](phase7-i-windows-candidate.md).
