# Fluid arrival

Boot remains bounded and signal-driven. Fresh users enter activation; completed
profiles see a separate returning welcome after boot. This does not reset setup,
permissions, memory or provider configuration. A header control can reopen welcome.
The final activation screen waits for a choice rather than silently dismissing.

Tray handoff is a typed window operation. Main checks a live tray associated with
the same window before hiding. Failure keeps the welcome visible. Microphone and
startup preferences remain unchanged. Resume through the tray; Quit remains explicit.

Speech requests are generation-scoped. Stop or a newer utterance invalidates late
audio and fallback, releases object URLs and settles playback promises. Speaking
state comes only from playback callbacks, not a timer.

Visuals refine the existing original Signal design: enlarged orb, near-black glass,
emerald light, cinematic Matrix arrival and short opacity/translation transitions.
Decoration never serves as a diagnostic. Reduced motion removes spatial movement.
