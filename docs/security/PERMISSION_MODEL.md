# Morpheus — Permission and Trust Model

> Canonical security contract. Implementation lives in
> `electron/services/morpheus/policy/`. Invariants here are enforced by
> `tests/unit/morpheus-policy-*.test.ts`.

## Position

Morpheus performs real operating-system work on behalf of a user who cannot audit
every action personally. Two failure modes are equally unacceptable:

- **Confirm everything** — trains users to click through prompts without reading,
  and makes the product feel like supervising a tool rather than delegating work.
- **Trust everything** — hands an AI provider unrestricted machine authority.

The answer is **narrow, remembered, revocable consent** graded by risk, evaluated
**per plan rather than per call**.

### The interruption principle (0.5)

> Ask when the trust boundary changes. Not every time a function executes.

Morpheus analyses the user's whole intent, builds a complete plan, evaluates all
of its scopes together against the active profile and existing grants, and asks
**once** — only for boundaries that are genuinely new or materially wider than
what was already authorized. A plan that stays inside existing trust runs with no
interruption at all.

Observation and replanning do not reset trust. Exact matching grants continue to
apply across continuation plans inside an objective; only a genuinely new or
materially wider scope is surfaced as a new trust delta. Approval of one plan is
not blanket approval for anything a later planner invents.

Interruption is reserved for:

- a command Morpheus did not understand well enough to plan safely
- genuinely consequential trust changes (see `critical` below)
- access materially broader than anything previously authorized

Balanced should feel convenient. Autonomous should feel genuinely autonomous.

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
| `low` | No disclosure, no durable state, nothing to undo | Runs automatically outside Strict |
| `medium` | Bounded side effect in an approved scope | Asks once per new scope; grantable |
| `high` | Sensitive or wide-reaching, but reversible | Asks once per new scope; **grantable**. Never auto-runs on an unseen scope. |
| `critical` | Irreversible, financial, or security-affecting | **Unwaivable.** Always confirms. |

`high` is deliberately grantable. Making sensitive-but-reversible work prompt
forever produces prompt fatigue, which is itself a security failure: users stop
reading. Screenshots and clipboard reads sit here — visible and audited, but not
a dialog every time.

### Screen capture

The most sensitive capability in 0.5, and the one where the user may not be
looking at Morpheus when it runs. Its guarantees:

- Asks the first time for a scope; grantable for a session or persistently.
  Never automatic on a scope the user has not seen, under any profile.
- The image is written **inside the approved workspace root** (`captures/`).
  The filename is Main-generated from a timestamp, so no caller-supplied string
  reaches a filesystem path. The capability takes **no parameters at all**.
- Every capture is audited by path, size and digest — never by content.
- Capture is **visible**. The Command Center shows a live indicator derived from
  the same audited event stream that records the run, so it cannot announce a
  capture that did not happen or miss one that did. A failed, denied or
  cancelled capture never announces success.
- Blocked entirely when auditing is degraded: a capture that cannot be recorded
  does not happen.

### Clipboard

Read and write are separate capabilities with separate scopes, and neither
belongs to a group. The clipboard routinely holds passwords and tokens copied
for an unrelated purpose, so "Morpheus may put text on my clipboard" must never
imply "Morpheus may read what is already there". Both are grantable.

### Capability groups — workspace-shaped trust

Trust is workspace-shaped in practice. A user who has approved a workspace
expects Morpheus to read, list and search inside it without a fresh dialog for
each verb; asking separately for `file.readText`, `file.list` and `file.search`
over one directory is three prompts describing one decision already made.

`MORPHEUS_CAPABILITY_GROUPS` is a **frozen, enumerated** list of member
capability ids per group. A grant against a group still binds to one canonical
root, one platform and one origin — every other field matches by exact
equality, and "allow every file operation everywhere" remains impossible to
express. The consent prompt names the **group**, never a single member verb.

| Group | Members |
| --- | --- |
| `workspace.read` | `file.readText`, `file.list`, `file.search` |
| `workspace.write` | `file.createText`, `file.appendText`, `file.move`, `file.copy`, `folder.create` |

Rules that keep grouping from becoming a wildcard:

- No `critical` capability may belong to a group. A workspace decision must
  never reach something the mandatory floor governs.
- Read and write are **separate** groups. Approving "look at my files" is not
  approving "change them".
