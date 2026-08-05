import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { onFinishHydrationMock, hasHydratedMock, onGatewayStatusMock, systemInfoMock } = vi.hoisted(() => ({
  onFinishHydrationMock: vi.fn(),
  hasHydratedMock: vi.fn(),
  onGatewayStatusMock: vi.fn(),
  systemInfoMock: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: { systemInfo: systemInfoMock } },
}));

vi.mock('@/lib/host-events', () => ({
  hostEvents: { onGatewayStatus: onGatewayStatusMock },
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: Object.assign(
    () => undefined,
    { persist: { hasHydrated: hasHydratedMock, onFinishHydration: onFinishHydrationMock } },
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MorpheusBoot } from '@/components/morpheus/boot/MorpheusBoot';
import {
  MORPHEUS_BOOT_PHASES,
  useBootPhases,
} from '@/components/morpheus/boot/use-boot-phases';

beforeEach(() => {
  vi.clearAllMocks();
  hasHydratedMock.mockReturnValue(true);
  onFinishHydrationMock.mockReturnValue(vi.fn());
  onGatewayStatusMock.mockReturnValue(vi.fn());
  systemInfoMock.mockResolvedValue({ appVersion: '0.1.0' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useBootPhases', () => {
  it('advances through every phase on real signals', async () => {
    const { result } = renderHook(() => useBootPhases({ enabled: true, minMs: 0, maxMs: 10_000 }));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.progress).toBe(100);
    expect(systemInfoMock).toHaveBeenCalledTimes(1);
    expect(onGatewayStatusMock).toHaveBeenCalled();
  });

  it('never moves a phase backwards', async () => {
    const { result } = renderHook(() => useBootPhases({ enabled: true, minMs: 0, maxMs: 10_000 }));
    await waitFor(() => expect(result.current.phaseIndex).toBeGreaterThan(0));

    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      seen.push(result.current.phaseIndex);
      await act(async () => { await Promise.resolve(); });
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it('completes on the hard cap even when every signal stalls', async () => {
    vi.useFakeTimers();
    // Nothing ever resolves or fires.
    systemInfoMock.mockReturnValue(new Promise(() => {}));
    hasHydratedMock.mockReturnValue(false);
    onFinishHydrationMock.mockReturnValue(vi.fn());

    const onComplete = vi.fn();
    const { result } = renderHook(() => useBootPhases({
      enabled: true,
      minMs: 0,
      maxMs: 500,
      onComplete,
    }));

    expect(result.current.done).toBe(false);
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(result.current.done).toBe(true);
    expect(result.current.phase).toBe('ready');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not stall when the host bridge rejects', async () => {
    systemInfoMock.mockRejectedValue(new Error('bridge unavailable'));
    const { result } = renderHook(() => useBootPhases({ enabled: true, minMs: 0, maxMs: 10_000 }));

    await waitFor(() => expect(result.current.phase).toBe('ready'));
  });

  it('completes immediately and runs nothing when disabled', () => {
    const { result } = renderHook(() => useBootPhases({ enabled: false }));

    expect(result.current.done).toBe(true);
    expect(systemInfoMock).not.toHaveBeenCalled();
    expect(onGatewayStatusMock).not.toHaveBeenCalled();
  });

  it('reports only known phase names', async () => {
    const { result } = renderHook(() => useBootPhases({ enabled: true, minMs: 0, maxMs: 10_000 }));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(MORPHEUS_BOOT_PHASES).toContain(result.current.phase);
  });

  it('fires onComplete exactly once', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useBootPhases({
      enabled: true, minMs: 0, maxMs: 10_000, onComplete,
    }));

    await waitFor(() => expect(result.current.done).toBe(true));
    act(() => result.current.skip());
    act(() => result.current.skip());

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('MorpheusBoot', () => {
  it('renders nothing when disabled', () => {
    render(<MorpheusBoot enabled={false} />);
    expect(screen.queryByTestId('morpheus-boot')).toBeNull();
  });

  it('renders the overlay and the canvas while booting', () => {
    vi.useFakeTimers();
    systemInfoMock.mockReturnValue(new Promise(() => {}));
    render(<MorpheusBoot enabled />);

    expect(screen.getByTestId('morpheus-boot')).toBeTruthy();
    expect(screen.getByTestId('morpheus-boot-canvas')).toBeTruthy();
    expect(screen.getByTestId('morpheus-boot-phase')).toBeTruthy();
  });

  it('cancels its animation frame on unmount', () => {
    // jsdom has no 2d canvas implementation, so the rain effect would bail out
    // before ever scheduling a frame. Stub a minimal context so the real
    // animation path — and therefore the real cleanup — is exercised.
    const context2d = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context2d as unknown as CanvasRenderingContext2D);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');

    const { unmount } = render(<MorpheusBoot enabled />);
    unmount();

    expect(cancel).toHaveBeenCalled();
    getContext.mockRestore();
  });

  it('renders a single static frame under reduced motion', () => {
    const context2d = {
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context2d as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');

    render(<MorpheusBoot enabled />);

    expect(requestFrame).not.toHaveBeenCalled();
    expect(context2d.fillText).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('dismisses on Escape', async () => {
    vi.useFakeTimers();
    systemInfoMock.mockReturnValue(new Promise(() => {}));
    render(<MorpheusBoot enabled />);
    expect(screen.getByTestId('morpheus-boot')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(screen.queryByTestId('morpheus-boot')).toBeNull();
  });

  it('removes itself once the sequence completes', async () => {
    vi.useFakeTimers();
    render(<MorpheusBoot enabled />);

    // First advance drives the phase machine to completion, which starts the
    // fade timer; the second lets the fade finish and unmount the overlay.
    await act(async () => { vi.advanceTimersByTime(6000); });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(screen.queryByTestId('morpheus-boot')).toBeNull();
  });
});
