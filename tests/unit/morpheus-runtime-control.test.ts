import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusRuntimeControl } from '@electron/services/morpheus/runtime-control';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup(recordControl = vi.fn(async () => undefined)) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-runtime-control-'));
  roots.push(userDataDir);
  const service = createMorpheusRuntimeControl({
    userDataDir,
    audit: { recordControl } as never,
    appVersion: '1.0.0',
    now: () => new Date('2026-08-11T09:30:00.000Z'),
  });
  return {
    userDataDir,
    file: join(userDataDir, 'morpheus', 'runtime-control.json'),
    service,
    recordControl,
  };
}

describe('Main-owned Morpheus runtime control', () => {
  it('defaults active, audits before persisting, and survives restart', async () => {
    const harness = setup();
    expect(harness.service.snapshot()).toMatchObject({ v: 1, paused: false });

    await expect(harness.service.setPaused(true, 'tray')).resolves.toMatchObject({ paused: true });
    expect(harness.recordControl).toHaveBeenCalledWith(expect.objectContaining({
      category: 'runtime', event: 'paused', details: { paused: true, source: 'tray' },
    }));
    expect(JSON.parse(readFileSync(harness.file, 'utf8'))).toMatchObject({ paused: true });
    expect(existsSync(`${harness.file}.tmp`)).toBe(false);

    const restored = createMorpheusRuntimeControl({
      userDataDir: harness.userDataDir,
      audit: { recordControl: vi.fn() } as never,
      appVersion: '1.0.0',
    });
    expect(restored.snapshot().paused).toBe(true);
  });

  it('does not change state or disk when audit persistence rejects', async () => {
    const harness = setup(vi.fn(async () => { throw new Error('audit unavailable'); }));
    await expect(harness.service.setPaused(true, 'settings')).rejects.toThrow(/audit unavailable/);
    expect(harness.service.snapshot().paused).toBe(false);
    expect(existsSync(harness.file)).toBe(false);
  });

  it('ignores malformed persisted state instead of accepting widened control data', () => {
    const harness = setup();
    mkdirSync(join(harness.userDataDir, 'morpheus'), { recursive: true });
    writeFileSync(harness.file, JSON.stringify({ v: 1, paused: 'yes', shell: 'powershell' }), 'utf8');
    const restored = createMorpheusRuntimeControl({
      userDataDir: harness.userDataDir,
      audit: { recordControl: vi.fn() } as never,
      appVersion: '1.0.0',
      now: () => new Date('2026-08-11T10:00:00.000Z'),
    });
    expect(restored.snapshot()).toEqual({
      v: 1, paused: false, updatedAt: '2026-08-11T10:00:00.000Z',
    });
  });
});
