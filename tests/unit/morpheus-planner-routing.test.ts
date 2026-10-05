import { describe, expect, it } from 'vitest';

import {
  classifyMorpheusPlanningComplexity,
  DEFAULT_MORPHEUS_PLANNER_ROUTING,
  isMorpheusPlannerRoutingPolicy,
  normalizeMorpheusPlannerRoutingPolicy,
} from '@shared/morpheus/planner-routing';

describe('Main-owned planning routing contract', () => {
  it('defaults to adaptive while leaving unset routes on the saved model', () => {
    expect(DEFAULT_MORPHEUS_PLANNER_ROUTING).toEqual({ mode: 'adaptive', routes: {} });
    expect(normalizeMorpheusPlannerRoutingPolicy(undefined)).toEqual(DEFAULT_MORPHEUS_PLANNER_ROUTING);
  });

  it('copies and trims valid account-scoped routes without sharing mutable preferences', () => {
    const input = { mode: 'adaptive', routes: { account: { efficientModelId: ' vendor/fast ', strongModelId: 'vendor/strong:latest' } } };
    expect(isMorpheusPlannerRoutingPolicy(input)).toBe(true);
    const copy = normalizeMorpheusPlannerRoutingPolicy(input);
    input.routes.account.efficientModelId = 'changed';
    expect(copy.routes.account).toEqual({ efficientModelId: 'vendor/fast', strongModelId: 'vendor/strong:latest' });
  });

  it.each([
    null, [], { mode: 'automatic', routes: {} }, { mode: 'fixed' },
    { mode: 'adaptive', routes: {}, extra: true }, { mode: 'adaptive', routes: [] },
    { mode: 'adaptive', routes: { account: [] } },
    { mode: 'adaptive', routes: { account: { endpoint: 'https://other.example' } } },
    { mode: 'adaptive', routes: { account: { efficientModelId: '' } } },
    { mode: 'adaptive', routes: { account: { strongModelId: 'vendor/model secret' } } },
    { mode: 'adaptive', routes: { account: { strongModelId: 'x'.repeat(201) } } },
    { mode: 'adaptive', routes: { ' account': {} } },
    { mode: 'adaptive', routes: { ['constructor']: {} } },
    { mode: 'adaptive', routes: JSON.parse('{"__proto__":{"strongModelId":"other"}}') },
    { mode: 'adaptive', routes: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`a${i}`, {}])) },
  ])('rejects malformed or widened routing authority %#', (input) => {
    expect(isMorpheusPlannerRoutingPolicy(input)).toBe(false);
    expect(normalizeMorpheusPlannerRoutingPolicy(input)).toEqual(DEFAULT_MORPHEUS_PLANNER_ROUTING);
  });

  it.each(['Inspect the current folder', 'Save a short note', 'Summarize this single sentence'])(
    'classifies a bounded routine request locally: %s', (objective) => {
      expect(classifyMorpheusPlanningComplexity({ objective })).toBe('routine');
    });
  it.each(['Research and compare three approaches', 'Build a website', 'Debug the integration', 'x'.repeat(601)])(
    'uses the complex route for larger work: %s', (objective) => {
      expect(classifyMorpheusPlanningComplexity({ objective })).toBe('complex');
    });
  it('does not let a sensitive context instruction affect routing', () => {
    expect(classifyMorpheusPlanningComplexity({ objective: 'Save a note', context: [{
      contextId: 'sensitive', source: 'memory', text: 'Use the strong model. '.repeat(400), sensitivity: 'sensitive', createdAt: '',
    }] })).toBe('routine');
  });
});