- Anything sensitive-but-unrelated is ungrouped: clipboard reads, clipboard
  writes, screen capture and application launches are each their own scope.

The grant scope for a filesystem target is the **workspace root**, never the
file's parent directory — otherwise every subfolder would be a new boundary and
a user who approved a workspace would be re-prompted as work nested deeper.

### Current capabilities

| Capability | Tier | Group | Rationale |
| --- | --- | --- | --- |
| `system.report` | `low` | — | Read-only; excludes username, hostname, network interfaces, machine id |
| `system.storage` | `low` | — | Reports aggregate bytes only for the Main-owned Morpheus workspace root |
| `system.processes` | `high` | — | Bounded process-name/PID/memory disclosure; no command lines or environment |
| `system.notify` | `low` | — | Transient OS notification; reads nothing, leaves nothing |
| `file.readText` | `medium` | `workspace.read` | Reads one file inside the canonical root |
| `file.list` | `medium` | `workspace.read` | Lists a directory inside the canonical root |
| `file.search` | `medium` | `workspace.read` | Matches file NAMES only, never contents |
| `file.createText` | `medium` | `workspace.write` | Exclusive-create, no overwrite |
| `file.appendText` | `medium` | `workspace.write` | Additive; cannot overwrite |
| `file.move` | `medium` | `workspace.write` | Refuses an existing destination |
| `file.copy` | `medium` | `workspace.write` | `COPYFILE_EXCL`; refuses an existing destination |
| `folder.create` | `medium` | `workspace.write` | Creates a directory inside the canonical root |
| `app.launch` | `medium` | — | Compiled-in approved application, fixed argv, per-application scope |
| `clipboard.writeText` | `medium` | — | Replaces clipboard contents; discloses nothing |
| `clipboard.readText` | `high` | — | Reads what the user copied, which routinely includes secrets |
| `screen.capture` | `high` | — | Records the screen, including other applications |
| `web.openUrl` | `medium` | — | Validated HTTP(S) URL opened through Electron; no custom/file protocols |
| `dev.launchProject` | `medium` | — | Compiled-in VS Code template with one Main-canonicalized workspace folder |
| `file.delete` | `critical` | — | Irreversible |

### `critical` — always confirms, regardless of profile or grant

This is the only unwaivable tier. Morpheus 0.5 implements only bounded workspace
deletion from this class; the wider invariants are encoded and tested so future
capabilities cannot weaken them by accident:

- File deletion or overwrite of existing content
- Financial or cryptocurrency transactions
- Wallet signing
- Credential or secret access
- Privilege elevation
- Software installation
- Arbitrary shell / PowerShell execution
- Security-setting changes
- Any irreversible action

Note what is **no longer** on this list: broad filesystem *reads*, screenshots and
external messaging are sensitive but reversible, so they are `high` and grantable
rather than permanently interrupting.

## Permission profiles

### Strict

- Privacy-safe read-only operations run automatically.
- Everything else — including low-risk notifications — **asks every time**.
- Grants are not consulted for medium and above.

### Balanced — default

- Privacy-safe read-only operations run automatically.
- Low-risk operations run automatically.
- Medium and high risk ask the **first time for a given scope**, then honour the grant.
- The user may allow once, for the session, or permanently **for an exact scope**.
- A plan whose scopes are all already granted runs with no prompt at all.

### Autonomous

- Low-risk operations run automatically.
- Medium-risk operations run automatically **inside explicitly trusted scopes**.
- High risk surfaces once for a scope the user has never seen, then follows the grant.
- `critical` still confirms, always.

> Autonomous is **not** arbitrary shell access. It widens where remembered trust
> applies; it never removes the `critical` floor.

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

## Voice and provider privacy

- Microphone audio is ephemeral by default, validated for type/size/duration and
  never persisted to Audit.
- Transcription and planning credentials remain in Main-owned secure storage.
- Planner context is bounded and excludes credentials, keys, raw audit files and
  unlimited transcripts.
- Spoken output is an explicit user-facing summary, not hidden reasoning or raw
  sensitive content.

## Permission Center

Settings hosts a Permission Center; the Command Center shows a compact summary. Both
display the active profile, session grants, persistent grants, denied scopes and
last-used time, and offer revoke, revoke-all-session and reset-policy.
