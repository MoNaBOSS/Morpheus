import type { MorpheusMemory } from '@shared/morpheus/memory-types';
import { composeMorpheusPersonaContext } from '@shared/morpheus/persona-context';
import type { MorpheusOnboardingPreferences } from '@shared/morpheus/onboarding-types';

/** Only explicit user preferences already allowed for provider use leave Main. */
export function composeSavedMorpheusPersona(preferences: MorpheusOnboardingPreferences, memories: readonly MorpheusMemory[]) {
  const dislikes = memories.filter((entry) => entry.enabled && entry.kind === 'preference'
    && (!entry.projectId || entry.projectId === 'personal')
    && !entry.sourceId?.startsWith('onboarding-')
    && entry.source === 'user' && entry.sensitivity === 'normal' && entry.providerUse === 'allowed'
    && /\b(?:dislike|avoid|do not|don't)\b/i.test(entry.text))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.memoryId.localeCompare(b.memoryId))
    .slice(0, 3).map((entry) => entry.text);
  return composeMorpheusPersonaContext(preferences, dislikes);
}
