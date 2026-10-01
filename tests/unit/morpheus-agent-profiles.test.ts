import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { MORPHEUS_STARTER_AGENT_PROFILES } from '../../shared/morpheus/agents/registry';
import { getMorpheusActionDescriptor } from '../../shared/morpheus/actions/registry';
import { createMorpheusAgentProfileStore } from '../../electron/services/morpheus/agents/profile-store';
import { upgradeUntouchedStarter } from '../../electron/services/morpheus/agents/starter-upgrade';
import type { MorpheusAgentProfile } from '../../shared/morpheus/agent-profile-types';

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
  it.each(MORPHEUS_STARTER_AGENT_PROFILES.map((profile) => [profile.profileId, profile] as const))('upgrades exact historical %s defaults without rewriting disk', (_id, starter) => {
    const root = temporaryRoot();
    const previous: MorpheusAgentProfile = { ...structuredClone(starter), permissionBoundary: { ...starter.permissionBoundary,
      capabilityIds: starter.permissionBoundary.capabilityIds.filter((id) => !['web.readPage', 'browser.inspect', 'browser.interact', 'site.revise', 'site.rollback', 'site.createInteractive'].includes(id)) } };
    mkdirSync(join(root, 'morpheus'), { recursive: true });
    const file = join(root, 'morpheus', 'agent-profiles.json');
    const original = JSON.stringify({ v: 1, profiles: [previous] }); writeFileSync(file, original);
    const store = createMorpheusAgentProfileStore({ userDataDir: root });
    expect(store.get(starter.profileId)).toEqual(starter);
    expect(readFileSync(file, 'utf8')).toBe(original);
    expect(createMorpheusAgentProfileStore({ userDataDir: root }).get(starter.profileId)).toEqual(starter);
  });

  it('upgrades the original deterministic default but preserves a deliberate offline planner', () => {
    const starter = MORPHEUS_STARTER_AGENT_PROFILES[0];
    const original: MorpheusAgentProfile = { ...structuredClone(starter), planner: { kind: 'deterministic' }, permissionBoundary: { ...starter.permissionBoundary,
      capabilityIds: starter.permissionBoundary.capabilityIds.filter((id) => !['system.processes', 'file.create', 'reminder.schedule', 'site.verify', 'web.readPage', 'browser.inspect', 'browser.interact', 'site.revise', 'site.rollback', 'site.createInteractive'].includes(id)) } };
    expect(upgradeUntouchedStarter(original, starter)).toEqual(starter);
    const customized = { ...original, updatedAt: '2026-10-01T00:00:00.000Z' };
    const root = temporaryRoot(); mkdirSync(join(root, 'morpheus'), { recursive: true });
    writeFileSync(join(root, 'morpheus', 'agent-profiles.json'), JSON.stringify({ v: 1, profiles: [customized] }));
    expect(createMorpheusAgentProfileStore({ userDataDir: root }).get('general')).toEqual(customized);
  });

  it('does not widen any customized or unknown profile variant', () => {
    const starter = MORPHEUS_STARTER_AGENT_PROFILES[0];
    const previous = { ...structuredClone(starter), permissionBoundary: { ...starter.permissionBoundary,
      capabilityIds: starter.permissionBoundary.capabilityIds.filter((id) => id !== 'site.createInteractive') } };
    const variants: MorpheusAgentProfile[] = [
      { ...previous, name: 'My agent' }, { ...previous, instructions: 'Keep my rules' }, { ...previous, enabled: false },
      { ...previous, planner: { kind: 'deterministic' } }, { ...previous, planner: { kind: 'openclaw', agentId: 'my-existing-agent' } },
      { ...previous, memory: { mode: 'none', maxContextItems: 0 } }, { ...previous, workspace: { rootKey: 'morpheusFiles', access: 'read' } },
      { ...previous, updatedAt: '2026-10-01T00:00:00.000Z' }, { ...previous, builtIn: false },
      { ...previous, permissionBoundary: { ...previous.permissionBoundary, capabilityIds: ['system.report'] } },
      { ...previous, permissionBoundary: { ...previous.permissionBoundary, capabilityIds: previous.permissionBoundary.capabilityIds.filter((id) => id !== 'screen.capture') } },
      { ...previous, futureSetting: true } as MorpheusAgentProfile,
    ];
    for (const profile of variants) expect(upgradeUntouchedStarter(profile, starter)).toBe(profile);
  });
  it('ships three distinct, non-destructive starter profiles', () => {
    expect(MORPHEUS_STARTER_AGENT_PROFILES.map((profile) => profile.profileId)).toEqual([
      'general', 'research', 'developer',
    ]);
    for (const profile of MORPHEUS_STARTER_AGENT_PROFILES) {
      expect(profile.planner.kind).toBe('auto');
      expect(profile.permissionBoundary.capabilityIds.length).toBeGreaterThan(0);
      expect(profile.permissionBoundary.capabilityIds).not.toContain('file.delete');
      for (const capabilityId of profile.permissionBoundary.capabilityIds) {
        expect(getMorpheusActionDescriptor(capabilityId).riskTier).not.toBe('critical');
      }
    }
    expect(MORPHEUS_STARTER_AGENT_PROFILES.find((profile) => profile.profileId === 'general')
      ?.permissionBoundary.capabilityIds).toContain('system.processes');
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
