import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  voiceStatus: vi.fn(),
  updateVoiceSettings: vi.fn(),
  cancelSpeech: vi.fn(),
  setVoiceSpeaking: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: mocks },
}));
vi.mock('@/lib/morpheus-speech-player', () => ({ playMorpheusSpeech: mocks.play, stopMorpheusSpeech: mocks.stop }));
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => undefined },
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MorpheusVoiceSettings } from '@/components/morpheus/MorpheusVoiceSettings';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

const STATUS = {
  settings: {
    v: 4 as const,
    enabled: true,
    providerAccountId: null,
    modelId: 'whisper-1',
    speakResponses: true,
    autoSubmitTranscript: true,
    ambientEnabled: false,
    localWakeEnabled: false,
    wakePhrase: 'Morpheus',
    ambientSilenceMs: 900,
    ambientMaxUtteranceMs: 20_000,
    bargeIn: true,
    handsFreeFollowUp: true,
    speechProviderAccountId: null,
    speechModelId: 'gpt-4o-mini-tts',
    speechVoice: 'onyx' as const,
  },
  transcriptionAvailable: true,
  neuralSpeechAvailable: true,
  providerLabel: 'OpenAI Voice',
  speechProviderLabel: 'OpenAI Voice',
  providers: [
    { accountId: 'openai', vendorId: 'openai', label: 'OpenAI Voice', isDefault: true, configured: true },
    { accountId: 'openrouter', vendorId: 'openrouter', label: 'OpenRouter', isDefault: false, configured: true },
    { accountId: 'custom', vendorId: 'custom', label: 'Local Transcriber', isDefault: false, configured: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.voiceStatus.mockResolvedValue(STATUS);
  mocks.updateVoiceSettings.mockImplementation(async (patch) => ({
    ...STATUS,
    settings: { ...STATUS.settings, ...patch },
  }));
  useMorpheusVoiceStore.setState({
    phase: 'idle', status: null, transcript: null, error: null, source: null, startedAt: null,
  });
});

describe('Morpheus voice settings', () => {
  it('reports actual preview fallback and resets the result after a voice change', async () => {
    mocks.play.mockResolvedValue('windows');
    render(<MorpheusVoiceSettings />);
    fireEvent.click(await screen.findByTestId('morpheus-voice-preview'));
    await waitFor(() => expect(screen.getByTestId('morpheus-voice-preview-result')).toHaveTextContent('morpheus.voice.check.windows'));
    expect(mocks.play).toHaveBeenCalledWith('morpheus.voice.check.sample', { neuralAvailable: true, format: undefined, allowWindowsFallback: false });
    fireEvent.change(screen.getByTestId('morpheus-speech-voice'), { target: { value: 'marin' } });
    await waitFor(() => expect(screen.getByTestId('morpheus-voice-preview-result')).toHaveTextContent('morpheus.voice.check.idle'));
  });
  it('reports failed preview without certifying a configured provider', async () => {
    mocks.play.mockRejectedValue(new Error('Audio failed'));
    render(<MorpheusVoiceSettings />);
    fireEvent.click(await screen.findByTestId('morpheus-voice-preview'));
    await waitFor(() => expect(screen.getByTestId('morpheus-voice-preview-result')).toHaveTextContent('morpheus.voice.check.failed'));
  });
  it('shows safe provider metadata and persists logical settings through Main', async () => {
    render(<MorpheusVoiceSettings />);
    await screen.findByTestId('morpheus-voice-provider');

    const provider = screen.getByTestId('morpheus-voice-provider');
    expect(provider).toHaveTextContent('Local Transcriber');
    expect(document.body.textContent).not.toContain('sk-');
    expect(screen.getByTestId('morpheus-speech-voice')).toHaveValue('onyx');

    fireEvent.change(provider, { target: { value: 'openai' } });
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      engine: 'provider',
      providerAccountId: 'openai',
    }));
  });

  it('applies one OpenRouter account to efficient transcription and speech without exposing its key', async () => {
    render(<MorpheusVoiceSettings />);
    fireEvent.click(await screen.findByTestId('morpheus-voice-preset-efficient'));

    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      engine: 'provider',
      enabled: true,
      providerAccountId: 'openrouter',
      modelId: 'openai/whisper-large-v3-turbo',
      speakResponses: true,
      speechProviderAccountId: 'openrouter',
      speechModelId: 'hexgrad/kokoro-82m',
      speechVoice: 'am_onyx',
    }));
    expect(document.body.textContent).not.toContain('sk-');
  });

  it('applies the expressive OpenRouter voice as a separate deliberate preset', async () => {
    render(<MorpheusVoiceSettings />);
    fireEvent.click(await screen.findByTestId('morpheus-voice-preset-expressive'));

    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith(expect.objectContaining({
      engine: 'provider',
      providerAccountId: 'openrouter',
      modelId: 'openai/whisper-large-v3-turbo',
      speechProviderAccountId: 'openrouter',
      speechModelId: 'canopylabs/orpheus-3b-0.1-ft',
      speechVoice: 'leo',
    })));
  });

  it('updates the bounded model and operator preferences without accepting credentials', async () => {
    render(<MorpheusVoiceSettings />);
    const model = await screen.findByTestId('morpheus-voice-model');
    fireEvent.change(model, { target: { value: 'gpt-4o-mini-transcribe' } });
    fireEvent.blur(model);
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      engine: 'provider',
      modelId: 'gpt-4o-mini-transcribe',
    }));

    fireEvent.click(screen.getByTestId('morpheus-voice-auto-submit'));
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      autoSubmitTranscript: false,
    }));
  });

  it('describes included speech honestly and offers only its real voices while keeping provider setup deliberate', async () => {
    mocks.voiceStatus.mockResolvedValue({
      ...STATUS,
      speechFormat: 'wav',
      availableSpeechVoices: ['cedar', 'coral'],
      settings: { ...STATUS.settings, engine: 'local', localWakeEnabled: true },
    });
    render(<MorpheusVoiceSettings />);
    const engine = await screen.findByTestId('morpheus-voice-engine');
    expect(engine).toHaveValue('local');
    expect(document.body.textContent).toContain('morpheus.experience.voice.localBody');
    expect(document.body.textContent).toContain('morpheus.experience.voice.wakeBody');
    expect(document.body.textContent).not.toContain('morpheus.voice.localWake.disclosure');
    expect(document.body.textContent).not.toContain('morpheus.voice.settings.ambientDisclosure');
    expect(document.body.textContent).not.toContain('morpheus.voice.settings.neuralSpeechFallback');
    expect(screen.queryByTestId('morpheus-voice-provider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('morpheus-local-wake')).not.toBeInTheDocument();
    const voice = screen.getByTestId('morpheus-speech-voice');
    expect(voice).toHaveValue('cedar');
    expect([...voice.querySelectorAll('option')].map((option) => option.value)).toEqual(['cedar', 'coral']);
    fireEvent.change(engine, { target: { value: 'provider' } });
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({ engine: 'provider' }));
  });

  it('switches an explicitly chosen provider preset out of included local speech', async () => {
    mocks.voiceStatus.mockResolvedValue({
      ...STATUS,
      speechFormat: 'wav',
      availableSpeechVoices: ['cedar', 'coral'],
      settings: { ...STATUS.settings, engine: 'local', localWakeEnabled: true },
    });
    render(<MorpheusVoiceSettings />);
    fireEvent.click(await screen.findByTestId('morpheus-voice-preset-efficient'));
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith(expect.objectContaining({
      engine: 'provider',
      providerAccountId: 'openrouter',
      speechProviderAccountId: 'openrouter',
    })));
    expect(document.body.textContent).not.toContain('sk-');
  });
});
