# Morpheus experience and implementation plan

**September 29 update:** bottom-right presence above the taskbar supersedes the
older left/top-right corner choices below. The hover composer opens upward without
stealing focus. See [the PC continuation handoff](../../PC_CODEX_START_HERE.md)
for current implementation evidence and next steps; the use cases here remain.

> Archive of the original plan, copied into Git for cross-device continuity on 2026-09-23. Phases 0–4 were subsequently authorised and implemented as an internal source checkpoint. The original task-local links and early status below are historical and may not resolve on Mac. For current status and approved UI, read [the Mac handoff](MORPHEUS_MAC_HANDOFF.md) first.

Planning snapshot: 2026-09-21. Prepared from the user's decisions in this conversation and a read-only review of the existing repository. No application implementation is authorised by this document alone; the user requested planning now and implementation in a fresh task after finalisation.

Progress update, 2026-09-22: the user subsequently authorised **Phase 0**, now completed in this task. See the baseline report (historical archive: `../morpheus-phase-0/PHASE_0_REPORT.md`) for the preserved candidate, fresh tests, corrected voice/secret-storage facts and migration contract. The user then narrowed Phase 1 to interface prototypes only and authorised Phase 2. The interface review (historical archive: `../morpheus-interface-prototype/PHASE_1_INTERFACE_REPORT.md`) is built and awaiting approval; voice auditions and the G1 voice choice are deferred. The Phase 2 checkpoint (historical archive: `../morpheus-phase-2/PHASE_2_STATUS.md`) records the real Windows orb/voice integration and the unpassed hardware, streaming-STT and secret-migration gates. Do not count Phase 2 as accepted.

## 1. Product direction and evidence

Morpheus is a persistent personal desktop operator with natural English speech, useful autonomy, memory, ongoing work, and an entertaining personality. A clear request should lead naturally to action and a verified result. The interface should not narrate internal context assembly, routing, plan generation, and execution stages to the user.

The reference video presents: wake -> request to prepare a stream -> coordinate applications -> report readiness -> wait for the go-live instruction -> make a relevant suggestion -> understand a follow-up and show a trailer. This is the interaction reference, not proof that those integrations currently exist or work reliably.

- Reference video: `C:/Users/monir/Downloads/WhatsApp Video 2026-09-08 at 11.03.53 PM.mp4`.
- Approved orb: [retained orb artwork](../design/morpheus-experience/orb.png).
- Existing app mark: [retained M logo](../design/morpheus-experience/favicon.svg).
- Approved layout direction: **A** in the original layout comparison (image not retained in this checkout), becoming compact like **D** when reduced.
- Digital rain reference: the original Matrix rain image (not retained in this checkout). It is a visual reference, not a production background asset.
- The comparison is a static concept image, not a built or tested interface. Earlier rejected logo/UI generations are not design authority.

The existing M remains the application logo. The supplied circular green mark is the companion orb. They have different roles and must not replace one another.

## 2. Confirmed user decisions

### First launch and onboarding

1. Setup means the first app launch **after installation**. The installer itself stays straightforward.
2. The orb greets the user, asks what to call them, and guides setup conversationally with supporting controls.
3. After the name, show animated green digital rain and the welcome: “Welcome to the Matrix world, [name].”
4. Ask “What would you like me to help you with?” Users may speak, type, or select optional interest suggestions. They may choose several interests or describe their own.
5. Tailor setup to those interests. A complex request with meaningful missing information gets a relevant follow-up. Clear simple commands execute directly; complexity alone does not justify another question.
6. For “help me make money,” the chosen first follow-up is “Do you already have an idea, or would you like me to suggest a few?” Support real research and business work with evidence and artefacts; revenue is an objective, not a guaranteed result.
7. Ask follow-ups aloud and accept voice or text. After about eight seconds **following the end of the question**, if there is no response, say “You can choose one of these, too,” and reveal compact clickable suggestions. Stop this timer when speech or typing begins. Show the fallback once; do not nag.
8. Three natural English voice previews, each demonstrating a greeting, a joke, and a task update. The previous robotic voice is not acceptable quality.
9. A prepared welcome/demo followed by a small **real** trial, then minimal guided account/provider setup. Clearly distinguish prepared examples from actual executed work.
10. Keep defaults sensible and setup short. Preferences remain changeable later, including by natural language. Skip optional personalisation rather than turning onboarding into a long questionnaire.

### Presence, layout, and animation

