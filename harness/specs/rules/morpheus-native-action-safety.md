---
id: morpheus-native-action-safety
title: Morpheus Native Action Safety
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
---

Morpheus native actions execute real operating system work. Authority for what may run, where it may write, and whether it may proceed belongs to the Electron Main process alone. The durable architecture contract is `harness/reference/morpheus-execution-architecture.md`.

Renderer input is limited to a logical action identifier and validated parameters. The Renderer must never supply or influence an executable path, an argument vector, environment variables, a shell string, a working directory, or an unrestricted filesystem path. Action requests are validated against an explicit parameter key whitelist, and unknown keys are rejected rather than ignored.

The action registry and the set of approved applications are compiled into the product and frozen at load. They must never be sourced from renderer-writable state such as the settings store, nor from configuration files that the Renderer can reach through any host action. Capability implementations are resolved by action identifier and platform; an unsupported platform is a typed outcome, not an error, so future platform support is added as new modules without altering the runtime.

Executable resolution requires an exact registry key match without normalization or case folding, a base directory taken from a trusted process environment value rather than from any payload, a link status check confirming a regular non-symbolic file, and a real path containment check proving the resolved target still lies inside the expected system directory. Native processes are launched with shell disabled, with fixed arguments from the registry, with window hiding on Windows, and with a bounded abort timer.

Filesystem writes are confined to a root that Main canonicalizes once at startup. File names are validated against a strict grammar and are additionally rejected when they match reserved device names or end in a dot or space. Creation uses an exclusive create flag so an existing entry or a previously planted link cannot be written through. Content size is bounded.

Every action in this milestone requires an explicit confirmation. Execution is reachable only from the awaiting-permission phase, only for a live run identifier, and only once; the pending record is removed before execution so a repeated response cannot cause a second run. Unanswered requests expire and are recorded as denied. Concurrency and request rate are bounded.

Each real phase transition is persisted to the append-only audit log before the corresponding host event is emitted, so the interface can never display an outcome the audit did not capture. Audit records must exclude text file content, credentials, tokens, secrets, and full sensitive filesystem paths; content is represented by a byte count and a truncated digest. The audit location is never disclosed to the Renderer and is not writable through any host action.

Execution timelines are populated only by real Main-process events. Simulated, seeded, replayed, or Renderer-fabricated phase transitions are not permitted.

The Morpheus action runtime must remain independent of the agent runtime that ships alongside it. Its modules must not import Gateway or ACP service code, so provider integrations stay replaceable.
