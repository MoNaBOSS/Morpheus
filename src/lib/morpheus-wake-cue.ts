/** Immediate local acknowledgement; no generated speech or provider request. */
let active: AudioContext | null = null;
export function stopMorpheusWakeCue(): void {
  const context = active;
  active = null;
  void context?.close().catch(() => undefined);
}
export function playMorpheusWakeCue(): void {
  stopMorpheusWakeCue();
  if (typeof AudioContext === 'undefined') return;
  try {
    const context = new AudioContext();
    active = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(780, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.055, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
    oscillator.onended = () => { if (active === context) stopMorpheusWakeCue(); };
    // Autoplay can be blocked. Never keep a suspended audio device alive.
    window.setTimeout(() => { if (active === context) stopMorpheusWakeCue(); }, 1000);
  } catch { stopMorpheusWakeCue(); }
}
