import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusOnboardingStore } from '@electron/services/morpheus/onboarding/onboarding-store';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '@shared/morpheus/onboarding-types';
import * as storage from '@electron/services/morpheus/storage/atomic-json';

const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-arrival-'));
  roots.push(root);
  let stamp = new Date('2026-09-30T09:00:00');
  const now = () => stamp;
  const store = createMorpheusOnboardingStore({ userDataDir: root, now });
  store.complete({ ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, preferredName: 'Larry', permissionProfile: 'strict' });
  return { store, restart: () => createMorpheusOnboardingStore({ userDataDir: root, now }), at: (value: string) => { stamp = new Date(value); } };
}
describe('Main persisted greeting admission', () => {
  it('suppresses quick restart and admits at most one greeting each day after a real break', () => {
    const h = fixture();
    h.at('2026-09-30T10:00:00');
    expect(h.restart().admitGreeting(false).admitted).toBe(false);
    h.at('2026-09-30T12:00:00');
    expect(h.store.admitGreeting(false)).toEqual({ admitted: true, preferredName: 'Larry' });
    h.at('2026-09-30T18:00:00');
    expect(h.restart().admitGreeting(false).admitted).toBe(false);
    h.at('2026-10-01T09:00:00');
    expect(h.restart().admitGreeting(false).admitted).toBe(true);
  });
  it('quiet policy neither greets nor consumes future eligibility', () => {
    const h = fixture(); h.at('2026-09-30T12:00:00');
    expect(h.store.admitGreeting(true).admitted).toBe(false);
    expect(h.store.status().arrival).toBeUndefined();
    expect(h.store.admitGreeting(false).admitted).toBe(true);
  });
  it('midnight and active interaction cannot cause a greeting', () => {
    const h = fixture(); h.at('2026-09-30T23:59:00'); h.store.noteInteraction();
    h.at('2026-10-01T00:01:00');
    expect(h.restart().admitGreeting(false).admitted).toBe(false);
    h.at('2026-10-01T03:00:00');
    expect(h.restart().admitGreeting(true).admitted).toBe(false);
    expect(h.restart().admitGreeting(false).admitted).toBe(true);
  });
  it('preserves completed profile and permission choices while recording only timestamps', () => {
    const h = fixture(); const before = h.store.status(); h.store.noteInteraction();
    expect(h.restart().status()).toMatchObject({ preferences: before.preferences, completedAt: before.completedAt, completed: true });
    expect(h.store.status().arrival).toEqual({ lastInteractionAt: new Date('2026-09-30T09:00:00').toISOString() });
  });
  it('fails closed and rolls back admission if persistence fails', () => {
    const h = fixture(); h.at('2026-09-30T12:00:00');
    vi.spyOn(storage, 'writeJsonAtomically').mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(() => h.store.admitGreeting(false)).toThrow('disk full');
    expect(h.store.status().arrival).toBeUndefined();
    expect(h.store.admitGreeting(false).admitted).toBe(true);
  });
});
