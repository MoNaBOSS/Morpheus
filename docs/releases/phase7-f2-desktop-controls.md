# Phase 7 F2 — typed Windows controls

2026-10-02, after publication integration `95167aeb`. Source implementation,
not full Phase 7 or final-installer acceptance.

## Scope

The original Core now exposes `app.controlWindow` (focus/minimize/restore),
`media.control` (named Spotify play/pause) and `audio.setVolume` (explicit
whole default-output percentage). Anchored English commands use the deterministic
interpreter, no provider request. Existing permissions, audit-before-events,
resource leases and cancellation remain authoritative. Exact historical starter
profiles upgrade; customized profiles and owner settings are not rewritten.

Fixed app-owned PowerShell/C# helpers receive bounded JSON, not scripts. Main
matches classic approved installations or the exact registered Store app family.
Window effects recheck HWND/PID/start time/image/foreground and the unlocked
desktop. No window titles, user documents or process lists cross the UI boundary.
Windows may refuse focus: success requires observation, not a sent request.
Spotify selects one known source ID, never the current arbitrary player or global
media keys. Volume binds the observed default output endpoint; no mic, mute or
device-selection change. Unknown effects are not automatically retried.

Short confirmations replace internal field grids in the existing result surface,
with en/zh/ja/ru coverage. No new dashboard or operating-mode selector.

## Evidence

- 53 focused parser/capability/profile/label tests passed before visual polish.
- Four fresh-build native Windows journeys passed in **29.4 seconds**, covering
  all locales, actual minimize/restore and observed focus (or honest OS denial)
  on a disposable, no-document WinForms fixture. Only the owned process is stopped.
- English also invokes the production media helper read-only: Windows default
  output discovery works, and WinRT Spotify enumeration returns either the
  identified session or an explicit absent/ambiguous result. User volume and
  playback are never changed by these tests. Media effects use injected unit replies.
- Rendered 1280×800 and 430×740 results, reduced motion, meaningful page, expected
  URL/title, no page errors, no clipping and actual state changes are checked.
  Browser plugin not available; repository Electron Playwright used. Screenshot
  review caught the internal field grid and replaced it with plain confirmations.
- All three typechecks pass. Scoped lint has zero errors and one inherited
  SupportedActions fast-refresh warning. Communication replay/compare pass.
- Cross-drive scratch testing found a pre-existing log-reader containment bug:
  Windows `relative()` can return an absolute path for another drive. The guard
  now rejects it; explicit alternate-drive and UNC regression plus targeted
  native/host/cache suite passes **90 tests**.

First full run hit C: temporary-space exhaustion; no user data was removed.
Scratch moved to `E:\Morpheus-builds\phase7-scratch-20261002`. The first E: full
run exposed that cross-drive guard bug; do not confuse those failures with
approved final results. Final combined result is recorded in the acceptance ledger.

Fresh native screenshots: `E:\Morpheus-builds\phase7-f2-evidence-20261002-0135`.
Local logs: `E:\Morpheus-builds\phase7-scratch-20261002\f2-*.log`.

## Remaining gates

Real Spotify controls/output-volume changes, supported installed Store apps,
lock/sleep races, native performance distributions and the final package need
acceptance. Four fixture journeys are not a 30-sample latency qualification or
proof of every installed app. Next: G1/G2 actual runtime joins and usage; H/I
recovery/performance/new installer. Existing executable predates these changes.

Native contracts checked against Microsoft:
[foreground restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow),
[window state](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindowasync),
[named media session](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession.sourceappusermodelid?view=winrt-26100),
[output scalar](https://learn.microsoft.com/en-us/windows/win32/api/endpointvolume/nf-endpointvolume-iaudioendpointvolume-setmastervolumelevelscalar).
