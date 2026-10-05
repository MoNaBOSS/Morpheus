import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusDeepgramVoiceStatus, MorpheusVoiceSettingsPatch, MorpheusVoiceStatus } from '@shared/morpheus/voice-types';

const mocks = vi.hoisted(() => ({
  deepgramVoiceStatus: vi.fn(), saveDeepgramVoiceConnection: vi.fn(), testDeepgramVoiceConnection: vi.fn(),
  removeDeepgramVoiceConnection: vi.fn(), updateSettings: vi.fn(), loadStatus: vi.fn(),
}));
vi.mock('@/lib/host-api', () => ({ hostApi: { morpheus: mocks } }));
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MorpheusDeepgramConnection } from '@/components/morpheus/MorpheusDeepgramConnection';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

const DISCONNECTED: MorpheusDeepgramVoiceStatus = { configured: false, recognitionModel: 'nova-3', speechModel: 'flux-kit-en', storage: 'protected' };
const CONNECTED: MorpheusDeepgramVoiceStatus = { ...DISCONNECTED, configured: true };
const VOICE: MorpheusVoiceStatus = {
  settings: { v: 4, engine: 'local', enabled: false, providerAccountId: 'task-account', modelId: 'existing-stt',
    speakResponses: true, autoSubmitTranscript: true, ambientEnabled: true, localWakeEnabled: true, wakePhrase: 'Morpheus',
    ambientSilenceMs: 900, ambientMaxUtteranceMs: 20_000, bargeIn: true, handsFreeFollowUp: true,
    speechProviderAccountId: 'task-account', speechModelId: 'existing-tts', speechVoice: 'cedar' },
  presence: { v: 4, state: 'asleep', ambientEnabled: true, inputEnabled: false },
  providers: [], transcriptionAvailable: false, neuralSpeechAvailable: true, speechFormat: 'wav',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deepgramVoiceStatus.mockResolvedValue(DISCONNECTED);
  mocks.saveDeepgramVoiceConnection.mockResolvedValue(CONNECTED);
  mocks.testDeepgramVoiceConnection.mockResolvedValue({ ok: true, recognition: true, speech: true });
  mocks.removeDeepgramVoiceConnection.mockResolvedValue(DISCONNECTED);
  mocks.loadStatus.mockResolvedValue(VOICE);
  mocks.updateSettings.mockImplementation(async (patch: MorpheusVoiceSettingsPatch) => {
    useMorpheusVoiceStore.setState({ status: { ...VOICE, settings: { ...VOICE.settings, ...patch } } });
  });
  useMorpheusVoiceStore.setState({ status: VOICE, loadStatus: mocks.loadStatus, updateSettings: mocks.updateSettings });
});

