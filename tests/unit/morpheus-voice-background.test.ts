import { describe, expect, it, vi } from 'vitest';
import { updateMorpheusVoiceBackground } from '@electron/main/morpheus-voice-background';

describe('tray audio scheduling', () => {
  it('keeps pending acquisition scheduled while asleep, and revokes it on error or stop', () => {
    const contents = { setBackgroundThrottling: vi.fn() };
    updateMorpheusVoiceBackground(contents, { v: 3, ambientEnabled: true, state: 'asleep', sessionStartedAt: new Date().toISOString() });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(false);
    updateMorpheusVoiceBackground(contents, { v: 3, ambientEnabled: true, state: 'error', sessionStartedAt: new Date().toISOString() });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    updateMorpheusVoiceBackground(contents, { v: 3, ambientEnabled: true, state: 'asleep' });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
  });
  it('keeps an explicitly armed microphone alive and restores throttling on stop', () => {
    const contents = { setBackgroundThrottling: vi.fn() };
    updateMorpheusVoiceBackground(contents, { v: 3, ambientEnabled: true, state: 'armed' });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(false);
    updateMorpheusVoiceBackground(contents, { v: 3, ambientEnabled: true, state: 'asleep' });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    updateMorpheusVoiceBackground(contents, { v: 3, ambientEnabled: false, state: 'speaking' });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
  });
});
