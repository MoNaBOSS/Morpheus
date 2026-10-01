import { describe, expect, it, vi } from 'vitest';
import { createMediaControlCapability, createVolumeControlCapability, type MediaTransport } from '../../electron/services/morpheus/capabilities/win32/media-control';
import type { MorpheusCapabilityContext } from '../../electron/services/morpheus/capability-registry';
import { interpretCommand } from '../../shared/morpheus/interpreter/deterministic';
import { validateParam } from '../../shared/morpheus/capabilities/params';
import { validateRequestActionPayload } from '../../electron/services/morpheus-api';
import { actionResources } from '../../electron/services/morpheus/core/task-coordinator';
import { sanitizeAuditOutcome } from '../../electron/services/morpheus/audit';

const context: MorpheusCapabilityContext = { env: {}, roots: {} as never, appVersion: 'test' };
const interpret = (objective: string) => interpretCommand({ objective, platform: 'win32', filesRoot: 'C:\\files', origin: { type: 'command-bar' } });
describe('named playback and explicit output volume', () => {
  it.each([['Pause Spotify', 'media.control'], ['please play Spotify', 'media.control'], ['Set system volume to 30 percent', 'audio.setVolume'], ['set volume to 0%', 'audio.setVolume'], ['Set volume to 100%', 'audio.setVolume']])('interprets %s locally', (text, capabilityId) => {
    const plan = interpret(text); expect(plan.ok && plan.plan.steps[0].capabilityId).toBe(capabilityId);
  });
  it.each(['pause', 'play Chrome', 'pause Spotify and delete files', 'set volume to 101%', 'set volume to -1%', 'set volume to 2.3%', 'set volume to 30% then play music'])('does not guess compound or out-of-scope commands: %s', (text) => {
    const plan = interpret(text); expect(plan.ok && plan.plan.steps.some((s) => ['media.control', 'audio.setVolume'].includes(s.capabilityId))).toBe(false);
  });
  it('rejects malformed percentages and additional native parameters', () => {
    for (const value of [-1, 101, 0.2, NaN, Infinity, '30', null]) expect(validateParam('percentage', value).ok).toBe(false);
    expect(validateParam('percentage', 0)).toEqual({ ok: true, value: 0 });
    expect(() => validateRequestActionPayload({ actionId: 'media.control', params: { applicationKey: 'spotify', operation: 'pause', sourceId: 'other' } })).toThrow();
    expect(() => validateRequestActionPayload({ actionId: 'audio.setVolume', params: { level: 30, deviceId: 'mic' } })).toThrow();
    for (const id of ['media.control', 'audio.setVolume'] as const) expect(actionResources(id, 'root')).toEqual([{ key: 'desktop-audio', access: 'write' }]);
  });
  it.each(['play', 'pause'])('observes %s only in the original Spotify session', async (operation) => {
    const transport = vi.fn<MediaTransport>(async (request) => ({ ok: true, sourceId: 'Spotify.exe', state: request.command === 'inspect' ? 'Stopped' : operation === 'play' ? 'Playing' : 'Paused' }));
    const resolved = await createMediaControlCapability(transport).resolve({ applicationKey: 'spotify', operation }, context);
    const result = await resolved.execute();
    expect(result).toEqual({ kind: 'desktop-control', applicationKey: 'spotify', operation, observed: true });
    expect(sanitizeAuditOutcome(result)).toEqual(result);
    expect(transport.mock.calls[1][0]).toMatchObject({ target: 'spotify', sourceId: 'Spotify.exe', operation });
  });
  it.each([{ ok: false }, { ok: true, sourceId: 'Chrome', state: 'Paused' }, { ok: true, sourceId: 'Spotify.exe', state: 'Playing' }, { ok: true, sourceId: 'Spotify', state: 'Paused' }])('rejects unavailable, wrong-player, unchanged or replaced playback: %j', async (reply) => {
    const transport = vi.fn<MediaTransport>(async (request) => request.command === 'inspect' ? { ok: true, sourceId: 'Spotify.exe', state: 'Playing' } : reply);
    const resolved = await createMediaControlCapability(transport).resolve({ applicationKey: 'spotify', operation: 'pause' }, context);
    await expect(resolved.execute()).rejects.toThrow();
  });
  it('does not resolve unsupported players or operations', async () => {
    const transport = vi.fn<MediaTransport>(); const capability = createMediaControlCapability(transport);
    await expect(capability.resolve({ applicationKey: 'chrome', operation: 'pause' }, context)).rejects.toThrow();
    await expect(capability.resolve({ applicationKey: 'spotify', operation: 'next' }, context)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('sets only the exact observed output device and reports its observed percentage', async () => {
    const transport = vi.fn<MediaTransport>(async (request) => ({ ok: true, deviceId: 'output-id', level: request.command === 'inspect' ? 90 : 30 }));
    const resolved = await createVolumeControlCapability(transport).resolve({ level: 30 }, context);
    const result = await resolved.execute(); expect(result).toEqual({ kind: 'audio-control', level: 30, observed: true });
    expect(sanitizeAuditOutcome(result)).toEqual(result);
    expect(transport.mock.calls[1][0]).toEqual({ command: 'execute', target: 'system-volume', deviceId: 'output-id', level: 30 });
  });
  it.each([{ ok: false }, { ok: true, deviceId: 'changed', level: 30 }, { ok: true, deviceId: 'output-id', level: 29 }])('does not claim volume success for %j', async (reply) => {
    const transport = vi.fn<MediaTransport>(async (request) => request.command === 'inspect' ? { ok: true, deviceId: 'output-id', level: 90 } : reply);
    const resolved = await createVolumeControlCapability(transport).resolve({ level: 30 }, context);
    await expect(resolved.execute()).rejects.toThrow();
  });
  it('honors cancellation before native effects and rejects invalid volume before inspection', async () => {
    const transport = vi.fn<MediaTransport>(async () => ({ ok: true, deviceId: 'output-id', level: 30 }));
    const capability = createVolumeControlCapability(transport);
    await expect(capability.resolve({ level: 101 }, context)).rejects.toThrow(); expect(transport).not.toHaveBeenCalled();
    const resolved = await capability.resolve({ level: 30 }, context); await expect(resolved.execute(AbortSignal.abort())).rejects.toThrow(); expect(transport).toHaveBeenCalledTimes(1);
  });
});
