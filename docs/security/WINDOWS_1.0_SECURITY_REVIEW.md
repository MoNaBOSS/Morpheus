# Morpheus Windows 1.0 Security Review

Status: production companion remediations and credential-independent release
verification complete
Production companion baseline reviewed: `b5cff47`
Final verified packaged source: `d9a2ac8d5c7cde2e4b0582bc1b2c8e3f9feace66`
Review date: 2026-08-14

## Scope

The review focused on the Windows desktop trust boundary: preload exposure,
typed host invocation, provider credentials, Gateway RPC, local-file preview,
native shell operations, Morpheus permissions/audit, provider-backed Objective
planning, ambient voice disclosure and capture ordering, proactive execution,
Goal/System persistence, webview isolation, and NSIS installation behavior.

The automated review covered the highest-risk desktop surfaces rather than all
repository files. Its scan identifier was
`b118a1c8-8a8d-4a5f-b02f-e63ed66ea711`. The local raw report is intentionally
outside the repository because it is a machine-specific verification artifact.

## Baseline findings and disposition

1. **Path-based preview APIs accepted arbitrary local reads — remediated.**
   Typed preview and native-open operations now require a canonical path inside
   a Main-owned OpenClaw, Morpheus workspace, artifact, user-data, staging, or
   active ACP root. Legacy path-based preview channels are no longer exposed by
   preload.
2. **Plaintext provider keys could return to Renderer — remediated.** Main keeps
   provider credentials for validation, runtime synchronization, planning, STT,
   and other provider calls. Renderer receives only configured/not-configured
   metadata.
3. **Renderer shell methods accepted arbitrary URLs and paths — remediated.**
   External URLs are restricted to HTTP(S), while path open/reveal operations
   require canonical containment in a Main-owned root. Legacy path methods are
   removed from preload exposure.
4. **Renderer could name any Gateway RPC method — remediated.** The compatibility
   bridge is restricted to the exact session and channel methods used by the
   inherited Chat and Channels stores. New privileged operations require typed
   Main services.
5. **Installer silently added a Windows Defender exclusion — removed.** Morpheus
   does not change Defender or Windows long-path policy.
6. **Installer globally terminated `openclaw-gateway.exe` — removed.** Upgrade
   cleanup is limited to the Morpheus executable tree and processes whose
   executable is owned by the installation directory.
7. **Ambient capture could begin before its audit transition — remediated.**
   Renderer now awaits the Main-owned, audit-persisted capture-start transition
   before starting `MediaRecorder`. Every accepted start is balanced by an end
   transition, including discarded or failed captures. If Main or audit rejects
   the start, no audio capture begins.

## Existing controls retained

- `nodeIntegration` is disabled and `contextIsolation` is enabled.
- The host bridge uses typed module/action dispatch and validates its sender.
- Morpheus providers can propose typed plans but cannot execute capabilities.
- Capability policy, exact-scope grants, execution, artifacts and audit remain
  Main-owned.
- Audit records are persisted before runtime events are emitted; degraded audit
  health blocks state-changing/process actions.
- Voice audio is bounded, disclosure-aware and ephemeral by default. Audio and
  transcripts are neither persisted nor written to audit.
- Ambient mode is opt-in, exact wake-phrase gated, visibly observable, and
  blocked when provider disclosure cannot be audited.
- Goals, attention items, Systems and voice settings use Main-owned validated
  stores with atomic replacement; definitions do not create permission grants.
- The live application renderer may perform sanitized clipboard writes for
  explicit copy controls. Chromium clipboard reads remain denied; Morpheus
  clipboard reads use the separate Main-owned, scoped and audited capability.
- Embedded browser guests have a separate partition and restrictive policy.
- Top-level renderer navigation is limited to the application document; web
  links are delegated to the default browser and custom protocols are blocked.

## Accepted compatibility constraints

The primary BrowserWindow remains `sandbox: false` for inherited OpenClaw and
Electron compatibility. This is not treated as authority: Node integration is
off, context isolation is on, navigation and popup policy are fail-closed, host
IPC is sender-bound, and privileged host routes validate their inputs. The
embedded browser uses its own sandboxed guest policy.

Internal `clawx` identifiers and migration markers may remain where changing
them would break stored OpenClaw compatibility. They are not product authority
and must not appear as the normal Morpheus UI identity.

## Release gate

Typecheck passed. Lint completed with zero errors and 12 inherited Fast Refresh
warnings. All 611 Morpheus unit tests passed. Harness validation/dry-run,
communication replay/comparison, focused permission/Command Center E2E (13/13),
and final voice/foundation/intelligence E2E (13/13) passed. The full Electron E2E
run produced 184 passes, 3 platform skips, and 4 initial failures: the Morpheus
regression was fixed, one inherited load flake passed alone, and two reproducible
untouched Chat regressions remain documented in `PROJECT_HANDOFF.md`. The full
unit run also retains 16 inherited Windows path/mock failures in three untouched
OpenClaw test files; all Morpheus tests are green.

The NSIS package and normal-production packaged smoke completed. First-run
activation reached SYSTEM READY, the Main-owned system report produced real
Mission/Activity records, Quick Command used the same Objective Core, and live
OpenClaw Chat returned a real provider response. One expected Electron process
tree ran without startup loops or current-launch fatal/error log patterns; every
packaged-owned process and port 18789 was clean after shutdown. The reviewed
installer is `Morpheus-1.0.0-win-x64.exe`, 263,669,614 bytes, SHA-256
`2D2F2388D051BC2907FB15067815373C9EB6415C290591C5EE61B48A33815E98`.

The review remains intentionally focused on the Windows desktop authority
boundaries listed above; it is not a claim that every inherited repository file
received an exhaustive security audit.

The local binaries are unsigned because production Authenticode is owned by the
authorized CI/signing environment. During smoke, the user's independent OpenClaw
configuration warned that
`browser.ssrfPolicy.dangerouslyAllowPrivateNetwork=true`; Morpheus reports this
condition but does not silently rewrite user-owned OpenClaw configuration. Both
limitations are documented release facts rather than hidden verification
successes.
