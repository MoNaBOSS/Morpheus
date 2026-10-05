/** Main-owned task planning preferences; never a permission or provider default. */
import type { MorpheusContextItem } from './core/objective-types';

export type MorpheusPlannerAccountRoutes = {
  efficientModelId?: string;
  strongModelId?: string;
};

export type MorpheusPlannerRoutingPolicy = {
  mode: 'adaptive' | 'fixed';
  routes: Record<string, MorpheusPlannerAccountRoutes>;
};

export const DEFAULT_MORPHEUS_PLANNER_ROUTING: Readonly<MorpheusPlannerRoutingPolicy> = Object.freeze({
  mode: 'adaptive', routes: Object.freeze({}),
});

const POISONED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const validIdentifier = (value: unknown): value is string => typeof value === 'string'
  && value.trim().length > 0 && value.trim().length <= 200 && !/\s|\p{Cc}/u.test(value.trim());

export function isMorpheusPlannerRoutingPolicy(value: unknown): value is MorpheusPlannerRoutingPolicy {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'mode' && key !== 'routes')
    || (value.mode !== 'adaptive' && value.mode !== 'fixed') || !isRecord(value.routes)) return false;
  const entries = Object.entries(value.routes);
  if (entries.length > 64) return false;
  return entries.every(([accountId, route]) => validIdentifier(accountId) && accountId === accountId.trim()
    && !POISONED_KEYS.has(accountId) && isRecord(route)
    && Object.keys(route).every((key) => key === 'efficientModelId' || key === 'strongModelId')
    && (route.efficientModelId === undefined || validIdentifier(route.efficientModelId))
    && (route.strongModelId === undefined || validIdentifier(route.strongModelId)));
}

/** Corrupt/old persisted preferences fail to the saved-model route, never guessed models. */
export function normalizeMorpheusPlannerRoutingPolicy(value: unknown): MorpheusPlannerRoutingPolicy {
  if (!isMorpheusPlannerRoutingPolicy(value)) return { mode: 'adaptive', routes: {} };
  return {
    mode: value.mode,
    routes: Object.fromEntries(Object.entries(value.routes).map(([accountId, route]) => [accountId, {
      ...(route.efficientModelId ? { efficientModelId: route.efficientModelId.trim() } : {}),
      ...(route.strongModelId ? { strongModelId: route.strongModelId.trim() } : {}),
    }])),
  };
}

export type MorpheusPlanningComplexity = 'routine' | 'complex';
export type MorpheusPlanningRoutingContext = {
  objective: string;
  context?: readonly MorpheusContextItem[];
};

/**
 * A local scheduling hint, not a claim about a model's quality/price. Registered
 * direct commands have already bypassed this classifier. Only current objective
 * text and bounded provider-safe context size are considered; memory/page text
 * cannot instruct a route or broaden the existing capability authority.
 */
export function classifyMorpheusPlanningComplexity(input: MorpheusPlanningRoutingContext): MorpheusPlanningComplexity {
  const objective = input.objective.trim().slice(0, 8_000);
  if (objective.length > 600
    || /\b(?:research|investigate|analy[sz]e|compare|evaluate|strategy|architecture|debug|refactor|implement|build|develop|website|web\s+site|landing\s+page|workflow|multi[- ]step)\b/i.test(objective)
    || (objective.match(/\b(?:then|afterwards|and\s+(?:then|also))\b|[;\n]/gi)?.length ?? 0) >= 2) return 'complex';
  const safeContext = (input.context ?? []).filter((item) => item.sensitivity === 'normal').slice(0, 32);
  if (safeContext.reduce((size, item) => size + Math.min(item.text.length, 1_000), 0) > 4_000) return 'complex';
  return 'routine';
}
