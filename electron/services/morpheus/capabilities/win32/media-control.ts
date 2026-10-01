import { MorpheusCapabilityError, type MorpheusCapability } from '../../capability-registry';
import { runDesktopHelper } from './desktop-helper-runner';

type MediaRequest = { command: 'inspect'; target: 'spotify' | 'system-volume' }
  | { command: 'execute'; target: 'spotify'; sourceId: string; operation: string }
  | { command: 'execute'; target: 'system-volume'; deviceId: string; level: number };
export type MediaTransport = (request: MediaRequest, env: NodeJS.ProcessEnv, signal?: AbortSignal) => Promise<unknown>;
export const runMediaHelper: MediaTransport = (request, env, signal) => runDesktopHelper('media', request, env, signal);
const failure = (message: string) => new MorpheusCapabilityError('execution-failed', message);
const SPOTIFY_IDS = ['Spotify.exe', 'Spotify', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify'];
const playback = (raw: unknown) => {
  const value = raw as { ok: boolean; sourceId: string; state: string };
  if (!value?.ok || !SPOTIFY_IDS.includes(value.sourceId) || !['Closed', 'Opened', 'Changing', 'Stopped', 'Playing', 'Paused'].includes(value.state)) throw failure('One supported Spotify media session is required. Morpheus will not control another player.');
  return value;
};
const volume = (raw: unknown) => {
  const value = raw as { ok: boolean; deviceId: string; level: number };
  if (!value?.ok || typeof value.deviceId !== 'string' || !value.deviceId || value.deviceId.length > 512 || !Number.isInteger(value.level) || value.level < 0 || value.level > 100) throw failure('The default output device is unavailable.');
  return value;
};

export function createMediaControlCapability(transport: MediaTransport = runMediaHelper): MorpheusCapability<'media.control'> {
  return { actionId: 'media.control', platform: 'win32', async resolve(params, context) {
    if (params.applicationKey !== 'spotify' || !['play', 'pause'].includes(params.operation)) throw new MorpheusCapabilityError('invalid-params', 'Only play or pause on Spotify is supported.');
    const inspected = playback(await transport({ command: 'inspect', target: 'spotify' }, context.env));
    return { target: { kind: 'none' }, execute: async (signal) => {
      signal?.throwIfAborted();
      const observed = playback(await transport({ command: 'execute', target: 'spotify', sourceId: inspected.sourceId, operation: params.operation }, context.env, signal));
      if (observed.sourceId !== inspected.sourceId || observed.state !== (params.operation === 'play' ? 'Playing' : 'Paused')) throw failure('Spotify did not reach the requested playback state. Check the player before repeating.');
      return { kind: 'desktop-control', applicationKey: 'spotify', operation: params.operation, observed: true };
    } };
  } };
}

export function createVolumeControlCapability(transport: MediaTransport = runMediaHelper): MorpheusCapability<'audio.setVolume'> {
  return { actionId: 'audio.setVolume', platform: 'win32', async resolve(params, context) {
    if (!Number.isInteger(params.level) || params.level < 0 || params.level > 100) throw new MorpheusCapabilityError('invalid-params', 'Volume must be a whole percentage from 0 to 100.');
    const inspected = volume(await transport({ command: 'inspect', target: 'system-volume' }, context.env));
    return { target: { kind: 'none' }, execute: async (signal) => {
      signal?.throwIfAborted();
      const observed = volume(await transport({ command: 'execute', target: 'system-volume', deviceId: inspected.deviceId, level: params.level }, context.env, signal));
      if (observed.deviceId !== inspected.deviceId || observed.level !== params.level) throw failure('The requested volume was not observed on the same output device.');
      return { kind: 'audio-control', level: observed.level, observed: true };
    } };
  } };
}
