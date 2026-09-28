# Morpheus experience review — Larry's Windows journey

Updated 2026-09-28. This document is a design specification and review guide.
It does not certify implementation of new desktop behavior. The browser preview
is separate from the Electron application. Its About panel explains the
illustrative desktop, tasks and voice input; normal product surfaces use natural
copy. No real files, microphone, calendar, account or AI provider is connected.
Read aloud and voice auditions use actual browser speech synthesis when available;
this is not the final production voice.

The preview source is `/Users/mona/Documents/Work/morpheus-experience-preview`.
A portable copy is included in [morpheus-experience/index.html](morpheus-experience/index.html).
Hosted publication is blocked: Sites reports the already registered project as
not found. There is no successful deployment URL. No new project or public
audience was created to work around that failure.
The animation comparison remains in [the motion study](MORPHEUS_MOTION_STUDY.md).

## How to direct design and animation

Use ordinary language. Start with the user moment and outcome, then the change:

> When Larry wakes Morpheus while working in another app, show only the small orb.
> It should feel calm and ready. Let the light appear gently, keep the M still,
> and reveal a text box on hover without moving keyboard focus. A click should
> focus typing and keep the box open. Preserve my draft when I dismiss it.
> Show idle, listening, interruption and reduced motion before integrating it.

A reusable command:

> In **[screen/state]**, when **[trigger]**, change **[element/behavior]** so it
> feels **[quality]**. Keep **[constraints]**. Compare **[alternatives]**. It is
> done when **[observable outcome]**.

You do not need all fields every time. Screenshots, a scene link, a short recording
or “this part feels too busy” are useful feedback. Ask for a diagnosis when the
problem is unclear rather than guessing a technical fix.

| Say this | What it directs |
| --- | --- |
| “Calmer while I work” | Less idle movement, lower glow, fewer unsolicited appearances |
| “More responsive when I speak” | Faster response to actual speech onset, gentle decay during pauses |
| “More fluid, less mechanical” | Continuous shape and velocity changes; soften abrupt starts/stops |
| “Less bouncy” | Reduce overshoot; retain a clear arrival without spring oscillation |
| “B's movement with A's glow” | Combine specific qualities while keeping the same brand artwork |
| “Show the slow connection case” | Review waiting, cancellation and recovery, not only the ideal path |
| “Make the next step obvious” | Clarify hierarchy, primary action and result affordances |
| “Keep my attention on my current app” | No unsolicited window expansion or focus theft |

For best results, decide in this order: the journey and behavior, the layout,
readability and hierarchy, motion, then decorative detail. Review one primary
change at a time and include the relevant failure/interrupt case. After choosing,
request integration into the real app with the existing locales and Electron tests.
A prototype approval is not evidence of live task execution or voice quality.

## Product and interaction system

Morpheus is the Windows companion and operator. Keep the approved M artwork,
dark green/teal palette, restrained Matrix atmosphere and conversational surface.
Use the proposed aurora for active interactions, a quiet halo while idle and a
steady state under reduced motion. This remains a recommendation pending selection.

Three everyday surfaces share one task history and state:

1. **Desktop presence:** a top-right orb/tray entry, quiet by default. Hover reveals
   the compact text composer without stealing focus; click/tap pins it and focuses
   typing. Pointer travel into the panel does not close it. Drafts keep it open;
   Escape or dismiss closes it while preserving the draft. Ctrl+/ also opens it.
2. **Compact conversation:** a short exchange, immediate action or clarification.
   Opening/closing it does not create another task or cancel background work.
3. **Full workspace:** longer results, multiple tasks, evidence, review and settings.
   Expansion preserves the selected task, draft and conversation position.

The Windows simulation demonstrates the relationship between those surfaces, a
Start menu, taskbar/tray and sample Files/Notes windows. It is not a Windows shell
replacement or a claim of native UI Automation coverage.

## State and motion contract

