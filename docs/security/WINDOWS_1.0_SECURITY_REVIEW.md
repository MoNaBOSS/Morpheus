# Morpheus Windows 1.0 Security Review

Status: implementation remediations complete; release verification pending
Baseline reviewed: `ffeeacf`
Review date: 2026-08-11

## Scope

The review focused on the Windows desktop trust boundary: preload exposure,
typed host invocation, provider credentials, Gateway RPC, local-file preview,
native shell operations, Morpheus permissions/audit, voice disclosure controls,
webview isolation, and NSIS installation behavior.

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

## Existing controls retained

- `nodeIntegration` is disabled and `contextIsolation` is enabled.
- The host bridge uses typed module/action dispatch and validates its sender.
- Morpheus providers can propose typed plans but cannot execute capabilities.
- Capability policy, exact-scope grants, execution, artifacts and audit remain
  Main-owned.
- Audit records are persisted before runtime events are emitted; degraded audit
  health blocks state-changing/process actions.
- Voice audio is bounded, disclosure-aware and ephemeral by default.
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

Windows 1.0 may be called security-reviewed only after the focused security
tests, full typecheck/lint, Morpheus unit/E2E suites, package build, and packaged
production smoke test all complete. Any remaining failure or credential gap
must be reported explicitly in the release acceptance record.
