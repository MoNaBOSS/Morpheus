# Phase 7 C3 next actions

Read-only source inspection during packaging of candidate `6e19fadc`, 2026-10-01.
Product source and package identity were not changed.

## Existing foundation and evidence

Activation already implements name/skip, Matrix backdrop, useful first request,
optional personalization and saved completion. Completed profiles do not repeat
activation. The v1 migration preserves existing speech/personality/completion;
profile edits preserve completion and permissions. Existing companion-missions
Electron source covers first setup, suggestions and quick restart, but was not
rerun during packaging.

Four focused unit files passed 12/12: onboarding store, social check-in,
proactive service and bounded context selector. These prove synthetic profile
preservation, social dismissal on DND/work, persisted DND notification suppression
and context bounds. They do not prove daily greeting, returning DND or natural
persona consistency.

## Concrete source gaps

1. `MorpheusArrival.tsx` uses renderer localStorage `morpheus-last-welcome-at`
   with a two-hour threshold and a once-per-mount ref. It has no daily date,
   persisted meaningful-interaction state or DND check. `MorpheusWelcome.tsx`
   automatically speaks when speech preferences allow, with no DND guard, and
   uses a modal returning arrival. Quick restart suppression exists; daily/long
   return/DND behavior does not meet the current quiet-companion contract.
2. Persona content is split between `morpheus-api.ts` onboarding memory text,
   its separate profile-edit text, and voice-service `speechInstructions`.
   A humor edit replaces the communication-style memory with a different
   formulation while leaving legacy `preferences.personality` unchanged. TTS
   reads that personality field; conversation sends `pending.text` through ACP.
   A shared versioned persona composer consumed by conversation and speech was
   not found. Objective context can consume bounded preferences, but that alone
   does not establish a unified conversational persona.
3. Activation's eight-second timer follows playback of the welcome sentence;
   the actual first-question text is displayed separately. Compact
   `MorpheusQuickCommand.tsx` renders clarification text with no equivalent
   genuine-question fallback timer. `MorpheusSocialCheckIn.tsx` adds answer
   buttons after eight seconds to an ignored social check-in, contrary to the
   architecture's explicit exclusion of ignored social check-ins.

## First bounded implementation action after this package checkpoint

Start a C3 arrival-policy harness task and failing fake-clock component/policy
tests before changing production source: completed profile + DND + return after
two hours must remain quiet; quick restart must not greet; long-return/daily
eligibility must avoid a modal and be persisted by the existing Main owner;
midnight during active work must not greet. Then route Arrival/Welcome through
that one Main-owned greeting decision and test isolated fresh-build Electron
restart/DND behavior. Preserve explicit manual welcome access.

Next separately unify the bounded persona composer and genuine-question
presentation timer, with existing owner/context/ACP boundaries preserved and no
second paid personality model. Do not count the package candidate or the 12
source unit passes as C3 acceptance. Real returning usage, human persona/voice
judgment and packaged journeys remain required.
