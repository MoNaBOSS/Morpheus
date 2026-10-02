# Fixed Windows completion checklist

Scope locked by the owner, 2026-10-02: finish the existing Windows/BYOK companion,
preserving all capabilities and the bottom-right M/orb/upward composer. No redesign,
new feature phase, replacement agent engine or NerdGPT. Hosted Premium is unavailable
until its separate integration and live-service gates pass. This does not redefine
unverified features as complete or waive the Phase 7 acceptance requirements.

## Release checklist — update these rows, do not restart discovery

| ID | Fixed outcome | Current status / evidence |
| --- | --- | --- |
| W1 | Verify source, preserve existing profiles and all work | DONE: isolated source c8d021dd pushed to the authorized branch; original PC checkout/profiles untouched. |
| W2 | Source regression for existing implemented capabilities | PASS: final 3,329 units, 2 platform skips; unchanged app typechecks, lint, comms, harness, 15 native journeys plus final-motion regression. Packaged channel backports separately load-tested. Not live acceptance. |
| W3 | Normal packaged welcome, local task, protected provider, compact original-runtime reply, reload and quiet restart; visually inspect restored history | PASS on exact preview.5 / c8d021dd: screenshots inspected, protected synthetic provider, original ACP, one free local inference total; none on reload/relaunch. |
| W4 | Verify hosted Premium stays unavailable; no fake trial/payment or automatic BYOK fallback | PASS on exact preview.5: Main rejects activation; UI disabled/no fake sign-in. G2.3/G1 full accounting/G3/G4 remain unfinished, explicitly unavailable. |
| W5 | Packaged reliability/performance checks possible without owner's devices, secrets or external writes | PASS for bounded local checks on c8d021dd: outage/local task/recovery, no duplicate history, clean process exit; 312.4s unarmed idle 0.915% total CPU (target <=1%), zero provider calls, stable process set, RAM 1.326 → 1.308 GB. Physical sleep/microphone/DPI/monitor and 60-minute mixed use remain unaccepted. Startup targets remain open. |
| W6 | Package the visually qualified payload; record version, source, SHA256, notices and signing status | DONE: preview.5 / c8d021dd EXE, 343,080,980 bytes; SHA256 cf82b227…b60b9c4, Authenticode NotSigned, 725 notice/license assets. Full identity in handoff. No public release/feed. |
| W7 | Verify installer without altering owner's installation/registration/profile | STATIC PASS: compiled archive CRC/inventory (40,511 files), extracted identity hashes and patched channel versions match qualified payload. INSTALL/UPGRADE EXECUTION BLOCKED: no existing isolated VM/sandbox; owner registration/profile deliberately untouched. Helper tests do not close this gate. |
| W8 | Deliver EXE, exact limitations and one short owner acceptance checklist | READY: [preview.5 handoff](WINDOWS_PREVIEW5_HANDOFF.md) identifies exact EXE/hash and one five-step PC checklist; implemented, packaged-tested, manual/live and unfinished scope separated. Full Phase 7 remains unaccepted. |

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

Use the exact EXE in the handoff for owner PC acceptance after addressing low C:
disk space; connect live credentials only through protected settings/secure setup.
Do not repeat passed campaigns or add features. Fix reproducible acceptance failures;
retain installer/hardware/live-service and startup-performance gates honestly.
Evidence: `E:\Morpheus-builds\p7-preview5\candidate-evidence.json`,
`installer-inspection.json`, `qualification-result.json` and
`normal-runtime-evidence.json`; all identify application source c8d021dd.

Existing detailed requirements/evidence remain in
[Phase 7 acceptance](MORPHEUS_PHASE7_ACCEPTANCE.md) and
[Windows candidate evidence](phase7-i-windows-candidate.md).
