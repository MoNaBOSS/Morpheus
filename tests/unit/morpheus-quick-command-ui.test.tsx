import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cancelObjective: vi.fn(),
  onQuickCommand: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    morpheus: {
      cancelObjective: mocks.cancelObjective,
    },
  },
}));
vi.mock('@/lib/host-events', () => ({
  hostEvents: {
    onMorpheusQuickCommand: mocks.onQuickCommand,
    onMorpheusObjectiveEvent: vi.fn(() => vi.fn()),
    onMorpheusPlanConsent: vi.fn(() => vi.fn()),
  },
}));
vi.mock('@/components/morpheus/MorpheusObjectiveContextPicker', () => ({
  MorpheusObjectiveContextPicker: () => <div data-testid="quick-context" />,
}));
vi.mock('@/components/morpheus/MorpheusVoiceButton', () => ({
  MorpheusVoiceButton: () => <button type="button">Voice</button>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (
      key === 'morpheus.quickCommand.objectiveState'
        ? `${values?.state} · ${values?.objective}`
        : key
    ),
  }),
}));

import { MorpheusQuickCommand } from '@/components/morpheus/MorpheusQuickCommand';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

function objective(state: MorpheusObjectiveRun['state']): MorpheusObjectiveRun {
  return {
    v: 1,
    objectiveRunId: 'objective-quick',
    objective: 'Prepare the workspace brief',
    origin: { type: 'quick-command', commandText: 'Prepare the workspace brief' },
    state,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:01.000Z',
    iteration: 1,
    corrections: [],
    planIds: [],
    observations: [],
    artifacts: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cancelObjective.mockResolvedValue({ accepted: true });
  useMorpheusQuickCommandStore.setState({ open: true });
  useMorpheusVoiceStore.setState({ phase: 'idle' });
  useMorpheusCommandStore.setState({
    input: '', plan: null, unsupported: null, interpreting: false, executing: false,
    planResult: null, consent: null, objectiveRun: objective('executing'),
  });
});

describe('Quick Command objective control', () => {
  it('shows the real objective state and provides an explicit Main cancellation', async () => {
    render(<MorpheusQuickCommand />);
    expect(screen.getByTestId('quick-command-objective-state')).toHaveTextContent('Prepare the workspace brief');
    expect(screen.getByTestId('quick-command-close')).toBeDisabled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useMorpheusQuickCommandStore.getState().open).toBe(true);

    fireEvent.click(screen.getByTestId('quick-command-cancel-objective'));
    await waitFor(() => expect(mocks.cancelObjective).toHaveBeenCalledWith({
      objectiveRunId: 'objective-quick',
    }));
  });

  it('allows Escape to close after the objective reaches a terminal state', () => {
    useMorpheusCommandStore.setState({ objectiveRun: objective('complete') });
    render(<MorpheusQuickCommand />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useMorpheusQuickCommandStore.getState().open).toBe(false);
  });
});