11. Full application uses the immersive Matrix rain direction A. Reducing the window adapts it into the compact D layout. This does not mean using split-screen concept C for onboarding.
12. “Keep listening in tray” plays a short transition and leaves Morpheus running in the Windows tray. Calling the name brings the animated orb to the left corner.
13. A wake initially shows **only the orb**. Clicking it opens compact chat. Expand opens the full adaptive workspace.
14. If Morpheus asks a question from the orb and receives no answer, the eight-second fallback opens the compact chatbox with suggestions.
15. A bare wake followed by silence must not invent answer options. An ignored unsolicited check-in also must not open a panel.
16. The full interface centres on conversation, opening research, files, previews, and results alongside it when useful. Existing tools and administration remain reachable without dominating everyday use.
17. After a completed quick interaction, return quietly to the orb. Do not collapse a workspace the user deliberately opened and is reading, editing, or using.
18. Jokes and check-ins need only the speaking/listening orb. Optional captions may accompany it. Panels appear when selected or needed for meaningful interaction.
19. Rain dims behind readable content and slows/pauses when inactive. Support reduced motion. Animation reflects real state; it does not imply fabricated progress or understanding.
20. Occasional cinematic copy is welcome. Example for tray: “Going quiet. You haven't escaped the Matrix.” Vary and limit repetition.

### Voice, greetings, and personality

21. A natural English voice is required. Calling “Morpheus” or the configured “wake up” alias starts interaction; a wake-and-command in one breath goes straight to the request.
22. Greetings adapt to the situation: brief during work, warmer after time away. Persist interaction history so a quick restart does not produce another first greeting. Same-day return is a break; overnight return may receive a daily greeting. Crossing midnight during an active session does not reset it.
23. Personality is a witty companion with lots of humour, friendly teasing, movie/anime references including One Piece, and occasional questions about the user's day.
24. Users choose Gentle, Cheeky, or Unfiltered humour; Morpheus also adapts to individual reactions. On a bad day, try gentle humour then offer to listen; drop humour when unwelcome or inappropriate to the moment.
25. Users choose Quiet, Balanced, or Talkative proactivity. Each can have occasional social moments at a suitable frequency. Explicit Do not disturb silences unsolicited social interaction.
26. Use meaningful local triggers: first interaction, return after a break, task completion, conversation context, or an occasional idle moment. Avoid continuous paid model calls searching for opportunities to speak.
27. Hold routine interruptions during calls, games, presentations, or focused work when detectable. Provide a manual quiet control for cases the OS cannot detect reliably. An ignored check-in reduces frequency.
28. Do not claim to know emotions. Adapt to what users share and conversational cues, and check gently if useful. No continuous audio/screenshot upload for mood monitoring.
29. Interruptible speech, natural follow-ups, mute, and typing must work together. “Stop talking” stops speech; “cancel the research” cancels the named task.

### Autonomy, work, and memory

30. Start Balanced. Clear routine requests proceed promptly. “Always do this without asking” learns an explicit, inspectable standing permission for that action and context.
31. Preserve the existing execution authority and permission engine. Make grants useful and durable for routine work rather than showing repeated tool-by-tool approvals. A humour or subscription setting is not an operating-system permission.
32. Opening YouTube, Instagram, another requested site, or an installed app is an ordinary navigation/launch capability; do not unnecessarily send it through model planning or make it edition-specific.
33. During background research, “Open Spotify” executes promptly while independent research continues. Tasks competing for the same desktop/app/file resource need coordination.
34. After restart, reconcile what completed, then resume unfinished work where possible and briefly report it. Never blindly replay completed or outcome-uncertain external actions.
35. On failure, try reasonable alternatives before interrupting. Bound retries, elapsed time, and spend; report honestly when completion is impossible or needs user input.
36. Deliver routine background results when the user is available. Hold them during focused activity; urgent delivery follows the user's notification preferences.
37. Local memory by default; optional sync only for selected preferences and memories.
38. Automatically retain useful preferences, routines, important project details, unfinished tasks, and concise useful memories from casual conversation. Do not make full transcripts the automatic long-term relationship memory.
39. Memories are inspectable, correctable, removable, and exportable. Reconcile existing chat-history retention separately from memory extraction; do not silently delete existing conversations.
40. No selling user data. Minimise hosted account data and explain which context goes to external model providers. Local storage does not mean all inference is local.

### Models, editions, and expansion

41. Direct commands before models where applicable. Inexpensive capable models for routine work; stronger models for complex work; stable ownership per task and relevant shared context across handoffs.
42. Keep voice and personality consistent across routes. Avoid automatically rewriting every answer through another model for humour.
43. Free/Basic: preserve existing desktop and companion capabilities using the user's own API accounts. Charge for managed AI/voice and defined advanced services, not by removing the established core.
44. Premium: Morpheus-managed tested providers, automatic routing, natural voice, and included usage. Clear allowance, optional top-ups, or explicit switching to the user's own provider when allowance runs out. No surprise charges or silent billing-account switch.
45. Unrestricted: Premium-quality assistance plus the user's NerdGPT-powered spicy personality/provider experience. Profanity, roasts, and entertaining replies when requested. An evil-Morpheus animation appears in the chatbox after verified purchase/activation.
46. NerdGPT is the user's planned platform and a Larry requirement. It is unfinished and not an integration-ready dependency. Its renovation is later, when needed. Do not substitute an assumed external vendor or consider a public landing page proof of the owner's runtime readiness.
47. One application and runtime across editions. Distinctions are centrally defined entitlements/configuration, not separate source forks or bypasses around the task engine.
48. Future macOS, Android, and bootable edition. Share suitable contracts, preferences, task concepts, and provider adapters; implement device controls and permissions separately. Do not claim equal device access everywhere.

