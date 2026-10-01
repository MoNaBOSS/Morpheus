import { isDeepStrictEqual } from 'node:util';
import type { MorpheusAgentProfile } from '@shared/morpheus/agent-profile-types';
import type { MorpheusActionId } from '@shared/morpheus/actions/registry';

/** Known released defaults, checked against Git history. A name/builtIn flag or
 * subset of capabilities alone is NEVER sufficient to expand a saved boundary.
 * Full equality also checks instructions, timestamps, planner and unknown fields.
 * No profile file or grant is written while reading. */
export function upgradeUntouchedStarter(stored: MorpheusAgentProfile, starter: MorpheusAgentProfile): MorpheusAgentProfile {
  const without = (profile: MorpheusAgentProfile, ids: readonly MorpheusActionId[]): MorpheusAgentProfile => ({
    ...profile, permissionBoundary: { ...profile.permissionBoundary, capabilityIds: profile.permissionBoundary.capabilityIds.filter((id) => !ids.includes(id)) },
  });
  const preF2 = without(starter, ['app.controlWindow', 'media.control', 'audio.setVolume']);
  const preE2 = without(preF2, ['site.createInteractive']);
  const preD2 = without(preE2, ['browser.inspect', 'browser.interact']);
  const prePhase7 = without(preD2, ['web.readPage', 'site.revise', 'site.rollback']);
  const windowsFoundation = without(prePhase7, ['file.create', 'reminder.schedule', 'site.verify']);
  const firstAuto = starter.profileId === 'general' ? without(windowsFoundation, ['system.processes']) : windowsFoundation;
  const original: MorpheusAgentProfile = { ...firstAuto, planner: { kind: 'deterministic' } };
  return [preF2, preE2, preD2, prePhase7, windowsFoundation, firstAuto, original].some((candidate) => isDeepStrictEqual(stored, candidate))
    ? structuredClone(starter) : stored;
}
