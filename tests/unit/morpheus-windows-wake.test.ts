import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ default: { spawn: mocks.spawn }, spawn: mocks.spawn }));
import { startWindowsWake, WINDOWS_WAKE_BRIDGE } from '../../electron/services/morpheus/voice/windows-wake';

afterEach(() => vi.clearAllMocks());
describe.skipIf(process.platform !== 'win32')('Windows local wake boundary', () => {
  it('uses fixed code and shell false, sends the phrase only as JSON data, stops its own process', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    mocks.spawn.mockReturnValue(child);
    const input: Buffer[] = [];
    child.stdin.on('data', (data) => input.push(data));
    const onWake = vi.fn();
    const controller = startWindowsWake({ phrase: "Morpheus's friend", onWake, onError: vi.fn() });
    const [executable, args, options] = mocks.spawn.mock.calls[0];
    expect(executable).toMatch(/System32\\WindowsPowerShell\\v1.0\\powershell.exe$/);
    expect(options).toMatchObject({ shell: false, windowsHide: true });
    expect(Buffer.from(args.at(-1), 'base64').toString('utf16le')).toBe(WINDOWS_WAKE_BRIDGE);
    expect(args.join(' ')).not.toContain("Morpheus's friend");
    expect(JSON.parse(Buffer.concat(input).toString())).toEqual({ phrase: "Morpheus's friend", parentPid: process.pid });
    child.stdout.write('rea'); child.stdout.write('dy\r\n');
    await controller.ready;
    expect(child.stdin.writableEnded).toBe(false);
    await controller.pushAudio(Buffer.alloc(6400));
    child.stdout.write('audio-wake:{"startSample":0,"sampleCount":3200}\r\n');
    expect(onWake).toHaveBeenCalledOnce();
    controller.stop();
    child.stdout.write('audio-wake:{"startSample":0,"sampleCount":3200}\n');
    expect(onWake).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledOnce();
  });
  it('rejects code-like phrase input before spawning', () => {
    expect(() => startWindowsWake({ phrase: 'x; Start-Process calc', onWake: vi.fn(), onError: vi.fn() })).toThrow('Invalid');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('hands off only the original audio range, never native dictation words', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    mocks.spawn.mockReturnValue(child);
    const onWake = vi.fn();
    const controller = startWindowsWake({ phrase: 'Morpheus', onWake, onError: vi.fn() });
    child.stdout.write('ready\n');
    await controller.ready;
    child.stdout.write('audio-wake:{"startSample":11200,"sampleCount":50240}\n');
    expect(onWake).toHaveBeenCalledExactlyOnceWith(undefined, { startSample: 11200, sampleCount: 50240 });
    expect(WINDOWS_WAKE_BRIDGE).toContain('AppendDictation()');
    expect(WINDOWS_WAKE_BRIDGE).toContain('SetInputToAudioStream');
    expect(WINDOWS_WAKE_BRIDGE).not.toContain('SetInputToDefaultAudioDevice');
    controller.stop();
  });
  it('rejects oversized protocol output and does not restart', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    mocks.spawn.mockReturnValue(child);
    const controller = startWindowsWake({ phrase: 'Morpheus', onWake: vi.fn(), onError: vi.fn() });
    const failed = expect(controller.ready).rejects.toThrow('unavailable');
    child.stdout.write('x'.repeat(4097));
    await failed;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(mocks.spawn).toHaveBeenCalledOnce();
  });
  it('retains absolute counters over long idle and repeated addressed results, then ignores stopped output', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    child.stdin.resume();
    mocks.spawn.mockReturnValue(child);
    const onWake = vi.fn();
    const controller = startWindowsWake({ phrase: 'Morpheus', onWake, onError: vi.fn() });
    child.stdout.write('ready\n'); await controller.ready;
    for (let index = 0; index < 120; index++) await controller.pushAudio(Buffer.alloc(6400));
    child.stdout.write('audio-wake:{"startSample":363200,');
    child.stdout.write('"sampleCount":35200}\n');
    child.stdout.write('audio-wake:{"startSample":494400,"sampleCount":35040}\n');
    expect(onWake.mock.calls).toEqual([
      [undefined, { startSample: 363200, sampleCount: 35200 }],
      [undefined, { startSample: 494400, sampleCount: 35040 }],
    ]);
    controller.stop();
    child.stdout.write('audio-wake:{"startSample":600000,"sampleCount":35040}\n');
    expect(onWake).toHaveBeenCalledTimes(2);
  });
  it('revokes ready capture when the continuous recognizer completes unexpectedly', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    mocks.spawn.mockReturnValue(child);
    const onError = vi.fn(), onWake = vi.fn();
    const controller = startWindowsWake({ phrase: 'Morpheus', onWake, onError });
    child.stdout.write('ready\n'); await controller.ready;
    child.stdout.write('unavailable\n');
    expect(onError).toHaveBeenCalledOnce(); expect(child.kill).toHaveBeenCalledOnce();
    await expect(controller.pushAudio(Buffer.alloc(6400))).rejects.toThrow('not ready');
    child.stdout.write('audio-wake:{"startSample":3200,"sampleCount":3200}\n');
    expect(onWake).not.toHaveBeenCalled();
  });
  it('revokes stalled input and refuses frames after stop', async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(),
    });
    mocks.spawn.mockReturnValue(child);
    const onError = vi.fn();
    const controller = startWindowsWake({ phrase: 'Morpheus', onWake: vi.fn(), onError });
    child.stdout.write('ready\n'); await controller.ready;
    await controller.pushAudio(Buffer.alloc(6400));
    await vi.advanceTimersByTimeAsync(3000);
    expect(onError).toHaveBeenCalledOnce(); expect(child.kill).toHaveBeenCalledOnce();
    await expect(controller.pushAudio(Buffer.alloc(6400))).rejects.toThrow('not ready');
    vi.useRealTimers();
  });
});
