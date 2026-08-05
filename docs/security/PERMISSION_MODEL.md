# Morpheus — Permission and Trust Model

> Canonical security contract. Implementation lives in
> `electron/services/morpheus/policy/`. Invariants here are enforced by
> `tests/unit/morpheus-policy-*.test.ts`.

## Position

Morpheus performs real operating-system work on behalf of a user who cannot audit
every action personally. Two failure modes are equally unacceptable:

- **Confirm everything** — trains users to click through prompts without reading.
- **Trust everything** — hands an AI provider unrestricted machine authority.

The answer is **narrow, remembered, revocable consent** graded by risk.

## Authority

Policy and grants are owned by a **main-process service** with atomic writes.

The renderer **cannot** create, modify or delete a grant. It may only *request* an
action and *respond* to a permission prompt. Renderer state, Zustand persistence and
ordinary settings APIs are explicitly **not** the authority — `settings.set` is
renderer-reachable, so anything stored there is renderer-writable and therefore not
a security boundary.

## Risk tiers

Every capability descriptor declares a tier:

| Tier | Meaning | Default treatment |
| --- | --- | --- |
| `low` | Privacy-safe, read-only, no side effects | May run automatically |
| `medium` | Bounded side effect in an approved scope | Ask first time; grantable |
| `high` | Significant or hard-to-reverse effect | Always confirm |
| `critical` | Irreversible, financial, or security-affecting | Always confirm |

### Current capabilities

| Capability | Tier | Rationale |
| --- | --- | --- |
| `system.report` | `low` | Read-only; excludes username, hostname, network interfaces, machine id |
| `app.launch` | `medium` | Starts a process, but only a compiled-in approved application |
| `file.createText` | `medium` | Writes only inside the canonical root, exclusive-create, no overwrite |

### Reserved — always confirm regardless of profile or grant

Not implemented in this milestone. The policy invariants are encoded and tested now
so they cannot later be weakened by accident:

- File deletion or overwrite
- Financial or cryptocurrency transactions
- Wallet signing
- Credential or secret access
- Privilege elevation
- Software installation
- Arbitrary shell / PowerShell execution
- Broad filesystem access
- External messages, publishing, social posting
- Security-setting changes
- Any irreversible action

## Permission profiles

### Strict

- Privacy-safe read-only operations run automatically.
- Writes, launches and external actions **ask every time**.
- Grants are not consulted for medium and above.

### Balanced — default

- Privacy-safe read-only operations run automatically.
- Medium-risk operations ask the **first time**.
- The user may allow once, for the session, or permanently **for an exact scope**.
- A matching grant executes without another prompt.

### Autonomous

- Low-risk operations run automatically.
- Medium-risk operations run automatically **only inside explicitly trusted scopes**.
- High and critical risk still require confirmation.

> Autonomous is **not** arbitrary shell access. It widens where remembered trust
> applies; it never removes the mandatory-confirmation floor.

## Decision options

A permission prompt offers:

- Deny
- Always deny this exact action/scope
- Allow once
- Allow for this session
- Always allow this exact action/scope

Keyboard focus defaults to the **safest non-execution option** (Deny).

## Grant scope

A session or persistent grant records:

| Field | Purpose |
| --- | --- |
| `capabilityId` | Which action |
| `platform` | Which platform adapter |
| `resourceScope` | Exact resource — application key, canonical directory |
| `riskTier` | Tier at grant time |
| `originType` | How it was initiated (command bar, chat, workflow, schedule) |
| `agentId` | Optional agent/workflow identity |
| `createdAt` | Audit and display |
| `expiresAt` | Optional expiry |
| `grantType` | `once` / `session` / `persistent` / `denied-persistent` |
| `revokedAt` | Revocation state |

### Valid grants

- Always allow `app.launch` for the approved `notepad` application.
- Allow `file.createText` for this session inside the canonical Morpheus files root.
- Automatically allow privacy-safe `system.report`.

### Invalid — must be impossible to express

- Always allow every executable.
- Always allow arbitrary paths.
- Always allow arbitrary command-line arguments.
- Always allow shell or PowerShell commands.
- Treat one approved agent as authorized for every future capability.

Scope is matched by **exact equality** on capability, platform and resource. There
are no wildcards.

## Lifecycle

- **Session grants** expire when the application session ends.
- **Persistent grants** survive restart.
- **Revocation** takes effect on the next execution, without restart.
- **Scope change invalidates**: a different resource is a different scope and prompts
  again.
- **Mandatory confirmation cannot be bypassed** by any grant, however broad.

## Audit

Every grant, denial, revocation, profile change and grant *use* is audit-recorded.

Each phase transition is persisted **before** the corresponding event reaches the
renderer, so the interface can never display an outcome the audit did not capture.

Audit records never contain file content, credentials, tokens or secrets. Content is
represented by a byte count and a truncated digest.

### Degraded-security mode

When audit persistence is unhealthy, Morpheus **does not silently proceed**:

- It enters a **visible** degraded-security state.
- Only explicitly safe read-only operations are permitted.
- Write and process actions are **blocked** until auditing recovers.
- The reason is explained to the user.

Availability is not a sufficient reason to execute unaudited privileged work.

## Permission Center

Settings hosts a Permission Center; the Command Center shows a compact summary. Both
display the active profile, session grants, persistent grants, denied scopes and
last-used time, and offer revoke, revoke-all-session and reset-policy.
