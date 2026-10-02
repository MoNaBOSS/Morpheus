# Fixed Windows completion checklist

Scope locked by the owner, 2026-10-02: finish the existing Windows/BYOK companion,
preserving all capabilities and the bottom-right M/orb/upward composer. No redesign,
new feature phase, replacement agent engine or NerdGPT. Hosted Premium is unavailable
until its separate integration and live-service gates pass. This does not redefine
unverified features as complete or waive the Phase 7 acceptance requirements.

## Release checklist — update these rows, do not restart discovery

| ID | Fixed outcome | Current status / evidence |
| --- | --- | --- |
| W1 | Verify source, preserve existing profiles and all work | DONE: isolated source 50231971 pushed to the authorized branch; original PC checkout/profiles untouched. |
| W2 | Source regression for existing implemented capabilities | PASS at 50231971: 3,320 units, 2 platform skips; three typechecks, lint, comms, harness, 15 native journeys plus fresh final-motion regression. Not live acceptance. |
| W3 | Normal packaged welcome, local task, protected provider, compact original-runtime reply, reload and quiet restart; visually inspect restored history | PASS on exact preview.5 / 50231971: screenshots inspected, protected synthetic provider, original ACP, one free local inference total; none on reload/relaunch. |
| W4 | Verify hosted Premium stays unavailable; no fake trial/payment or automatic BYOK fallback | PASS on exact preview.5: Main rejects activation; UI disabled/no fake sign-in. G2.3/G1 full accounting/G3/G4 remain unfinished, explicitly unavailable. |
| W5 | Packaged reliability/performance checks possible without owner's devices, secrets or external writes | PASS for bounded local checks: outage/local task/recovery, no duplicate history, clean process exit; 312.4s unarmed idle 0.906% total CPU (target <=1%), zero provider calls, stable process set, RAM 1.329 → 1.309 GB. Physical sleep/microphone/DPI/monitor and 60-minute mixed use remain unaccepted. Startup targets remain open. |
| W6 | Package the visually qualified payload; record version, source, SHA256, notices and signing status | IN PROGRESS: 50231971's EXE rejected after finding embedded old channel dependencies outside pnpm's audit graph. Both plugin bundle paths now apply locked backports and cache refresh identities; rebuild/inventory required before handoff. No weakened dependency check. |
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

Exact preview.5 source and normal payload are qualified; compress that same
payload and record its identity, inspect the compiled installer, then hand off.
Do not repeat already-passed feature campaigns without a changed dependency or
reproduced failure. Evidence: `E:\Morpheus-builds\p7-preview5\qualification-result.json`
and `normal-runtime-evidence.json`; both identify application source 50231971.

Existing detailed requirements/evidence remain in
[Phase 7 acceptance](MORPHEUS_PHASE7_ACCEPTANCE.md) and
[Windows candidate evidence](phase7-i-windows-candidate.md).