| Moment | What Larry sees | Motion and behavior | How to leave it |
| --- | --- | --- | --- |
| First opening | Name prompt with skip | Gentle arrival; stable M; no forced voice setup | Save name or skip |
| Welcome | Name, one useful prompt, optional personalization | Minimal ambient motion | Give a task or enter workspace |
| Returning | Existing work and readiness | Quiet halo; no repeated onboarding | Resume or give a new task |
| Wake/hover | Top-right orb and compact composer | Flowing contours; hover never steals focus; click/tap pins typing | Submit, expand or dismiss |
| Listening | Mic state and editable transcript | Actual microphone envelope in the real app | Submit, cancel or complete utterance |
| Unclear request | One concrete question | Steady questioning state; retain original objective | Answer or cancel |
| Preparing/working | Goal and factual step | Restrained motion; no invented progress percentage | Continue, background or cancel selected task |
| New permission boundary | Exact action, resource and consequences | Stable emphasis without an alarm | Allow narrowly or decline |
| Parallel work | Separate tasks and independent outcomes | One selected task drives detailed feedback | Switch task without changing other tasks |
| Speaking | Result and stop-speech control | Actual playback timing; amplitude only where available | Stop speech while preserving tasks |
| Success | Verified outcome and useful next action | Brief completion emphasis, then settle | Open artifact, copy, follow up or undo when supported |
| Failure | What failed and what remains | Calm error emphasis; no success motion | Explicit retry, correct input or cancel |
| Offline | What is available locally and what was not sent | Clear static connection state | Restore connection and explicitly retry |
| Quiet/reduced motion | Readable state and results | No unsolicited speech/focus; static feedback as requested | User changes preference |
| Interrupted/restarted | Last known task state and uncertainty | No fake completion; do not replay uncertain effects | Verify outcome before resuming |
| Account/trial unavailable | Truthful configuration/access state | No celebratory trial animation | Configure service or choose explicit BYOK |

## Missing requirements made explicit

- Distinguish **stop speech**, **cancel one task**, **minimize**, **close to tray**
  and **quit**. Record what continues after each.
- Never animate “listening” if the mic is muted or permission was denied. Give
  an accessible typing alternative and show where audio is processed.
- Keep temporary silence, transcription, thinking and speaking visibly distinct.
  A loop should not imply listening or a measured task percentage.
- Do not interrupt typing, a full-screen app, a call or quiet mode with social
  suggestions. Completion notifications should preserve focus.
- Explain partial completion, unsaved edits, retries, cancellation and restart
  recovery. Show evidence when an action claims it changed something.
- Keep permissions proportional: routine authorized work proceeds; new resource
  access or irreversible actions need a concrete explanation.
- Provide keyboard operation, clear focus, readable contrast, reduced motion,
  sensible high-DPI layouts and non-color state cues.
- Reconcile all surfaces with one task state. Never lose a draft while switching
  compact/full mode or let one task cancellation stop independent work.
- Preserve the distinction between provider access, Morpheus account identity,
  trial allowance and payment. No fake available plan or voice audition.

## Review sequence before the PC

1. Walk through Larry's opening → request → result journey in the preview.
2. Review the Windows surface transitions and independent background work.
3. Choose motion family/intensity, then review interruption and reduced motion.
4. Review clarification, permission, offline/failure and returning behavior.
5. Convert approved choices into a small implementation scope with acceptance
   criteria. Integrate real state/audio paths and all four locales in Electron.
6. On PC, verify actual wake/mic/playback latency, foreground control, tray,
   multi-monitor/high-DPI, resource usage, restart and packaged upgrade behavior.

The browser preview can validate interaction design. It cannot certify native
Windows operations, live voice quality, model quality, cloud cost or packaging.
The remaining Phase 6 gates still apply.

## Implemented design surfaces

- Full-viewport Windows-style desktop, centered taskbar, Start and quick settings,
  File Explorer, editable Notepad, desktop clock and completion notifications.
- First opening/name, welcome, ready, voice interaction, background work, results,
  interrupted return, and the top-right hover composer.
- Full workspace with task sidebar, activity history and shared task selection.
- Preferences: You, Voice, Appearance, Privacy and Account. Account status is
  explicitly unavailable; there is no fabricated sign-in, trial or payment flow.
- Three motion families, paused/reduced motion, quiet mode, narrow-screen layouts,
  clarification, permission, offline, retry, cancellation and undo.
- Experience tools contain scene navigation, the design-command guide, feedback
  and motion comparisons. Design explanations stay outside the everyday workflow.

The current browser defaults to the desktop so hovering the orb is immediately
available. Use Experience → Opening to inspect first use. A Windows production
implementation must retain native state boundaries, four locales and Electron
interaction coverage. Name and tone edits are session-local design controls.

Browser checks cover pointer travel and draft retention, quick request → full
workspace, file permission/undo, five settings tabs, activity restoration, desktop
orb animation and narrow-screen layout. Earlier journey checks cover background
work, interruption, offline/retry and speech cancellation. WebMCP validation was
unavailable in the local browser; no WebMCP support is certified.
