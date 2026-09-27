/** Allowlisted provider units only. Missing units never imply zero usage. */
export type MorpheusUsageCounts = {
  usageStatus: 'reported' | 'missing';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export function morpheusUsageCounts(payload: unknown): MorpheusUsageCounts {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { usageStatus: 'missing' };
  const body = payload as Record<string, unknown>;
  const raw = body.usage ?? body.usageMetadata;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { usageStatus: 'missing' };
  const usage = raw as Record<string, unknown>;
  const result: MorpheusUsageCounts = { usageStatus: 'missing' };
  const candidates = {
    inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount,
    outputTokens: usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount,
    totalTokens: usage.total_tokens ?? usage.totalTokenCount,
    cacheReadTokens: usage.cache_read_input_tokens ?? usage.cachedContentTokenCount,
    cacheWriteTokens: usage.cache_creation_input_tokens,
  };
  for (const key of Object.keys(candidates) as Array<keyof typeof candidates>) {
    const value = candidates[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      result[key] = value;
      result.usageStatus = 'reported';
    }
  }
  return result;
}
