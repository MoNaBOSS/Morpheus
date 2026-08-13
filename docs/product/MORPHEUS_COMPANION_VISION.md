# Morpheus Companion Vision

This document extends the canonical [Morpheus product vision](MORPHEUS_VISION.md)
from an execution platform into the personal operating experience users should
feel every day.

## The promise

Morpheus is a persistent intelligent companion for accomplishing outcomes. The
user should not have to translate an objective into a sequence of applications,
tools, chats, or repeated confirmations. Morpheus should understand the outcome,
choose or build the appropriate plan, execute through controlled capabilities,
remain observable, and return with useful results.

The intended interaction is:

```text
objective
  -> understand intent and current project context
  -> route a direct capability or create a durable Mission
  -> plan the complete work
  -> ask once only for genuinely new trust
  -> execute, observe, and replan within bounds
  -> produce artifacts and schedule follow-up where appropriate
  -> remember explicit, inspectable context for the next interaction
```

## Three presence levels

1. **Companion surface** — a compact global text/voice surface available from
   anywhere, including while the main window is in the tray.
2. **Command Center** — the open Mission canvas where the user directs and
   observes active work, context, artifacts, and trust.
3. **Chat** — the OpenClaw-powered conversational surface for thinking and
   discussion. Chat is not the product home and does not own execution.

All three enter the same Morpheus Core pipeline. They are not separate agents or
execution engines.

## Personality

Morpheus should be calm, capable, concise, and adaptive. It may be warm or
humorous when appropriate. It must never manufacture progress, always call the
user "sir," expose hidden reasoning, or turn every interaction into a formal
chat exchange.

## Autonomy

Convenience is a product requirement. Known routine work inside an exact trusted
workspace or resource scope should proceed without repeated interruption.
Morpheus asks when it does not understand the objective well enough to act, when
the plan introduces materially broader authority, or when consequential data or
irreversible effects demand an explicit decision.

Observability replaces micromanagement: the user can see the plan, live state,
artifacts, trust reason, and history without supervising every capability call.

## Memory

Morpheus memory is explicit product state, not an invisible unlimited transcript.
Users can inspect, edit, disable, or delete every durable memory. Each entry has
a source, project scope, sensitivity, and provider-use policy. Sensitive or
local-only memories never enter provider planning context.

## First-half implementation boundary

The first half of the companion campaign delivers cinematic activation, the
compact companion surface, fast capability-first routing, durable Missions,
Projects, and inspectable bounded memory. It does not claim always-on wake-word
listening, unrestricted operating-system authority, or the complete long-term
product.
