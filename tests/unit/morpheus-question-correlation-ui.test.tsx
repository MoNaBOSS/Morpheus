import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

const mocks = vi.hoisted(() => ({
  route: vi.fn(async () => ({ route: 'control' as const })), correct: vi.fn(async () => undefined),
  run: vi.fn(), conversation: vi.fn(),
}));
vi.mock('react-i18next', () => ({ initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/host-api', () => ({ hostApi: { morpheus: {
  companionSurfaceStatus: vi.fn(async () => ({ mode: 'full' })),
  dismissCompanionSurface: vi.fn(), expandCompanionSurface: vi.fn(),
} } }));
vi.mock('@/lib/host-events', () => ({ hostEvents: {
  onMorpheusQuickCommand: vi.fn(() => vi.fn()), onMorpheusObjectiveEvent: vi.fn(() => vi.fn()),
  onMorpheusPlanConsent: vi.fn(() => vi.fn()),
} }));
vi.mock('@/components/morpheus/MorpheusBrandMark', () => ({ MorpheusBrandMark: () => null }));
vi.mock('@/components/morpheus/MorpheusFluidOrb', () => ({ MorpheusFluidOrb: () => null }));
vi.mock('@/components/morpheus/MorpheusAudioMeter', () => ({ MorpheusAudioMeter: () => null }));
vi.mock('@/components/morpheus/MorpheusVoiceButton', () => ({ MorpheusVoiceButton: () => null }));
vi.mock('@/components/morpheus/MorpheusLiveVoiceCaption', () => ({ MorpheusLiveVoiceCaption: () => null }));
vi.mock('@/components/morpheus/MorpheusTaskSwitcher', () => ({ MorpheusTaskSwitcher: () => null }));
vi.mock('@/components/morpheus/MorpheusConversationThread', () => ({ MorpheusConversationThread: () => null }));

import { CommandBar } from '@/pages/CommandCenter/CommandBar';
import { MorpheusQuickCommand } from '@/components/morpheus/MorpheusQuickCommand';
import { MorpheusVoiceIndicator } from '@/components/morpheus/MorpheusVoiceRuntime';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusConversationStore } from '@/stores/morpheus-conversation';
import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusQuickCommandStore } from '@/stores/morpheus-quick-command';
import { useMorpheusArrivalStore } from '@/stores/morpheus-arrival';
import { useAcpChatSessionStore } from '@/stores/acp-chat-session';

function question(): MorpheusObjectiveRun {
  return { v: 1, objectiveRunId: 'question-current', objective: 'Prepare a report',
    origin: { type: 'command-bar', commandText: 'Prepare a report' }, state: 'needs-clarification',
    createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z', iteration: 1,
    corrections: [], planIds: [], observations: [], artifacts: [], clarification: 'Which format?',
    clarificationChoices: ['Markdown', 'Text'] };
}
beforeEach(() => {
  vi.clearAllMocks();
  useMorpheusArrivalStore.setState({ welcomeOpen: false });
  useMorpheusQuickCommandStore.setState({ open: false, trigger: null });
  useMorpheusVoiceStore.setState({ phase: 'idle', source: null, error: null, errorKind: null, recovery: null,
    presence: null, followUpUntil: null, ambientReady: false });
  useMorpheusConversationStore.setState({ draftText: '', draftAnswerFor: null, submitting: false, dispatchError: null,
    snapshot: null, submit: mocks.conversation });
  useAcpChatSessionStore.setState({ sending: false, loading: false, cancelling: false });
  useMorpheusCommandStore.setState({ objectiveRun: question(), submitting: false, unsupported: null,
    objectiveHistory: null, correctObjective: mocks.correct, runObjective: mocks.run });
  useMorpheusOperatorStore.setState({ clarification: null, route: mocks.route });
});
afterEach(cleanup);

