import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  voiceStatus: vi.fn(),
  updateVoiceSettings: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: mocks },
}));

import { MorpheusVoiceSettings } from '@/components/morpheus/MorpheusVoiceSettings';
import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

const STATUS = {
  settings: {
    v: 1 as const,
    enabled: true,
    providerAccountId: null,
    modelId: 'whisper-1',
    speakResponses: true,
    autoSubmitTranscript: true,
  },
  transcriptionAvailable: true,
  providerLabel: 'OpenAI Voice',
  providers: [
    { accountId: 'openai', label: 'OpenAI Voice', isDefault: true, configured: true },
    { accountId: 'custom', label: 'Local Transcriber', isDefault: false, configured: false },
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
  it('shows safe provider metadata and persists logical settings through Main', async () => {
    render(<MorpheusVoiceSettings />);
    await screen.findByText(/OpenAI Voice/);

    const provider = screen.getByTestId('morpheus-voice-provider');
    expect(provider).toHaveTextContent('Local Transcriber');
    expect(document.body.textContent).not.toContain('sk-');

    fireEvent.change(provider, { target: { value: 'openai' } });
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      providerAccountId: 'openai',
    }));
  });

  it('updates the bounded model and operator preferences without accepting credentials', async () => {
    render(<MorpheusVoiceSettings />);
    const model = await screen.findByTestId('morpheus-voice-model');
    fireEvent.change(model, { target: { value: 'gpt-4o-mini-transcribe' } });
    fireEvent.blur(model);
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      modelId: 'gpt-4o-mini-transcribe',
    }));

    fireEvent.click(screen.getByTestId('morpheus-voice-auto-submit'));
    await waitFor(() => expect(mocks.updateVoiceSettings).toHaveBeenCalledWith({
      autoSubmitTranscript: false,
    }));
  });
});
