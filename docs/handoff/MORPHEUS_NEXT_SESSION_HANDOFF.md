# Morpheus Signal OS — Next-Session Handoff

## Product truth

Morpheus is a persistent, voice-first autonomous AI operator and AI system
builder. It is not primarily a chatbot and it is not merely a Windows
automation utility.

```text
objective from voice, Invoke, Command Center, Chat or schedule
  -> understand intent and context
  -> select an Agent Profile or workflow when useful
  -> create a typed plan
  -> evaluate the whole plan against exact trust
  -> ask once only for a genuinely new or consequential boundary
  -> execute deterministically and observe progress
  -> replan within bounded authority when needed
  -> return spoken/visual results and artifacts
  -> preserve inspectable Mission, Activity and audit history
```

Chat is secondary. OpenClaw remains the embedded Chat and agent runtime, while
Morpheus owns visible identity, planning, trust, execution, artifacts, Missions,
workflows, schedules, and the product experience.

## Signal OS implementation state

The prior UAT finding—that the installed application felt like inherited Chat
rather than a coherent operator—has been addressed in committed runtime
`8ba4568`:

- original Signal identity and reusable state grammar;
- cinematic first-run activation with real calibration, personalization, a
  real first mission, final ready state, and natural Command Center entry;
- a compact product rail that makes Command, Missions, Systems, Library, Chat,
  and Invoke the primary surfaces;
- a Today / Mission / Context Command Center with command, status, trust,
  progress, results, and artifacts above the fold at 1280×800;
- compact Presence/Invoke for immediate voice or text objectives;
- restyled whole-plan trust dialogue with the safest decision focused;
- OpenClaw Chat preserved but visually and conceptually secondary.

The experience uses a restrained Matrix influence: near-black layered surfaces,
precise typography, green only for live/verified state, an original signal
field, premium motion, and reduced-motion support. No actor image or likeness is
part of the product.

## Verified vertical slice

A fresh synthetic packaged profile completed the full first-user journey:

1. setup entered the full-window Morpheus activation;
2. calibration truthfully reported 19 capabilities and a connected runtime;
3. companion behavior and spoken-result preference were presented;
4. the real privacy-safe `system.report` first mission executed automatically
   under Balanced;
5. the mission completed one step and produced one real system artifact;
6. activation reached **Morpheus is ready** / **COMPLETE**;
7. Enter Command Center transitioned naturally into the Signal OS home surface;
8. all packaged processes and the Gateway listener were clean after shutdown.

The existing-profile smoke separately verified Gateway readiness, Command,
Invoke, real execution and a fresh usable Chat. Runtime source `0d85962` fixes
the misleading restored-session composer state: workspace/session readiness is
now reported separately and never masquerades as a Gateway disconnection.

## Current technical and release state

- Branch: `codex/morpheus-production-companion`
- Larry review runtime source: `0d85962`
- Signal OS runtime source: `8ba4568`
- Signal OS doctrine: `1af1f25`
- Installer: `C:\Morpheus\morpheus-core\release\Morpheus-1.0.0-win-x64.exe`
- Size: 263,671,900 bytes
- SHA-256: `1F97350612062BE49D2FD6B03B79C9A81FE8E14591EB95FAA4AEDEA0D721C6B5`
- Authenticode: `NotSigned`
- Generated release files and screenshots are ignored and must not be committed.

Recorded verification:

- 615/615 Morpheus unit tests passed across 65 files.
- Core Signal OS E2E passed 23/23.
- Full Morpheus E2E passed 51/51; Chat/Gateway canaries passed 16/16.
- The repository-wide suite passed 2,570 tests with 2 pending and retains 16
  inherited Windows path/mock failures in three untouched OpenClaw test files.
- Typecheck, harness, communication replay/comparison, and Vite build passed.
- Lint had zero errors and 12 inherited Fast Refresh warnings.
- NSIS packaging, existing-profile smoke, and fresh-profile activation smoke
  passed.

## Provider and voice truth

- Provider-backed broad planning and transcription need compatible credentials.
- The voice implementation uses an OpenAI-compatible audio transcription
  endpoint; not every chat reseller supports it.
- Never paste keys into prompts, commits, screenshots, or documentation.
- A public release must not embed a company master key in Electron. Use a secure
  managed backend with identity, quotas, metering, and abuse protection while
  retaining optional BYOK.
- Automated UI verification does not prove microphone recognition or acoustic
  quality. Test push-to-talk, latency, spoken output, and barge-in by hand.

## Non-negotiable boundaries

- Main owns policy, trust, execution authority, filesystem roots, and audit.
- Renderer sends logical capability IDs and validated parameters only.
- No arbitrary executable paths, argv, environment variables, unrestricted
  roots, shell, or PowerShell authority.
- Provider output is untrusted planning input, never direct OS authority.
- Evaluate trust for the full plan and batch genuinely new boundaries once.
- Existing exact workspace/session/persistent grants prevent repeated prompts.
- Critical financial, credential, privilege, destructive/irreversible, and
  security-changing boundaries retain explicit protection.
- Do not fork editions, add fake events, or create Larry-specific/demo paths.

## Next acceptance step

Use the packaged installer and
[`../releases/LARRY_REVIEW_GUIDE.md`](../releases/LARRY_REVIEW_GUIDE.md) on the
target machine to test the human journey:

1. first launch and activation comprehension;
2. push-to-talk discoverability and real microphone transcription;
3. one deterministic objective and one broad provider-planned objective;
4. one scoped remembered grant and its reuse;
5. tray/background behavior and global Invoke recall;
6. fresh Chat plus a restored historical session, checking that non-Gateway
   readiness states are explained truthfully;
7. perceived speed, personality, spoken output, and visual clarity.

Fix evidence-backed defects from that session before signing or distributing an
external tester build. Infrastructure completion, automated verification,
packaged runtime verification, and human UX acceptance must remain separately
reported.
