# Release readiness boundaries

Local verification does not establish signed distribution, clean-machine installer
behavior, voice acoustics or successful paid-provider work. Keep those as explicit
release gates. Never create keys, buy credit, publish a release or change OS policy
to hide a failed gate. CI artifacts are review candidates, not public approval.

Platform-emulation tests must emulate node:path alongside process.platform.
Windows file-mode tests must not pretend chmod establishes POSIX access controls.
Keep file-copy, original preservation and symlink exclusion assertions active.

Voice endpoint errors may expose only an HTTP status and a locally authored
recovery explanation. Never return raw error bodies, authorization headers or
transcripts in diagnostics. A configured key is not a successful endpoint test.