## 3. Design defaults selected for implementation review

These are recommended implementation defaults inferred from the decisions above. They are not additional answers claimed on the user's behalf. Adjust through the planned visual review, without restarting the questionnaire.

| Area | Selected default |
| --- | --- |
| Main style | Near-black, emerald digital rain with depth/soft trails, clear warm-white text; restrained opaque surfaces behind reading areas |
| Logo/orb | Existing M in titlebar, installer and tray; supplied orb shape for presence, listening and speech |
| Orb construction | Reproduce the approved silhouette as an editable native vector/motion asset; confirm fidelity against the supplied image |
| First-run composition | Large welcoming orb and short spoken question over full-window rain; one decision visible at a time |
| Desktop placement | Bottom-left of the active monitor's work area by default, clear of taskbar; draggable and position remembered |
| Compact surface | Narrow readable conversation panel attached to the orb; voice/text input, necessary suggestions, current task/result, expand and mute |
| Full surface | Conversation with a context-sensitive results pane; small accessible task drawer and settings entry |
| Responsive behaviour | Reflow into compact mode without restarting the conversation, losing drafts, or disconnecting tasks; use separate enter/leave thresholds to prevent resize flicker |
| Focus | Wake, jokes, and routine notifications do not steal keyboard focus; clicking/type interaction does |
| Controls | Orb click opens compact; explicit expand opens full; dismiss returns to orb; tray listening and Quit are distinct |
| Motion | Short panel/orb transitions, audio-responsive glow, capped background animation, suspended hidden rendering, reduced-motion equivalent |
| First-use defaults | Balanced proactivity, Cheeky humour preview, English, three voice auditions; all readily editable |
| Captions | Available by toggle, with typing always available; no mandatory transcript panel during orb-only conversation |
| End of interaction | Collapse auto-opened transient surfaces; preserve explicitly opened documents/workspaces |
| Accounts | Offer Google and email sign-in, not Google-only; prepared welcome before sign-in, authenticated live trial afterward |
| Billing UI | Plain included-usage display and one manage-plan entry; provider/model mechanics kept in advanced settings |
| Unrestricted reveal | Brief evil-Morpheus variation of the approved orb with a playful line, skip/reduced-motion support; normal identity remains recognisable |

Do not generate a new logo or revisit A/B/C/D layout selection. Do not adopt every decorative detail of the generated comparison as a specification. Build editable components; visual mockups alone do not count as working UI.

## 4. Current repository baseline and gaps

Inspected repository: `C:/Morpheus/morpheus-core`.

- Branch: `codex/morpheus-windows-production-candidate`.
- HEAD at review: `9908e7d`.
- Substantial tracked and untracked work already exists, including the 1.1.2 candidate. It belongs to the user and must be preserved.
- `PROJECT_HANDOFF.md` reports historical tests and packaging. Those are prior evidence, not checks rerun for this plan or proof of accepted voice quality.
- The source review confirms an existing React/Electron interface, Main-owned Objective Core, native capability registry, typed plans, grants, audit, local stores, OpenClaw integration, onboarding, Matrix rain, tray/compact presentation, local wake adapter, and speech service.

| Work area | Existing anchors relative to repository | What changes |
| --- | --- | --- |
| Matrix and orb | `src/components/morpheus/boot/MatrixRain.tsx`, `signal/MorpheusSignal.tsx`, `src/styles/globals.css` | Approved orb silhouette, persistent readable rain, shared motion/state treatment |
| Onboarding | `src/components/morpheus/onboarding/`, `electron/services/morpheus/onboarding/onboarding-store.ts` | Conversational first-use flow, interests, voice samples, timed suggestions, managed-trial states |
| Desktop presence | `electron/main/morpheus-companion-surface.ts`, `morpheus-voice-background.ts`, `tray.ts`, `src/components/morpheus/MorpheusQuickCommand.tsx` | Orb-only mode, compact/full transitions, non-focus-stealing wake, tray handoff |
| Voice | `electron/services/morpheus/voice/`, `src/components/morpheus/MorpheusVoiceRuntime.tsx`, `src/lib/morpheus-voice-dialogue.ts`, `morpheus-ambient-voice.ts`, `morpheus-speech-player.ts` | Reliable real-device wake, natural speech, endpointing, interruption and conversational continuity |
| Tasks | `electron/services/morpheus/core/`, `plan/`, `missions/`, `workflows/`, `schedules/`, `goals/`, `systems/` | Independent task scheduling, foreground responsiveness, checkpoint reconciliation and recovery |
| Permissions | `electron/services/morpheus/policy/`, `plan/trust.ts`, `src/components/morpheus/PermissionCenter.tsx` | Useful standing permissions and minimal interruptions through existing controls |
| Memory/proactivity | `electron/services/morpheus/memory/`, `proactive/`, `shared/morpheus/memory-types.ts` | Useful automatic memories, greeting history, check-ins, adaptation and quiet behaviour |
| Full workspace | `src/pages/Chat/`, `src/pages/CommandCenter/`, existing stores and components | Adaptive conversation/results view using shared task state |
| Routing/cost | `electron/services/morpheus/planning/`, `shared/morpheus/provider-policy.ts`, provider services and OpenClaw usage paths | Stable task routing and cost accounting across all task/voice/agent routes |
| Accounts/billing | Existing provider-account setup is not a Morpheus subscription backend | Add minimal hosted identity, trial, entitlement, gateway and billing services later |