describe('clarification answer correlation in both composers', () => {
  it.each(['full', 'compact'] as const)('keeps a retired %s answer inert until a deliberate new edit', async surface => {
    useMorpheusQuickCommandStore.setState({ open: surface === 'compact' });
    render(<MemoryRouter>{surface === 'full' ? <CommandBar /> : <MorpheusQuickCommand />}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown', exact: true }));
    const input = screen.getByTestId(surface === 'full' ? 'morpheus-command-input' : 'quick-command-input');
    const submit = screen.getByTestId(surface === 'full' ? 'morpheus-command-submit' : 'quick-command-submit');
    expect(input).toHaveValue('Markdown');
    act(() => useMorpheusCommandStore.setState({ objectiveRun: { ...question(), state: 'cancelled' } }));
    fireEvent.click(submit); fireEvent.click(submit);
    expect(mocks.correct).not.toHaveBeenCalled(); expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.conversation).not.toHaveBeenCalled();
    expect(input).toHaveValue('Markdown');
    fireEvent.change(input, { target: { value: 'Open Notepad' } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.route).toHaveBeenCalledExactlyOnceWith('Open Notepad', surface === 'full' ? 'command-center' : 'quick-command'));
  });
  it.each(['full', 'compact'] as const)('does not send a captured %s answer to a replacement question', surface => {
    useMorpheusQuickCommandStore.setState({ open: surface === 'compact' });
    render(<MemoryRouter>{surface === 'full' ? <CommandBar /> : <MorpheusQuickCommand />}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown', exact: true }));
    act(() => useMorpheusCommandStore.setState({ objectiveRun: { ...question(), objectiveRunId: 'question-replacement' } }));
    fireEvent.click(screen.getByTestId(surface === 'full' ? 'morpheus-command-submit' : 'quick-command-submit'));
    expect(mocks.correct).not.toHaveBeenCalled(); expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled(); expect(mocks.conversation).not.toHaveBeenCalled();
  });
  it.each(['full', 'compact'] as const)('keeps a %s choice bound when its draft moves to the other surface', async surface => {
    useMorpheusQuickCommandStore.setState({ open: surface === 'compact' });
    const view = render(<MemoryRouter>{surface === 'full' ? <CommandBar /> : <MorpheusQuickCommand />}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown', exact: true }));
    expect(useMorpheusConversationStore.getState().draftAnswerFor).toEqual({ objectiveRunId: 'question-current', iteration: 1 });
    view.unmount();
    useMorpheusQuickCommandStore.setState({ open: surface === 'full' });
    render(<MemoryRouter>{surface === 'full' ? <MorpheusQuickCommand /> : <CommandBar />}</MemoryRouter>);
    expect(screen.getByTestId(surface === 'full' ? 'quick-command-input' : 'morpheus-command-input')).toHaveValue('Markdown');
    fireEvent.click(screen.getByTestId(surface === 'full' ? 'quick-command-submit' : 'morpheus-command-submit'));
    await waitFor(() => expect(mocks.correct).toHaveBeenCalledExactlyOnceWith('Markdown'));
    expect(mocks.route).not.toHaveBeenCalled(); expect(useMorpheusConversationStore.getState().draftAnswerFor).toBeNull();
  });
  it.each(['full', 'compact'] as const)('drops a %s answer after switching surfaces when the question iteration changes', surface => {
    useMorpheusQuickCommandStore.setState({ open: surface === 'compact' });
    const view = render(<MemoryRouter>{surface === 'full' ? <CommandBar /> : <MorpheusQuickCommand />}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Markdown', exact: true }));
    view.unmount();
    useMorpheusQuickCommandStore.setState({ open: surface === 'full' });
    useMorpheusCommandStore.setState({ objectiveRun: { ...question(), iteration: 2 } });
    render(<MemoryRouter>{surface === 'full' ? <MorpheusQuickCommand /> : <CommandBar />}</MemoryRouter>);
    fireEvent.click(screen.getByTestId(surface === 'full' ? 'quick-command-submit' : 'morpheus-command-submit'));
    expect(mocks.correct).not.toHaveBeenCalled(); expect(mocks.route).not.toHaveBeenCalled();
  });
});

describe('inline recovery owns one visible repair cue', () => {
  it('deduplicates only the full-chat repeat HUD and retains active capture feedback', () => {
    useMorpheusVoiceStore.setState({ phase: 'error', source: 'command-center', errorKind: 'repeat', error: 'No speech detected' });
    const view = render(<MemoryRouter><MorpheusVoiceIndicator /><CommandBar /></MemoryRouter>);
    expect(screen.getByTestId('morpheus-voice-recovery-command-center')).toBeVisible();
    expect(screen.queryByTestId('morpheus-voice-indicator')).toBeNull();
    act(() => useMorpheusVoiceStore.setState({ phase: 'listening', errorKind: null, error: null }));
    expect(screen.getByTestId('morpheus-voice-indicator')).toHaveAttribute('data-phase', 'listening');
    expect(screen.queryByTestId('morpheus-voice-recovery-command-center')).toBeNull();
    view.unmount();
  });
  it('retains onboarding and other-route repair guidance', () => {
    useMorpheusVoiceStore.setState({ phase: 'error', source: 'onboarding', errorKind: 'repeat', error: 'No speech detected' });
    const view = render(<MemoryRouter><MorpheusVoiceIndicator /><CommandBar /></MemoryRouter>);
    expect(screen.getByTestId('morpheus-voice-indicator')).toBeVisible();
    expect(screen.queryByTestId('morpheus-voice-recovery-command-center')).toBeNull();
    view.unmount();
    useMorpheusVoiceStore.setState({ source: 'command-center' });
    render(<MemoryRouter initialEntries={['/settings?section=voice']}><MorpheusVoiceIndicator /></MemoryRouter>);
    expect(screen.getByTestId('morpheus-voice-indicator')).toBeVisible();
  });
});
