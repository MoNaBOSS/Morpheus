# Phase 1 — interface-only prototype

> Archived design specification copied into Git for cross-device continuity. The separate review prototype was approved and its key surfaces are now integrated into the app. Historical relative links to task-local references may not resolve; use [the Phase 4 screenshots](phase4-evidence/) and [the Mac handoff](../roadmap/MORPHEUS_MAC_HANDOFF.md) for the current implementation.

Scope authorised: interface prototypes only. Voice auditions, paid API calls, backend, native windows/microphone and application integration are deferred. This is an isolated React/Vite review, not a replacement application. No production source changes.

## Existing accepted specification

Use `../morpheus-implementation-plan/references/layout-comparison.png`, direction A becoming D; do not implement B/C or reopen logo selection. Reuse the exact approved orb PNG and existing M SVG. Extend the same visual system to task/results, tray and error states already requested in the plan. No new image-generation pass is necessary for this accepted direction.

## Design system before implementation

- Near-black #040907; surface #0c1411; emerald #53edb4; warm-white #edf5ef; muted #a0b6aa. Rain stays visible at edges, dim beneath reading surfaces.
- Segoe UI/system typography: 32–38px main question, 22px compact question, 15px body, 12–13px controls. Avoid decorative labels inside the product.
- Spacing: 8/12/16/24/32/48. Border radius: 10px controls, 14px window, rounded voice composer. One native-window frame, no nested dashboard card grid.
- Actual supplied orb silhouette, centered at first launch; smaller beside compact/desktop state. PNG displayed through a circular CSS viewport; no new logo or redrawn approximation.
- Existing M in titlebar/tray. Consistent 18px outline SVG control icons, 1.6px stroke.
- Rain adapted from current MatrixRain concept: capped 24fps, no React per-frame updates, pause when hidden, static reduced-motion equivalent. Orb pulse is presentation only and labelled as a preview.
- Titlebar, Orb, Rain, Composer, Welcome, Conversation, Results, DesktopPresence and Preferences components. State is local to the review; no host API import.

## Connected review flows

1. First launch after installation: ask name → welcome/name + interest question → optional suggestions after eight seconds → ready. Typing cancels the suggestions timer.
2. Full workspace: conversation and sample research result; compact/full resize preserves draft and messages. Task drawer reveals simulated background work, with finish/cancel actions.
3. Desktop: tray → explicit simulated wake → orb only → click compact → expand workspace. Bare wake and social joke never auto-open compact.
4. Unclear request: orb question → eight seconds of silence → compact answers. Answer, retry and dismiss paths work.
5. Provider error: useful concise message with retry and typing alternatives. No fabricated live connection.
6. Settings: humour, proactivity, captions, DND and reduced motion, with visible local effects. No audio playback or microphone access.

Reviewer controls outside the product are intentionally added: scene selection, size switch and clear simulation disclosure. Desktop wallpaper is a neutral dark preview, not a Windows screenshot. Exact concept copy is kept for the welcome/interests/input/options; name capture, ready/error/task copy extends the already-approved flow. Voice/account/trial choices are not falsely marked complete.

## Acceptance for this pass

Connected flows and visual comparison at desktop and compact widths; readable rain, exact orb/logo roles, keyboard controls, eight-second fallback cancellation, no overflow, no requests to external providers. Save an interface review handoff. Phase 1 remains partial until the user approves this interface and later hears voice auditions.