Specific gaps requiring engineering rather than a visual refresh:

- Current voice transcription sends a completed recording and waits for the response. Streaming output exists, but that is not equivalent to streaming recognition.
- Phase 0 correction: the Renderer dialogue helper accepts one follow-up within a 12-second addressing window, but Main already supports 15-second follow-up windows with nominal eight-turn / five-minute session limits. Preserve this existing multi-turn work. Reconcile both paths with the planned eight-second awaiting-answer suggestion timer; do not confuse that timer with the whole voice session lifetime.
- The current orchestrator explicitly rejects a new objective while another is active (`objective-orchestrator.ts`, around line 918). “Open Spotify while researching” requires scheduler work, not a second UI button.
- The compact controller currently resizes/focuses the existing window. Orb-only, non-focus-stealing desktop behaviour needs explicit window-lifecycle design.
- Existing docs report real microphone initialisation and neural-authentication problems in prior candidates. Reproduce with current settings; do not label those resolved from unit tests.
- Core limits do not currently establish a global cap across independent OpenClaw activity, speech, research, and hosted trial use.
- Installed-app launch support is currently registered and bounded; this does not demonstrate arbitrary application control or the streaming-video routine.
- Phase 0 found that Main-owned provider secrets use a JSON-backed electron-store implementation, not verified OS-keychain encryption. Preserve account mappings and plan protected-secret migration before broader credential-dependent distribution.
- Inherited telemetry defaults to enabled and uses a machine identifier for install/open events. This is not proof of data selling, but disclosure, explicit choice and minimisation need to be reconciled with the local-first experience.

## 5. Architecture decisions

### Keep the existing core

Voice, compact chat, the full workspace, scheduled tasks, and proactive work all use the existing authoritative task system. Preserve OpenClaw chat, gateway, agents, channels, skills, workflows/cron, attachments and provider compatibility. No new private executor in the orb or renderer.

Renderer uses `src/lib/host-api.ts` and `src/lib/api-client.ts`; Main owns execution, provider secrets, grants, lifecycle and verified results. Shared contracts remain platform-neutral. Future platform-specific capabilities register through adapters.

Introduce a shared presentation state for tray/orb/compact/full and a conversation state for addressed/listening/speaking/awaiting-answer/idle. A single active task flag must not suppress a new wake or a harmless independent command. Persist task identity across surfaces; hiding a window does not cancel work.

### Scheduling and recovery

Keep individual typed plans ordered unless a verified dependency graph permits otherwise. Add coordination above them: network/background work may continue independently, while foreground desktop control and writes to the same resources are serialised. Manual quick commands take priority over background work competing for foreground control.

Persist checkpoints, action identifiers and observed results. On restart, verify completed steps and reconcile uncertain effects before continuing. Use deduplication for notifications and externally visible actions. Local tasks cannot continue while the PC is powered off; they resume later. Future hosted continuation is a separate capability.

### Model routing and speech

Use direct registered actions for clear commands, an evaluated everyday model for conversation/routine interpretation, and a stronger model for complex work. Avoid a mandatory extra model call merely to dispatch every request. Pin the selected model to a task where practical; escalate with the original request, relevant context, verified results and remaining objective. A model's self-reported confidence alone is insufficient to establish task correctness.

Keep shared memory and task state outside provider sessions. Preserve tool-call/result pairing and prevent duplicate execution during retries or provider fallback. Stream useful speech when available, but never announce an action as completed before its result is verified.

Use one compatible user provider account for tasks and voice where supported. Optional advanced accounts remain possible. Exact providers and voice models are chosen from real auditions and measured task performance at implementation time; earlier named models are candidates, not permanent defaults.

### Minimal hosted service

Proposed default: managed authentication and Postgres (for example Supabase) plus a small server-side provider gateway and an eligible hosted checkout service. This is an implementation recommendation, not a purchased or provisioned stack.

