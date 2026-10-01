# H native readiness — partial source qualification

2026-10-02, based on `788e47dc` plus this checkpoint. No owner profile or paid
provider was used. Browser plugin unavailable; repository Electron Playwright.

The 48-journey regression initially passed 42. Five old device tests referenced
removed dashboard cards/status or expected confirmation for explicit Balanced
launches. They now assert selected task/result identity in the approved workspace;
the opt-in Strict launch test denies both exact targets, without starting apps.
Notification, scoped clipboard write/read, actual screenshot/denial and Strict
journeys subsequently passed. Clipboard text is restored after its fixture.

A real collapsed-orb click raced the Main DOM update: IPC returned while the
composer was still inert. The fixed sender-checked bridge now acknowledges the DOM
update before input focus. Escape cancels pending timers and suppresses resize-
generated pointer entry under a stationary cursor. Main reapplies visible/hover
state on renderer reload. No authority, task engine or microphone behavior changes.

Six final native journeys pass: four-locale repeated collapsed click/type/Escape,
draft preservation, reduced motion and screenshots; shared native/React motion;
native-to-compact-to-full continuity. Five corrected device journeys pass in the
preceding run. Initial failed runs are retained, not relabeled as passes.

## First warm native baseline

- Intel i5-14600K, 20 logical CPUs, 16,934,744,064 bytes RAM; Windows 10.0.26300.
- Electron 41.10.3 / Chromium 146.0.7680.216 / embedded Node 24.18.0.
- Reported display/work area 1920×1080, scale 1. Synthetic voice state only.
- 30 actual collapsed clicks: event receipt → first editable/focused frame,
  p50 **8.2 ms**, p95 **12.2 ms**, max **12.9 ms**.
- 30 hovers: first visible editable frame after subtracting the intentional
  140 ms dwell, p50 **10.8 ms**, p95 **14.6 ms**, max **15.2 ms**.
- 30-second active animation RAF sample: 6,000 intervals, p50 **5.0 ms**,
  p95 **5.1 ms**, max **5.4 ms**. This measures renderer callback pacing under
  automation, **not proof of physical display presentation or perceived 60 fps**.

No parallel builds/tests were running during this trace. Gateway was inactive.
This is the first recorded warm source baseline, not a before/after speedup, cold
startup, loaded-worker, whole-product idle/CPU, 60-minute soak or hardware claim.
Those H/I gates remain open. Process memory snapshots are in the raw attachment;
one snapshot cannot establish leak freedom. No thresholds were relaxed.

Local evidence: `E:\Morpheus-builds\phase7-h2-evidence-20261002` and HTML report
`E:\Morpheus-builds\phase7-h2-report-20261002` (raw distributions attached).
Device rerun: `phase7-h1-final-evidence-20261002-0243`. Logs under
`E:\Morpheus-builds\phase7-scratch-20261002\h*.log`.

Next: installer recovery qualification and fresh E: candidate, then packaged
normal-startup/hardware/live acceptance. G2.3 hosted conversation and G3/G4 are not
completed by native tests.
