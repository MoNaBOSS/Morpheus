# Morpheus Product Brain

> Canonical product memory. Read this with `MORPHEUS_VISION.md` before making a
> product or architecture decision. This file records the durable experience;
> release documents record how much of it is currently implemented.

## The product

Morpheus is a voice-first autonomous AI execution platform and AI system
builder. It is not primarily a chat client, a collection of Windows shortcuts,
or a model provider wrapper.

The defining loop is:

```text
VOICE / TEXT / QUICK COMMAND / CHAT EXECUTION
  -> understand objective and bounded context
  -> choose an Agent Profile or workflow
  -> produce a validated typed plan
  -> evaluate the complete trust delta
  -> execute deterministic capabilities
  -> observe structured results
  -> replan when the objective is not yet satisfied
  -> produce results and artifacts
  -> explain or speak the outcome
  -> retain useful, privacy-respecting context and audit history
```

The user delegates an objective. They do not supervise individual tool calls.
Morpheus interrupts only when it cannot understand the objective safely, when a
replan introduces a genuinely new or materially broader trust boundary, or when
an unwaivable consequential action requires confirmation.

## One core, several surfaces

Command Center, Voice, Quick Command and Chat execution mode are entry surfaces
into the same Morpheus Core. They do not own separate planners, permission
systems, execution engines, memories or histories.

- **Command Center** is the primary instrument: objective, state, plan,
  execution, artifacts and trust.
- **Voice** is a first-class input and optional output, not a second command
  grammar.
- **Quick Command** is the global, low-friction overlay for immediate work.
- **Chat** remains the OpenClaw conversation surface and can explicitly submit
  an objective into Morpheus Core without changing ordinary chat semantics.

## Runtime ownership

Morpheus owns objective orchestration, planning contracts, validation,
observation/replanning, context selection, Agent Profiles, workflows, schedules,
permissions, capabilities, artifacts, Activity and Audit.

OpenClaw remains the embedded chat and agent runtime behind an adapter. Providers
such as Claude, OpenAI, Gemini, NerdGPT and local models are replaceable reasoning
backends. Neither OpenClaw nor a provider receives direct operating-system
authority.

Provider output is untrusted proposal data:

```text
provider output -> schema parse -> capability/parameter validation
  -> Main target resolution -> policy -> deterministic adapter
```

## Autonomy and trust

- Evaluate permissions at objective/plan level.
- Ask once for the deduplicated new boundaries of the complete plan.
- Reuse exact workspace, application, device and service trust.
- Re-evaluate only the trust delta introduced by a continuation or replan.
- Keep execution visible and auditable without turning observability into
  repeated interruption.
- Critical boundaries remain unwaivable: financial or wallet signing,
  credentials/secrets, privilege elevation, destructive or irreversible work,
  security changes and materially broader authority.

Balanced must be convenient. Autonomous must feel autonomous. Neither profile
means arbitrary shell access.

## Windows 1.0 Foundation experience

A successful foundation interaction is usable, not merely typed:

1. The user activates Morpheus by voice or keyboard.
2. Morpheus identifies the active workspace and relevant bounded context.
3. A configured provider creates a valid multi-step plan, or the deterministic
   fallback truthfully handles its narrower supported set.
4. Main computes one trust delta and asks at most once before execution.
5. Steps execute sequentially through registered Windows capabilities.
6. Structured results return to the objective orchestrator.
7. The planner determines whether the objective is complete and may issue a
   bounded continuation plan.
8. The user may stop or correct the objective.
9. Morpheus presents artifacts and a concise outcome, and may speak it.

## Product quality rule

Types, adapters, pages and placeholders are not product completion. A feature
counts only when its real user journey works, its state is truthful, its
authority boundary is enforced, and the packaged application has been tested.