Store account identity, devices, subscription/entitlement state, trial balances and usage records. Store selected memories only when sync is enabled. Keep local BYOK keys local by default; managed provider keys stay server-side. Use payment events to update entitlement state, not a browser success page alone. Reserve and reconcile usage across simultaneous jobs so parallel requests cannot overspend the same remaining allowance.

Hosted checkout must cover plan change, cancellation, failed payment, restore purchase and receipts. Select the payment provider after the owner's business/payment country is known. Do not assume Stripe availability from the user's current location.

Unrestricted and Premium share the same backend and execution engine. NerdGPT connects through the existing provider boundary after renovation and evaluation. No pretend NerdGPT responses or paid entitlement for an unavailable product.

## 6. Implementation phases and completion criteria

### Codex development model assignment

Added 2026-09-21. These are recommended **development** models and reasoning levels for building Morpheus, not the models shipped inside Morpheus or compulsory technical dependencies. Model roles are engineering judgement based on task risk and official model descriptions, not results of a Morpheus-specific model benchmark. Availability and quota depend on the Codex account; API token prices must not be interpreted as subscription usage rates.

**Practical default:** GPT-5.6 Sol with High reasoning for implementation. Use GPT-6 Astra for decisions spanning the architecture and for difficult failures. Use Terra for narrowly specified routine changes; Luna is optional for small mechanical tasks, not needed as a phase owner. If using just one model to minimise handoffs, choose Astra with High reasoning when allowance permits, or Sol with High reasoning for a more economical default.

| Phase | Recommended lead model / reasoning | Supporting work and escalation |
| --- | --- | --- |
| 0 — Preserve/reconcile baseline | **GPT-6 Astra — High** | Reconcile the large existing diff, requirements and architecture. Terra/Medium may organise an already-verified inventory. |
| 1 — Design and voice selection | **GPT-6 Astra — High** | Own interaction coherence and visual review. Sol/High implements the prototype; Terra/Medium handles bounded styling fixes after the direction is established. Real voice audition remains required. |
| 2 — Presence and voice | **GPT-5.6 Sol — High** | Implement Electron window/audio integration and lifecycle tests. Escalate cross-process races, persistent wake failures or difficult latency diagnosis to Astra/XHigh. |
| 3 — Scheduling, permissions and recovery | **GPT-6 Astra — XHigh** | Own scheduler/checkpoint/grant design and difficult integration. Sol/High can implement clearly specified slices and tests after those contracts are established. |
| 4 — Workspace, onboarding and companion behaviour | **GPT-5.6 Sol — High** | Integrate stateful user journeys and memory behaviour. Terra/Medium for defined components, copy and locale wiring; Astra/High reviews cross-surface inconsistencies. |
| 5 — Routing and complete cost controls | **GPT-6 Astra — High** | Design/interpret evaluations and ensure every paid path is covered. Sol/High builds routing, metering and test fixtures; Terra/Medium formats measured results. |
| 6 — Accounts, trial, gateway and billing | **GPT-6 Astra — High** | Establish identity, entitlements, usage reservation and billing-event contracts. Sol/High implements and tests the service; use Astra/XHigh for unresolved concurrency/accounting failures. |
| 7 — Windows acceptance and release preparation | **GPT-5.6 Sol — High** | Run/diagnose packaged and upgrade journeys. Astra/High reviews unresolved release risks and whole-product acceptance; actual device/user testing remains required. |
| 8 — NerdGPT and Unrestricted | **GPT-5.6 Sol — High** | Implement the adapter, entitlement, reveal and continuity checks once NerdGPT exists. Use Astra/High to design the separate NerdGPT renovation when its actual code/scope is available. |
| 9 — Platform expansion | **GPT-6 Astra — High** | Define each platform's architecture and support boundaries. Sol/High implements one platform adapter at a time; reassess model availability when this later phase begins. |

Use XHigh selectively for difficult architecture/debugging, rather than making Max/Ultra the default for every change. Switch at a completed task boundary where possible; save the request, changed files, evidence, open issues and next action first. Do not switch merely because a fixed number of turns elapsed. A model change does not replace the required repository review, tests or human voice/design acceptance.

**First fresh task:** select `gpt-6-astra` with `high` reasoning for Phase 0 and the initial design review. Keep its handoff on disk. Move to `gpt-5.6-sol` with `high` reasoning for bounded implementation work after the architecture/design choices are concrete. This recommendation does not itself change the current task's model, create agents, or start implementation.

Official OpenAI documentation checked for the model roles: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) for the hardest end-to-end work; [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) for complex professional work; [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) for balancing intelligence and cost; [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) for cost-sensitive workloads. Recheck the Codex model picker when a later phase starts; do not silently substitute a different named model.

### Phase 0 — Preserve and reconcile the baseline

