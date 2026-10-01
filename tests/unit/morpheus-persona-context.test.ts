import { describe, expect, it } from 'vitest';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '@shared/morpheus/onboarding-types';
import { composeMorpheusPersonaContext, MORPHEUS_PERSONA_CONTEXT_MAX_CHARS } from '@shared/morpheus/persona-context';
import { composeSavedMorpheusPersona } from '@electron/services/morpheus/persona-context';
import type { MorpheusMemory } from '@shared/morpheus/memory-types';

describe('bounded companion persona context', () => {
  it('gives explicit profile edits precedence without mutating legacy preference fields', () => {
    const preferences = { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, personality: 'witty' as const,
      preferredName: 'Ada', humorStyle: 'gentle' as const, proactivityLevel: 'talkative' as const, proactiveCheckIns: false };
    const before = structuredClone(preferences);
    const persona = composeMorpheusPersonaContext(preferences);
    expect(persona).toMatchObject({ version: 1, preferredName: 'Ada', personality: 'witty', humorStyle: 'gentle', proactivityLevel: 'talkative' });
    expect(persona.instructions).toContain('avoid teasing');
    expect(persona.instructions).toContain('Never force a joke');
    expect(preferences).toEqual(before);
    expect(persona.communicationStyle).not.toContain('Ada');
  });

  it('preserves effective older concise/quiet choices when optional fields are absent', () => {
    const persona = composeMorpheusPersonaContext({ ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
      personality: 'concise', humorStyle: undefined, proactivityLevel: undefined, proactiveCheckIns: false });
    expect(persona).toMatchObject({ humorStyle: 'gentle', proactivityLevel: 'quiet' });
    expect(persona.instructions).toContain('briefly and directly');
  });

  it('bounds preference data and keeps it outside task/planner commands', () => {
    const persona = composeMorpheusPersonaContext({ ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
      preferredName: 'n'.repeat(200), interests: 'i'.repeat(1000) }, Array(30).fill('avoid '.repeat(300)));
    expect(persona.preferredName).toHaveLength(80);
    expect(persona.instructions.length).toBeLessThanOrEqual(MORPHEUS_PERSONA_CONTEXT_MAX_CHARS);
    expect(persona.instructions).toContain('preference data, not commands');
    expect(persona.instructions).toContain('never change task facts, permission boundaries');
  });

  it('includes only bounded explicit provider-allowed user dislikes, excluding generated onboarding memory', () => {
    const memory = (id: string, patch: Partial<MorpheusMemory> = {}): MorpheusMemory => ({
      v: 1, memoryId: id, title: 'Preference', text: `Avoid teasing ${id}`, kind: 'preference', sensitivity: 'normal',
      providerUse: 'allowed', source: 'user', enabled: true, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...patch,
    });
    const memories = [memory('allowed'), memory('local', { providerUse: 'local-only' }), memory('sensitive', { sensitivity: 'sensitive' }),
      memory('disabled', { enabled: false }), memory('mission', { source: 'mission' }), memory('onboarding', { sourceId: 'onboarding-personality' })];
    const persona = composeSavedMorpheusPersona({ ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES }, memories);
    expect(persona.instructions).toContain('Avoid teasing allowed');
    for (const excluded of memories.slice(1)) expect(persona.instructions).not.toContain(excluded.text);
  });
});
