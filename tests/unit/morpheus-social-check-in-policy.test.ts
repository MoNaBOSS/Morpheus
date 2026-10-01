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
  const root = mkdtempSync(join(tmpdir(), 'morpheus-social-')); roots.push(root);
  let stamp = new Date('2026-09-01T09:00:00Z');
  const now = () => stamp;
  let store = createMorpheusOnboardingStore({ userDataDir: root, now });
  store.complete({ ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, preferredName: 'Larry', permissionProfile: 'strict' });
  return { get store() { return store; }, at: (date: string) => { stamp = new Date(date); },
    restart: () => { store = createMorpheusOnboardingStore({ userDataDir: root, now }); } };
}
describe('Main persisted social invitation policy', () => {
  it('honors idle and quiet admission without consuming eligibility', () => {
    const h = fixture(); h.at('2026-09-01T09:29:00Z');
    expect(h.store.socialCheckInDue(false)).toBe(false);
    h.at('2026-09-01T09:30:00Z');
    expect(h.store.socialCheckInDue(true)).toBe(false);
    expect(h.store.status().socialCheckIn).toBeUndefined();
    expect(h.store.socialCheckInDue(false)).toBe(true);
    h.store.updateProfile({ proactivityLevel: 'quiet' });
    expect(h.store.socialCheckInDue(false)).toBe(false);
  });
  it('backs off 1→2→4→7 days after ignored invitations across restarts', () => {
    const h = fixture(); h.at('2026-09-01T10:00:00Z');
    expect(h.store.admitSocialCheckIn('social-first')).toEqual({ admitted: true, invitationId: 'social-first' });
    h.restart(); expect(h.store.socialCheckInDue(false)).toBe(false);
    h.at('2026-09-02T10:00:00Z'); h.restart();
    expect(h.store.socialCheckInDue(false)).toBe(false);
    expect(h.store.status().socialCheckIn?.ignoredStreak).toBe(1);
    h.at('2026-09-03T10:00:00Z'); expect(h.store.socialCheckInDue(false)).toBe(true);
    h.store.admitSocialCheckIn('social-second'); h.store.dismissSocialCheckIn('social-second');
    h.at('2026-09-06T10:00:00Z'); h.restart(); expect(h.store.socialCheckInDue(false)).toBe(false);
    h.at('2026-09-07T10:00:00Z'); expect(h.store.socialCheckInDue(false)).toBe(true);
    h.store.admitSocialCheckIn('social-third'); h.store.dismissSocialCheckIn('social-third');
    h.at('2026-09-13T10:00:00Z'); h.restart(); expect(h.store.socialCheckInDue(false)).toBe(false);
    h.at('2026-09-14T10:00:00Z'); expect(h.store.socialCheckInDue(false)).toBe(true);
    expect(h.store.status().preferences.permissionProfile).toBe('strict');
  });
  it('meaningful user interaction clears ignores and pending prompt but keeps daily cooldown', () => {
    const h = fixture(); h.at('2026-09-01T10:00:00Z'); h.store.admitSocialCheckIn('social-one');
    h.store.dismissSocialCheckIn('social-one');
    expect(h.store.status().socialCheckIn?.ignoredStreak).toBe(1);
    h.store.noteInteraction(); h.restart();
    expect(h.store.status().socialCheckIn).toMatchObject({ ignoredStreak: 0 });
    expect(h.store.dismissSocialCheckIn('social-one')).toBe(false);
    h.at('2026-09-02T10:00:00Z'); expect(h.store.socialCheckInDue(false)).toBe(true);
  });
  it('counts expiration once and rolls back failed disk persistence', () => {
    const h = fixture(); h.at('2026-09-01T10:00:00Z');
    vi.spyOn(storage, 'writeJsonAtomically').mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(() => h.store.admitSocialCheckIn('social-fail')).toThrow('disk full');
    expect(h.store.status().socialCheckIn).toBeUndefined();
    h.store.admitSocialCheckIn('social-good'); h.at('2026-09-01T10:01:00Z');
    h.store.socialCheckInDue(false); h.store.socialCheckInDue(false); h.restart();
    expect(h.store.status().socialCheckIn?.ignoredStreak).toBe(1);
    expect(JSON.stringify(h.store.status().socialCheckIn)).not.toMatch(/mood|emotion|Larry/);
  });
});