**Status: complete — 2026-09-21.** Phase 0 report (historical archive: `../morpheus-phase-0/PHASE_0_REPORT.md`): 66 modified and 31 untracked files preserved; 1,248 source files restored and hash-verified; 834 targeted unit tests and both typechecks passed; read-only lint passed with 24 warnings and no errors. Existing application source and runtime settings remain unchanged. Hardware voice and packaged acceptance were not run.

**Work:** inventory all existing capabilities and classify verified/partial/untested/missing. Record the current working tree and reconcile this brief with canonical docs before source changes. Preserve all current changes and settings. Do not start an isolated checkout from HEAD alone and accidentally discard the uncommitted candidate.

**Completion:** a capability/change map, targeted baseline evidence, known failures, and a recoverable implementation starting point. Existing settings and data migrations are explicitly planned.

**Documentation conflicts to reconcile:** older docs limit rain to boot, use Free/Pro/Ultra or two-edition naming, say no demo, and require fully sequential work. The user's newer decisions authorise persistent rain, Basic/Premium/Unrestricted, a prepared welcome plus real trial, and independent concurrent tasks. Update those exact product assumptions during implementation while preserving truthful execution, platform boundaries and existing capabilities.

### Phase 1 — Concrete design and voice selection

**Work:** build an editable interactive prototype using the approved references and existing React/design primitives. Cover first launch, silence fallback, full-to-compact resize, tray handoff, orb wake, a task/result, and an error. Use clearly labelled sample data only in the review prototype. Prepare three real natural English voice samples with the same greeting, joke, and task update.

**Selected direction:** A-style full rain, D-style compact, approved orb; full conversation gains a results pane when useful. No new logo exploration or tool-shopping round.

**Review checkpoint G1:** user reviews a working interaction and chooses the voice by listening. This is a necessary experiential decision, not another questionnaire about obvious details.

**Completion:** approved component/motion direction and voice choice, with responsive behaviour and readable content demonstrated. Public trial sign-in and billing can remain visibly marked prototype states here.

### Phase 2 — Reliable Windows presence and voice

**Work:** integrate tray/orb/compact/full transitions, local wake, mute and keyboard access, natural speech playback, speech endpointing, supported streaming recognition, echo control, interruptions and follow-ups. Connect animation to real audio/lifecycle signals. Keep useful stage timing and cost measurements from this phase onward.

**Completion:** on the target PC, complete repeated tray -> wake -> spoken command -> actual action -> natural spoken result -> follow-up -> interruption cycles. Check speaker/headset use, microphone changes, mute, sleep/resume, offline/provider failure and no focus theft. User explicitly accepts the actual voice. Native/Windows fallback must be identified honestly; it cannot silently pass as the chosen voice.

**Dependency:** use existing owner/BYOK credentials for internal review. Public no-key live conversation depends on Phase 6. This is not permission to create new paid accounts or incur an unspecified trial budget.

**Baseline preflight:** preserve current multi-turn follow-ups and resolve the conflicting 12-/15-second lifecycle paths. Review protected local credential storage through the existing secret-store interface; any migration must meet the Phase 0 data-preservation contract and must not reset accounts.

### Phase 3 — Responsive work, learned permissions, and recovery

Progress 2026-09-23: source implementation delivered for PC acceptance. See
Phase 3 status and test checklist (historical archive: `../morpheus-phase-3/PHASE_3_STATUS.md`) and the
task-root `RESUME.md` for continuity. This does not close Phase 2's real-device gates.

**Work:** add independent task scheduling, foreground/resource coordination, clear task cancellation, durable checkpoints and restart reconciliation. Extend the registered app/integration catalogue needed for agreed routines. Make saved permissions useful through “Always do this without asking.” Bound retries and offer recovery only when needed.

**Completion:** research continues while a quick app command succeeds; two tasks do not fight over the same foreground window/file; cancelling speech does not cancel research; cancelling research stops that task. After restart, unfinished work resumes without duplicated completed effects. Routine authorised work does not prompt for every step.

### Phase 4 — Adaptive workspace, onboarding, and companion behaviour

**Correction after user review, 2026-09-23:** The Phase 1 interface study is the selected visual direction; it was built separately and has not been integrated into the Electron app. The current Command Center shown in the user screenshot is rejected as the default experience. Before extending this phase into personality, memory or backend work, complete one narrow visual-integration checkpoint: real full workspace and first-launch appearance, then compact/orb transitions, using the Phase 1 study and the existing runtime. The everyday surface shows conversation, the orb, active work and results when useful. Ask/Auto/Act modes, trust profiles, internal task stages and provider/system panels are not part of that surface. Present screenshots of the actual app for review. Passing Phase 3 engine tests does not satisfy this visual checkpoint.

