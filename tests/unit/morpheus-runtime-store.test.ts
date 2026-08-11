import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runtimeControl: vi.fn(),
  setRuntimePaused: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: mocks },
}));

import { useMorpheusRuntimeStore } from '@/stores/morpheus-runtime';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runtimeControl.mockResolvedValue({
    v: 1, paused: false, updatedAt: '2026-08-11T00:00:00.000Z',
  });
  mocks.setRuntimePaused.mockResolvedValue({
    v: 1, paused: true, updatedAt: '2026-08-11T00:00:01.000Z',
  });
  useMorpheusRuntimeStore.setState({
    control: null, loading: false, updating: false, error: null,
  });
});

describe('Morpheus runtime renderer projection', () => {
  it('reads state from Main and sends only a boolean pause decision back', async () => {
    await useMorpheusRuntimeStore.getState().load();
    expect(useMorpheusRuntimeStore.getState().control?.paused).toBe(false);

    await useMorpheusRuntimeStore.getState().setPaused(true);
    expect(mocks.setRuntimePaused).toHaveBeenCalledWith(true);
    expect(useMorpheusRuntimeStore.getState().control?.paused).toBe(true);
  });

  it('preserves the last Main snapshot when an update fails', async () => {
    useMorpheusRuntimeStore.setState({
      control: { v: 1, paused: false, updatedAt: '2026-08-11T00:00:00.000Z' },
    });
    mocks.setRuntimePaused.mockRejectedValue(new Error('Audit unavailable'));
    await useMorpheusRuntimeStore.getState().setPaused(true);
    expect(useMorpheusRuntimeStore.getState().control?.paused).toBe(false);
    expect(useMorpheusRuntimeStore.getState().error).toContain('Audit unavailable');
  });
});
