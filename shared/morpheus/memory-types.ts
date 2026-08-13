/** Explicit, inspectable durable memory. */
export const MORPHEUS_MEMORY_VERSION = 1 as const;

export type MorpheusMemoryKind = 'preference' | 'project-context' | 'routine' | 'decision';
export type MorpheusMemorySensitivity = 'normal' | 'sensitive';
export type MorpheusMemoryProviderUse = 'allowed' | 'local-only';
export type MorpheusMemorySource = 'user' | 'mission';

export type MorpheusMemory = {
  v: typeof MORPHEUS_MEMORY_VERSION;
  memoryId: string;
  title: string;
  text: string;
  kind: MorpheusMemoryKind;
  sensitivity: MorpheusMemorySensitivity;
  providerUse: MorpheusMemoryProviderUse;
  source: MorpheusMemorySource;
  projectId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MorpheusMemoryDraft = Pick<
  MorpheusMemory,
  'title' | 'text' | 'kind' | 'sensitivity' | 'providerUse' | 'enabled'
> & { memoryId?: string; projectId?: string };

export type MorpheusMemorySnapshot = { memories: readonly MorpheusMemory[] };
export type MorpheusMemoryIdPayload = { memoryId: string };
export type MorpheusMemoryResult = { memory: MorpheusMemory | null };

export function isMorpheusMemoryId(value: unknown): value is string {
  return typeof value === 'string' && /^memory-[a-z0-9][a-z0-9-]{0,95}$/i.test(value);
}