**Work:** integrate the conversation/results workspace, short guided onboarding, three voice previews, interests, eight-second suggestions, tray choice, greeting history, local memory extraction and controls, humour/proactivity settings, and considerate notifications. Keep existing tools discoverable under contextual navigation/settings. Existing users retain their providers, tasks and preferences and can preview/replay the new introduction without being forced through first-run setup.

**Bootstrap detail:** bundled prepared speech can greet before an API connection. Personalised generated speech and unrestricted spoken answers require an available local speech path, BYOK, or authenticated trial. For public onboarding, show the short account step before cloud-backed name capture; typing and local name display remain available. Do not advertise a no-key live conversation while secretly requiring an unconfigured provider. The final prototype must show this transition explicitly.

**Privacy preflight:** make telemetry disclosure and choice explicit; review the inherited enabled-by-default machine-identifier behavior before public release. Preserve explicit existing preferences and do not conflate cloud memory sync, microphone consent and diagnostic telemetry.

**Completion:** complete first launch with voice and with typing; suggestions appear once after genuine silence; ignored social check-ins do not open panels; remembered preferences survive restart; forgetting a memory removes it from later context; notifications respect availability; all surfaces share conversation/task state.

### Phase 5 — Quality-preserving routing and complete cost control

**Work:** evaluate the small routing set against a stronger-model baseline on representative Morpheus tasks. Add stable task ownership, shared context, bounded fallback and consistent persona/voice. Consolidate task, OpenClaw, STT, TTS and other paid-service usage accounting. Support user-specified BYOK budgets where usage can be measured; distinguish app-enforced estimates from the provider's actual bill.

**Completion:** report task success, time to useful action/first audio, corrections, handoff failures and cost per successful task. Choose routing based on this evidence. No quality claim based only on cheap token pricing. Unobserved paid routes must be identified before claiming a complete spending cap.

**Recommendation:** do not route every technically complex answer through NerdGPT just to add spice. Use it directly for selected spicy conversations and keep verified task results intact. Integrate actual tool use only after compatibility tests.

### Phase 6 — Accounts, live trial, managed access, and billing

2026-09-28 source checkpoint: the authorized payment-independent layer now includes
configurable Google/email account Settings and a runnable account-only service.
See [implementation, readiness and next slices](MORPHEUS_PHASE6_READINESS.md) and
the [PC return runbook](MORPHEUS_PC_RETURN_2026-09-28.md).
This does not mark the live trial, billing or Phase 6 completion criteria below as met.

**Work:** implement Google/email login, trial allowance, server-side provider gateway, central entitlements, usage reservation/accounting, checkout and account management. Connect the already-designed onboarding to the real trial. Add opt-in selected-memory sync with deletion propagation and conflict handling only when that service is ready.

**Completion:** a fresh user sees the prepared welcome, signs in, performs a real task with natural voice, views allowance, connects BYOK or purchases Premium, and can cancel/manage their subscription. Trial exhaustion is clear, no surprise charges occur, simultaneous tasks cannot overdraw quota, and payment events control entitlement. Basic remains usable with configured user providers when hosted services are unavailable, subject to the providers themselves being reachable.

**Required later facts:** business/payment country, owner credentials, a per-user trial policy, and measured costs for pricing. The owner has set no evaluation spending limit; that does not define an unlimited public trial. These do not block Phases 0–5. Do not invent fixed subscription prices or a production provider selection now.

### Phase 7 — Windows acceptance and release preparation

**Work:** test the actual packaged application, existing-user upgrade and fresh installation, normal Windows permissions, high DPI/multiple monitors, microphone hardware, idle resource use, connectivity failures, provider errors and real usage. Complete signing/update/distribution work according to the existing release gates when credentials and release authority are available.

**Completion:** the user accepts the complete experience against the scenarios below. A passing build or attractive screenshot alone is insufficient. Distinguish internal BYOK candidate acceptance from a public release that includes the managed trial/billing backend.

**Sequencing:** internal Windows review can proceed after Phases 0–5 while Phase 6 is pending. Public managed-trial release requires Phase 6. NerdGPT is not a dependency for the Basic/Premium release.

### Phase 8 — NerdGPT renovation and Unrestricted activation

**Work:** when needed, scope NerdGPT's actual repository/service renovation separately. Establish task/chat compatibility, response quality, latency, usage accounting and persona controls. Then connect it through Morpheus's provider adapter and entitlement service. Build the evil-Morpheus purchase reveal and a discoverable return to the normal tone.

**Review checkpoint G3:** show the reveal and representative spicy replies once NerdGPT exists and is testable. Do not repeatedly interrupt users or replay the reveal on every restart.

**Completion:** confirmed entitlement activates the real NerdGPT route; conversation continuity and normal task quality persist; usage is metered; unavailable NerdGPT is explained without pretending another model is it. Sell this tier only when its promised route works.

### Phase 9 — Platform expansion

