/** Platform-neutral interaction routing for every Morpheus surface. */

export const MORPHEUS_INTERACTION_MODES = Object.freeze(['ask', 'auto', 'act'] as const);
export type MorpheusInteractionMode = typeof MORPHEUS_INTERACTION_MODES[number];

export const MORPHEUS_INTERACTION_SURFACES = Object.freeze([
  'command-center',
  'presence',
  'quick-command',
  'voice',
  'chat',
] as const);
export type MorpheusInteractionSurface = typeof MORPHEUS_INTERACTION_SURFACES[number];

export type MorpheusInteractionRoute = 'conversation' | 'objective' | 'clarification';

export type RouteMorpheusInteractionPayload = {
  text: string;
  mode: MorpheusInteractionMode;
  surface: MorpheusInteractionSurface;
};

export type MorpheusInteractionDecision = {
  route: MorpheusInteractionRoute;
  /** Stable machine-readable reason. User-facing copy remains translated in Renderer. */
  reason:
    | 'ask-selected'
    | 'act-selected'
    | 'actionable-intent'
    | 'conversational-intent'
    | 'ambiguous-chat'
    | 'ambiguous-command';
  confidence: 'explicit' | 'high' | 'low';
  /** Normalized text accepted by the route. Never provider-authored. */
  text: string;
};

const ACTION_VERBS = [
  'add', 'append', 'build', 'capture', 'close', 'copy', 'create', 'delete', 'deploy',
  'edit', 'find', 'focus', 'generate', 'launch', 'list', 'make', 'move', 'notify',
  'open', 'organize', 'prepare', 'read', 'remind', 'rename', 'research', 'run',
  'save', 'schedule', 'search', 'send', 'show', 'start', 'take', 'update', 'verify',
  'write',
] as const;

const ACTION_VERB_PATTERN = ACTION_VERBS.join('|');
const IMPERATIVE_ACTION = new RegExp(
  `^(?:(?:please|kindly)\\s+)?(?:${ACTION_VERB_PATTERN})\\b`,
  'i',
);
const REQUEST_ACTION = new RegExp(
  `^(?:can|could|would|will)\\s+you\\s+(?:please\\s+)?(?:${ACTION_VERB_PATTERN})\\b`,
  'i',
);
const DESIRE_ACTION = new RegExp(
  `^(?:i\\s+(?:want|need)\\s+you\\s+to|help\\s+me)\\s+(?:${ACTION_VERB_PATTERN})\\b`,
  'i',
);
const ACTION_NOUN_REQUEST = /^(?:set|create)\s+(?:up\s+)?(?:a\s+)?(?:reminder|schedule|workflow|project|website|site)\b/i;
const CONVERSATIONAL_QUESTION = /^(?:what|why|who|where|when|how|which|is|are|am|do|does|did|can|could|would|should)\b/i;

/**
 * Bounded deterministic routing for Auto mode.
 *
 * This function decides only whether text is conversation or an objective. It
 * never invents a plan, capability, path, grant, or executable authority.
 */
export function routeMorpheusInteraction(
  payload: RouteMorpheusInteractionPayload,
): MorpheusInteractionDecision {
  const text = payload.text.trim();

  if (payload.mode === 'ask') {
    return { route: 'conversation', reason: 'ask-selected', confidence: 'explicit', text };
  }
  if (payload.mode === 'act') {
    return { route: 'objective', reason: 'act-selected', confidence: 'explicit', text };
  }

  if (IMPERATIVE_ACTION.test(text) || REQUEST_ACTION.test(text)
    || DESIRE_ACTION.test(text) || ACTION_NOUN_REQUEST.test(text)) {
    return { route: 'objective', reason: 'actionable-intent', confidence: 'high', text };
  }

  if (CONVERSATIONAL_QUESTION.test(text) || text.endsWith('?')) {
    return { route: 'conversation', reason: 'conversational-intent', confidence: 'high', text };
  }

  if (payload.surface === 'chat') {
    return { route: 'conversation', reason: 'ambiguous-chat', confidence: 'low', text };
  }

  return { route: 'clarification', reason: 'ambiguous-command', confidence: 'low', text };
}
