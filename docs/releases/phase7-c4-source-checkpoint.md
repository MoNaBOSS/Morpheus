# Phase 7 C4 — local memory and considerate social invitations

Source checkpoint, 2026-10-01. Source base `8115f199`; no package or live-provider
claim. Campaign ledger and README integration are owned by the parent checkpoint.

## Implemented

- Existing Projects memory remains inspectable, editable, enabled/disabled and
  removable. Its native export button saves the selected project's entries,
  including global entries for Personal. Main validates logical scope, selects
  destination with the OS save dialog and serializes only the memory fields.
  Neither renderer filesystem paths, credential stores, logs nor chat transcripts
  enter the export. Explicit sensitive memory intentionally entered by the user
  remains part of that user's requested export; no secret-store contents are read.
- Export is bounded to 500 entries and 1 MB, uses a unique exclusive temporary
  file and atomic rename, and rejects a directory or symlink destination. A
  predictable existing `.tmp` neighbor remains untouched. Cancellation changes
  nothing. The response exposes a filename and count, not the selected path.
- Current admitted user statements `I prefer …`, `Call me …`, `Remember …` and
  narrow `Don't roast/joke/tease …` statements reuse the deterministic candidate
  extractor. Extraction is anchored, bounded and rejects credential-shaped data.
  No model output, transcript scan, emotional inference or additional model call
  is used. Provenance is explicit `source: user`; admission identity deduplicates
  concurrent retries and prevents deletion followed by the same turn retry from
  restoring a deleted memory. Existing disabled equivalents stay disabled.
- `Call me` reuses the onboarding name memory and updates the current profile.
  Correcting, disabling or deleting that name memory updates the profile's name
  as well. Other voice/humour settings remain their separately inspectable saved
  settings. Unrelated project dislikes do not enter the global companion persona.
- Greetings and explicit preference statements route to conversation on compact
  surfaces. They do not become ambiguous execution prompts.
- Main owns social invitation admission, timestamps and persistent ignores.
  Availability requires a focused native app OR a visible inactive orb with recent
  local OS input, unlocked Windows, idle/asleep/armed voice, enabled companion and
  no DND/quiet hours, active work, pending conversation or paused runtime. The
  global renderer owns the timer even while hidden. Main shows a bounded caption
  above the orb without opening/focusing the app; hover/wake/work dismiss it.
  Ignored invitation expires after 45 seconds and backs
  off to 2, 4, then 7 days; normal daily cooldown is 1 day. Restart cannot reset
  cooldown. Meaningful user input resets the ignore streak but retains the normal
  daily cooldown. Silence stays local and never becomes inferred mood memory.
- No paid social polling or personality rewrite is added. One admitted localized
  invitation may use existing natural speech only when both saved speech settings
  opt in and neural output is available. No robotic fallback. Its abort signal
  owns only that utterance and cannot stop a newer task reply. OS
  busy detection remains best effort through visibility/focus/idle, task/voice state,
  and manual quiet controls; this does not detect every external call or game.

## Evidence

The integrated source passed all three typechecks and lint (zero errors, 12
existing warnings). Focused admission/memory/orb/player units passed. The combined
boundary results, including regression fixes, are in the campaign ledger.

`tests/e2e/morpheus-memory-proactivity.spec.ts` passed seven fresh-build journeys:
real Main capture → correct/disable → native selected export → delete/retry,
preserved synthetic transcript, DND/native availability/backoff, and native export
cancellation with keyboard/reduced motion in en/zh/ja/ru, plus native caption with
Main hidden, no focus theft, real artwork and hover dismissal. The dialog destination
and OS idle/lock state are synthetically selected in Main; this does not prove a person interacted with
the OS dialog. No paid API, real owner profile or microphone is used.

Hardware, human companion behaviour, final packaged journeys and combined failure
recovery remain the existing Phase 7 acceptance gates. Cross-device memory sync
remains deferred; Git branch continuity does not sync these personal records.