**Work:** reuse appropriate platform-neutral logic while adding platform-specific capability, wake, audio, window, background and permission adapters. Plan macOS separately from Android/mobile constraints. Define whether Android is a remote companion, local operator or both before implementation. Define the bootable product's USB/ISO, storage and installation behaviour before that campaign.

**Completion:** each platform has an honest supported-capability list and its own device tests. Do not promise Windows desktop control on Android or execute remote-device tasks without an explicit device target. No need to choose a bootable distribution or rewrite the Windows shell now.

## 7. Experience acceptance scenarios

| Scenario | Required observable outcome |
| --- | --- |
| First run, prepared start | Orb greeting and Matrix welcome are polished; typing/mic controls and any needed account step are understandable |
| Personalisation | Name, interests, voice, humour and proactivity are retained; defaults keep setup brief |
| Silence | Eight-second fallback starts after Morpheus finishes speaking, cancels on input, and shows clickable options once |
| Tray wake | App remains listening as selected; “Morpheus” presents the orb without taking keyboard focus |
| Direct command | “Morpheus, open YouTube” performs the action without an unnecessary clarification or internal planning narration |
| Voice interruption | User can interrupt speech and immediately give a new instruction; old audio does not resume unexpectedly |
| Concurrent tasks | Research continues while Spotify opens; each task has correct identity and results |
| Restart | Interrupted work is reconciled and resumed without duplicating completed steps; greeting does not repeat after a quick restart |
| Recovery | Reasonable alternatives are attempted within limits; genuine blockers are clear and actionable |
| Resize/expand | Full A-style scene reflows into compact D-style chat and back, preserving drafts, task state and opened results |
| Quiet availability | Routine completion/check-in waits during focused use; ignored check-ins back off; Do not disturb is effective |
| Personality | User-selected humour and individual preferences affect replies; serious moments receive an appropriate tone |
| Memory | Useful details are remembered locally; correction/deletion changes future responses; sync is opt-in |
| Allowance | All supported managed cost paths respect quota; top-up/BYOK switch requires explicit choice |
| Unrestricted, later | Real NerdGPT powers the selected experience and verified activation triggers the reveal without changing execution authority |
| Existing user | Existing capabilities, files, accounts, tasks, histories and settings survive the upgrade |

Proposed measurement protocol: representative direct, routine, complex and humorous requests; repeated actual microphone/speaker trials; restart mid-task; quiet and talkative sessions; provider outage and low-credit scenarios. Record wake success/false activations, first useful audio/action time, interruption delay, completed tasks, idle CPU/GPU/memory and actual paid usage. Set numerical release thresholds after measuring the target PC and selected providers; none are claimed achieved now.

## 8. Repository validation and handoff discipline

- Re-read applicable `AGENTS.md`, `CLAUDE.md`, current handoff and relevant canonical documents in the implementation task; reconcile known product conflicts rather than silently following obsolete choices.
- Preserve current tracked/untracked work. No reset, cleaning, profile deletion, mass rewrite, or implicit checkout from an incomplete baseline.
- Changes use existing tokens and shared primitives; intentionally update the visual specification/tokens where the user's Matrix direction supersedes older styling rules.
- Preserve the repository's i18n requirements for existing supported locales even though the chosen speaking language is English.
- UI changes include meaningful Electron journey coverage as required by the repository. Run appropriate unit/type/build checks; communication changes follow the existing harness and replay/compare gates.
- The repository's `lint` script uses `--fix`; do not run it during a read-only audit or mistake its changes for user edits. Use a non-mutating equivalent for inspection.
- Update relevant docs and acceptance evidence alongside implementation. Prior candidate test counts are historical.
- Keep one implementation owner per phase and one independent reviewer where useful; don't have two coding agents edit the same files simultaneously.
- At each phase end, record what changed, evidence, unresolved issues and the exact next step. Keep the plan and decisions on disk so a long conversation is not the only source of continuity.
- Design/voice reviews: **G1** interactive direction and voice samples; **G2** actual integrated first-use/wake/task experience at Phases 2–4; **G3** NerdGPT reveal/personality later. Routine implementation choices use the defaults in this plan.

## 9. First implementation assignment

Phase 0 is complete. The next task, when authorised, starts with the saved Phase 0 report and prepares the Phase 1 review using the approved references. Recheck for later repository changes rather than redoing the audit blindly. Base work on the existing uncommitted candidate, not a replacement application. The first demonstrable integrated slice across the following implementation phases is:

**tray -> wake -> approved orb -> “open an app” -> real execution -> natural spoken result -> follow-up -> compact/full expansion with shared state.**

Develop the Matrix onboarding and voice audition alongside that slice, using the same components. Complex scheduling, hosted billing, and NerdGPT follow their dependencies rather than entering this first patch.

This plan and its defaults are ready for the user's final review. The actual selected voice, live trial budget, payment country, subscription amounts and future platform-specific product definitions remain later decision gates, not reasons to restart the experience questionnaire.