describe('secure optional Deepgram voice connection', () => {
  it('turns a failed metadata load into repair instead of indefinite loading or raw errors', async () => {
    mocks.deepgramVoiceStatus.mockRejectedValue(new Error('fixture-sensitive-raw-provider-error'));
    render(<MorpheusDeepgramConnection />);
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-status')).toHaveTextContent('morpheus.voice.cloud.unavailableStatus'));
    expect(screen.getByTestId('morpheus-deepgram-test-result')).toHaveTextContent('morpheus.voice.cloud.errors.unavailable');
    expect(document.body.textContent).not.toContain('fixture-sensitive-raw-provider-error');
    expect(screen.getByTestId('morpheus-deepgram-key')).toHaveValue('');
    expect(screen.getByTestId('morpheus-deepgram-use')).toBeDisabled();
  });
  it('starts optional, empty and masked without replacing included voice or microphone authority', async () => {
    render(<MorpheusDeepgramConnection />);
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-status')).toHaveTextContent('morpheus.voice.cloud.notConnected'));
    expect(screen.getByTestId('morpheus-deepgram-key')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('morpheus-deepgram-key')).toHaveValue('');
    expect(screen.getByTestId('morpheus-deepgram-model')).toHaveValue('nova-3');
    expect(screen.getByTestId('morpheus-deepgram-use')).toBeDisabled();
    expect(mocks.saveDeepgramVoiceConnection).not.toHaveBeenCalled();
    expect(mocks.testDeepgramVoiceConnection).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('clears entered credentials before awaiting Main, tests sequentially and never enables the microphone', async () => {
    let finishSave!: (status: MorpheusDeepgramVoiceStatus) => void;
    mocks.saveDeepgramVoiceConnection.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    render(<MorpheusDeepgramConnection />);
    await waitFor(() => expect(mocks.deepgramVoiceStatus).toHaveBeenCalledOnce());
    const key = screen.getByTestId('morpheus-deepgram-key');
    fireEvent.change(key, { target: { value: 'fixture-only-credential' } });
    fireEvent.submit(screen.getByTestId('morpheus-deepgram-form'));
    expect(key).toHaveValue('');
    expect(mocks.saveDeepgramVoiceConnection).toHaveBeenCalledExactlyOnceWith({ apiKey: 'fixture-only-credential', recognitionModel: 'nova-3' });
    expect(mocks.testDeepgramVoiceConnection).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByTestId('morpheus-deepgram-form'));
    expect(mocks.saveDeepgramVoiceConnection).toHaveBeenCalledOnce();
    finishSave(CONNECTED);
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-test-result')).toHaveTextContent('morpheus.voice.cloud.passed'));
    expect(screen.getByTestId('morpheus-deepgram-use')).toBeEnabled();
    expect(mocks.testDeepgramVoiceConnection).toHaveBeenCalledOnce();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().status?.settings).toEqual(VOICE.settings);
    expect(document.body.textContent).not.toContain('fixture-only-credential');
  });

  it('shows actionable authentication repair, keeps keys empty and requires a successful retry before selection', async () => {
    mocks.deepgramVoiceStatus.mockResolvedValue(CONNECTED);
    mocks.testDeepgramVoiceConnection.mockResolvedValueOnce({ ok: false, recognition: false, speech: false, reason: 'authentication' });
    render(<MorpheusDeepgramConnection />);
    fireEvent.click(await screen.findByTestId('morpheus-deepgram-test'));
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-test-result')).toHaveTextContent('morpheus.voice.cloud.errors.authentication'));
    expect(screen.getByTestId('morpheus-deepgram-use')).toBeDisabled();
    expect(screen.getByTestId('morpheus-deepgram-key')).toHaveValue('');
    fireEvent.click(screen.getByTestId('morpheus-deepgram-test'));
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-use')).toBeEnabled());
    fireEvent.click(screen.getByTestId('morpheus-deepgram-use'));
    await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledExactlyOnceWith({ engine: 'deepgram' }));
    expect(useMorpheusVoiceStore.getState().status?.settings).toEqual({ ...VOICE.settings, engine: 'deepgram' });
  });

  it('changes recognizer with the existing protected connection without requiring or returning its key', async () => {
    mocks.deepgramVoiceStatus.mockResolvedValue(CONNECTED);
    mocks.saveDeepgramVoiceConnection.mockResolvedValue({ ...CONNECTED, recognitionModel: 'flux-general-en' });
    render(<MorpheusDeepgramConnection />);
    await screen.findByTestId('morpheus-deepgram-test');
    fireEvent.change(screen.getByTestId('morpheus-deepgram-model'), { target: { value: 'flux-general-en' } });
    fireEvent.submit(screen.getByTestId('morpheus-deepgram-form'));
    await waitFor(() => expect(mocks.saveDeepgramVoiceConnection).toHaveBeenCalledExactlyOnceWith({ recognitionModel: 'flux-general-en' }));
    await waitFor(() => expect(mocks.testDeepgramVoiceConnection).toHaveBeenCalledOnce());
    expect(screen.getByTestId('morpheus-deepgram-key')).toHaveValue('');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('tests an unchanged saved connection when Save & test is pressed with an empty replacement field', async () => {
    mocks.deepgramVoiceStatus.mockResolvedValue(CONNECTED);
    render(<MorpheusDeepgramConnection />);
    await screen.findByTestId('morpheus-deepgram-test');
    fireEvent.submit(screen.getByTestId('morpheus-deepgram-form'));
    await waitFor(() => expect(mocks.testDeepgramVoiceConnection).toHaveBeenCalledOnce());
    expect(mocks.saveDeepgramVoiceConnection).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('offers the next audio check when cloud voice is already selected', async () => {
    mocks.deepgramVoiceStatus.mockResolvedValue(CONNECTED);
    useMorpheusVoiceStore.setState({ status: { ...VOICE, settings: { ...VOICE.settings, engine: 'deepgram' } } });
    render(<MorpheusDeepgramConnection />);
    fireEvent.click(await screen.findByTestId('morpheus-deepgram-test'));
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-test-result')).toHaveTextContent('morpheus.voice.cloud.passedActive'));
    expect(screen.queryByTestId('morpheus-deepgram-use')).not.toBeInTheDocument();
    expect(screen.getByTestId('morpheus-deepgram-use-local')).toBeInTheDocument();
  });

  it('clears credentials when leaving and never tests or publishes a late saved result', async () => {
    let finishSave!: (status: MorpheusDeepgramVoiceStatus) => void;
    mocks.saveDeepgramVoiceConnection.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    const first = render(<MorpheusDeepgramConnection />);
    await waitFor(() => expect(mocks.deepgramVoiceStatus).toHaveBeenCalledOnce());
    const field = screen.getByTestId('morpheus-deepgram-key');
    fireEvent.change(field, { target: { value: 'fixture-not-saved' } });
    first.unmount();
    expect(field).toHaveValue('');
    const second = render(<MorpheusDeepgramConnection />);
    await waitFor(() => expect(mocks.deepgramVoiceStatus).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByTestId('morpheus-deepgram-key'), { target: { value: 'fixture-being-saved' } });
    fireEvent.submit(screen.getByTestId('morpheus-deepgram-form'));
    second.unmount();
    await act(async () => { finishSave(CONNECTED); });
    expect(mocks.saveDeepgramVoiceConnection).toHaveBeenCalledOnce();
    expect(mocks.testDeepgramVoiceConnection).not.toHaveBeenCalled();
  });

  it('removes only the voice connection and reloads Main status', async () => {
    mocks.deepgramVoiceStatus.mockResolvedValue(CONNECTED);
    render(<MorpheusDeepgramConnection />);
    fireEvent.click(await screen.findByTestId('morpheus-deepgram-remove'));
    await waitFor(() => expect(screen.getByTestId('morpheus-deepgram-status')).toHaveTextContent('morpheus.voice.cloud.notConnected'));
    expect(mocks.removeDeepgramVoiceConnection).toHaveBeenCalledOnce();
    expect(mocks.loadStatus).toHaveBeenCalledOnce();
    expect(screen.getByTestId('morpheus-deepgram-use')).toBeDisabled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
