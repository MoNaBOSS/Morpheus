import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { MORPHEUS_STARTER_AGENT_PROFILES } from '../../shared/morpheus/agents/registry';
import { getMorpheusActionDescriptor } from '../../shared/morpheus/actions/registry';
import { createMorpheusAgentProfileStore } from '../../electron/services/morpheus/agents/profile-store';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-agents-'));
  roots.push(root);
  return root;
}

describe('Morpheus Agent Profiles', () => {
  it('ships three distinct, non-destructive starter profiles', () => {
    expect(MORPHEUS_STARTER_AGENT_PROFILES.map((profile) => profile.profileId)).toEqual([
      'general', 'research', 'developer',
    ]);
    for (const profile of MORPHEUS_STARTER_AGENT_PROFILES) {
      expect(profile.planner.kind).toBe('deterministic');
      expect(profile.permissionBoundary.capabilityIds.length).toBeGreaterThan(0);
      expect(profile.permissionBoundary.capabilityIds).not.toContain('file.delete');
      for (const capabilityId of profile.permissionBoundary.capabilityIds) {
        expect(getMorpheusActionDescriptor(capabilityId).riskTier).not.toBe('critical');
      }
    }
  });

  it('falls back safely from corrupt persistent state and atomically persists an update', () => {
    const root = temporaryRoot();
    mkdirSync(join(root, 'morpheus'), { recursive: true });
    writeFileSync(join(root, 'morpheus', 'agent-profiles.json'), '{broken', 'utf8');
    const store = createMorpheusAgentProfileStore({ userDataDir: root });
    expect(store.list().profiles).toHaveLength(3);

    const general = store.get('general')!;
    store.save({ ...general, enabled: false, updatedAt: '2026-08-10T01:00:00.000Z' });
    const disk = JSON.parse(readFileSync(join(root, 'morpheus', 'agent-profiles.json'), 'utf8'));
    expect(disk.profiles.find((profile: { profileId: string }) => profile.profileId === 'general').enabled).toBe(false);
    expect(() => readFileSync(join(root, 'morpheus', 'agent-profiles.json.tmp'), 'utf8')).toThrow();
  });
});

