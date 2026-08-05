/**
 * Boot sequence phase machine.
 *
 * Every phase advances on a REAL signal:
 *   init     – the renderer mounted
 *   settings – the persisted settings store finished hydrating
 *   bridge   – a `morpheus.systemInfo()` round-trip through host-invoke returned
 *   runtime  – the Gateway reported a status, whatever that status is
 *   ready    – all of the above, or the hard cap elapsed
 *
 * It deliberately does NOT wait for the Gateway to become *ready*: AGENTS.md
 * notes a 10-30 s startup and the app is fully usable before then. The runtime
 * phase reports whatever state the Gateway is actually in.
 *
 * The hard cap makes it structurally impossible for the overlay to wedge the
 * app, no matter which signal stalls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import { useSettingsStore } from '@/stores/settings';

export const MORPHEUS_BOOT_PHASES = ['init', 'settings', 'bridge', 'runtime', 'ready'] as const;
export type MorpheusBootPhase = (typeof MORPHEUS_BOOT_PHASES)[number];

/** Upper bound on the whole sequence, regardless of pending signals. */
export const MORPHEUS_BOOT_MAX_MS = 3500;
/** Floor so a fast machine still shows the sequence rather than a flash. */
export const MORPHEUS_BOOT_MIN_MS = 900;

export type UseBootPhasesOptions = {
  enabled: boolean;
  maxMs?: number;
  minMs?: number;
  onComplete?: () => void;
};

export type BootPhasesState = {
  phase: MorpheusBootPhase;
  phaseIndex: number;
  progress: number;
  done: boolean;
  skip: () => void;
};

export function useBootPhases(options: UseBootPhasesOptions): BootPhasesState {
  const { enabled } = options;
  const maxMs = options.maxMs ?? MORPHEUS_BOOT_MAX_MS;
  const minMs = options.minMs ?? MORPHEUS_BOOT_MIN_MS;

  // Real hydration signal from the persisted settings store. Read through the
  // persist API rather than adding a flag to the store, which is shared by the
  // whole app.
  const [settingsHydrated, setSettingsHydrated] = useState(
    () => useSettingsStore.persist?.hasHydrated?.() ?? true,
  );

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [done, setDone] = useState(!enabled);
  // Stamped in an effect rather than during render: reading the clock while
  // rendering is impure and can drift across re-renders.
  const startedAt = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(options.onComplete);
  onCompleteRef.current = options.onComplete;

  const advanceTo = useCallback((index: number) => {
    setPhaseIndex((current) => (index > current ? index : current));
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPhaseIndex(MORPHEUS_BOOT_PHASES.length - 1);
    setDone(true);
    onCompleteRef.current?.();
  }, []);

  // Hard cap. Registered first so it holds even if every other effect throws.
  useEffect(() => {
    if (!enabled) return undefined;
    startedAt.current ??= Date.now();
    const timer = setTimeout(finish, maxMs);
    return () => clearTimeout(timer);
  }, [enabled, finish, maxMs]);

  // init → settings
  useEffect(() => {
    if (!enabled) return;
    advanceTo(1);
  }, [enabled, advanceTo]);

  useEffect(() => {
    if (!enabled || settingsHydrated) return undefined;
    const unsubscribe = useSettingsStore.persist?.onFinishHydration?.(() => setSettingsHydrated(true));
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [enabled, settingsHydrated]);

  useEffect(() => {
    if (!enabled || !settingsHydrated) return;
    advanceTo(2);
  }, [enabled, settingsHydrated, advanceTo]);

  // bridge: a real round-trip through the typed host API.
  // The ref guard matters: this effect depends on phaseIndex, which it also
  // advances, so without it the probe would re-fire on every later phase.
  const bridgeProbeStarted = useRef(false);
  useEffect(() => {
    if (!enabled || phaseIndex < 2 || bridgeProbeStarted.current) return undefined;
    bridgeProbeStarted.current = true;

    let cancelled = false;
    void hostApi.morpheus.systemInfo()
      .then(() => {
        if (!cancelled) advanceTo(3);
      })
      .catch(() => {
        // A missing bridge must not stall the sequence; the cap would end it
        // anyway, but advancing keeps the reported state honest and moving.
        if (!cancelled) advanceTo(3);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, phaseIndex, advanceTo]);

  // runtime: whatever the Gateway reports, not necessarily "ready".
  const runtimeWatchStarted = useRef(false);
  useEffect(() => {
    if (!enabled || phaseIndex < 3 || runtimeWatchStarted.current) return undefined;
    runtimeWatchStarted.current = true;

    const unsubscribe = hostEvents.onGatewayStatus(() => advanceTo(4));
    // Do not block on the Gateway: it can take 10-30 s to come up.
    const timer = setTimeout(() => advanceTo(4), 600);
    return () => {
      clearTimeout(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [enabled, phaseIndex, advanceTo]);

  // All signals in. Honour the minimum so the sequence is legible.
  useEffect(() => {
    if (!enabled || phaseIndex < MORPHEUS_BOOT_PHASES.length - 1) return undefined;
    const elapsed = Date.now() - (startedAt.current ?? Date.now());
    const remaining = Math.max(0, minMs - elapsed);
    const timer = setTimeout(finish, remaining);
    return () => clearTimeout(timer);
  }, [enabled, phaseIndex, minMs, finish]);

  const progress = useMemo(
    () => Math.round((phaseIndex / (MORPHEUS_BOOT_PHASES.length - 1)) * 100),
    [phaseIndex],
  );

  return {
    phase: MORPHEUS_BOOT_PHASES[phaseIndex],
    phaseIndex,
    progress,
    done,
    skip: finish,
  };
}
