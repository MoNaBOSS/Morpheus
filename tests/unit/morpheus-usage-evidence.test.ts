import { describe, expect, it } from 'vitest';
import { morpheusUsageCounts } from '@shared/morpheus/usage-evidence';

describe('provider usage evidence', () => {
  it('preserves missing usage instead of inventing zero', () => {
    for (const input of [null, [], {}, { usage: {} }, { usage: { input_tokens: 'secret', total_tokens: -1, output_tokens: Infinity } }]) {
      expect(morpheusUsageCounts(input)).toEqual({ usageStatus: 'missing' });
    }
  });
  it('preserves explicit zero and cache counters without guessing a total or cost', () => {
    expect(morpheusUsageCounts({ usage: { input_tokens: 0, cache_read_input_tokens: 4, cache_creation_input_tokens: 2,
      cost: 123, secret: 'private', content: 'private' } })).toEqual({ usageStatus: 'reported', inputTokens: 0, cacheReadTokens: 4, cacheWriteTokens: 2 });
    expect(morpheusUsageCounts({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 20 } })).toEqual({ usageStatus: 'reported', inputTokens: 10, outputTokens: 5, totalTokens: 20 });
  });
});
